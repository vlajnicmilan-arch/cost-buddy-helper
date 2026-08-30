/**
 * KrugSettlementSettings — owner-only dialog za split mode, display currency
 * i (za proportional_income) unos težina po članu u `krug_income_ratio`.
 *
 * Faza A: minimalno & funkcionalno. Write ide direktno kroz RLS (owner-only).
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { useKrugMembers } from '@/hooks/useKrug';
import { useUserProfiles } from '@/hooks/useUserProfiles';
import { getMemberDisplayName } from '@/lib/krugDisplay';
import { Loader2 } from 'lucide-react';

interface Props {
  krugId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type Mode = 'equal' | 'proportional_income' | 'manual';

const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'HRK', 'PLN', 'CZK', 'HUF', 'RSD', 'BAM'];

export function KrugSettlementSettings({ krugId, open, onOpenChange }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>('equal');
  const [currency, setCurrency] = useState<string>('');
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const { data: members = [] } = useKrugMembers(krugId);
  const memberIds = members
    .filter((m) => m.kind === 'owner' || m.kind === 'punopravni')
    .map((m) => m.user_id);
  const profileMap = useUserProfiles(memberIds);

  const cfgQuery = useQuery({
    queryKey: ['krug', 'settlement-cfg', krugId],
    enabled: open,
    queryFn: async () => {
      const [{ data: krug }, { data: ratios }] = await Promise.all([
        supabase.from('krug').select('split_mode, settlement_currency').eq('id', krugId).maybeSingle(),
        (supabase as any).from('krug_income_ratio')
          .select('user_id, weight, effective_from')
          .eq('krug_id', krugId)
          .order('effective_from', { ascending: false }),
      ]);
      return { krug, ratios: (ratios ?? []) as { user_id: string; weight: number; effective_from: string }[] };
    },
  });

  useEffect(() => {
    if (cfgQuery.data?.krug) {
      setMode((cfgQuery.data.krug as any).split_mode ?? 'equal');
      setCurrency((cfgQuery.data.krug as any).settlement_currency ?? '');
    }
    if (cfgQuery.data?.ratios) {
      const latest: Record<string, string> = {};
      for (const r of cfgQuery.data.ratios) {
        if (!(r.user_id in latest)) latest[r.user_id] = String(r.weight);
      }
      setWeights(latest);
    }
  }, [cfgQuery.data]);

  const save = async () => {
    setSaving(true);
    try {
      const { error: krugErr } = await supabase
        .from('krug')
        .update({ split_mode: mode as any, settlement_currency: currency || null })
        .eq('id', krugId);
      if (krugErr) throw krugErr;

      if (mode === 'proportional_income') {
        // Insert new effective_from = today for members whose weight changed.
        const today = new Date().toISOString().slice(0, 10);
        const existing = new Map(
          (cfgQuery.data?.ratios ?? []).map((r) => [r.user_id, r.weight]),
        );
        const rows = memberIds
          .map((uid) => {
            const raw = weights[uid];
            const w = raw === undefined || raw === '' ? NaN : Number(raw);
            if (!Number.isFinite(w) || w < 0) return null;
            if (existing.get(uid) === w) return null;
            return { krug_id: krugId, user_id: uid, weight: w, effective_from: today };
          })
          .filter(Boolean) as any[];
        if (rows.length > 0) {
          const { error: rErr } = await (supabase as any)
            .from('krug_income_ratio')
            .upsert(rows, { onConflict: 'krug_id,user_id,effective_from' });
          if (rErr) throw rErr;
        }
      }

      showSuccess();
      qc.invalidateQueries({ queryKey: ['krug', 'settlement'] });
      qc.invalidateQueries({ queryKey: ['krug', 'settlement-cfg', krugId] });
      onOpenChange(false);
    } catch (e: any) {
      showError(e?.message || t('krug.settlement.settings.error', 'Spremanje nije uspjelo'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('krug.settlement.settings.title', 'Postavke razračuna')}</DialogTitle>
        </DialogHeader>

        {cfgQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> {t('common.loading', 'Učitavanje…')}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t('krug.settlement.settings.mode', 'Način podjele')}</Label>
              <Select value={mode === 'manual' ? 'equal' : mode} onValueChange={(v) => setMode(v as Mode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="equal">{t('krug.settlement.splitMode.equal', 'Jednako')}</SelectItem>
                  <SelectItem value="proportional_income">{t('krug.settlement.splitMode.proportional_income', 'Prema prihodima')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>{t('krug.settlement.displayCurrency', 'Valuta')}</Label>
              <Select value={currency || 'auto'} onValueChange={(v) => setCurrency(v === 'auto' ? '' : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">{t('krug.settlement.settings.autoCurrency', 'Auto (iz zajedničkog izvora)')}</SelectItem>
                  {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {mode === 'proportional_income' && (
              <div className="space-y-2">
                <Label>{t('krug.settlement.settings.weights', 'Omjeri prihoda po članu')}</Label>
                <p className="text-[11px] text-muted-foreground">
                  {t('krug.settlement.settings.weightsHint', 'Unesi bilo koje brojeve — sustav ih pretvara u omjere. Prazno = jednak udio.')}
                </p>
                <div className="space-y-1.5">
                  {memberIds.map((uid) => (
                    <div key={uid} className="flex items-center gap-2">
                      <span className="text-xs flex-1 truncate">
                        {getMemberDisplayName(profileMap.get(uid), uid, uid.slice(0, 6))}
                      </span>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        className="w-24 h-8"
                        value={weights[uid] ?? ''}
                        onChange={(e) => setWeights((w) => ({ ...w, [uid]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('common.cancel', 'Odustani')}
          </Button>
          <Button onClick={save} disabled={saving || cfgQuery.isLoading}>
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
            {t('common.save', 'Spremi')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
