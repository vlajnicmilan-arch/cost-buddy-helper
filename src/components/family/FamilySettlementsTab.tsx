import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, RefreshCw, Check, ArrowRight, Scale, FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useFamilySettlements } from '@/hooks/useFamilySettlements';
import { FamilySplitAuditTimeline } from './FamilySplitAuditTimeline';
import { supabase } from '@/integrations/supabase/client';
import { generateFamilySettlementPdf } from '@/lib/familySettlementPdf';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';

interface MemberRef {
  user_id: string;
  display_name?: string;
}

interface Props {
  groupId: string;
  members: MemberRef[];
  currentUserId?: string;
}

/**
 * "Tko kome duguje" tab. Reads + recomputes family_settlements for a period.
 */
export const FamilySettlementsTab = ({ groupId, members, currentUserId }: Props) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const {
    rows,
    loading,
    computing,
    periodStart,
    periodEnd,
    setPeriodStart,
    setPeriodEnd,
    recompute,
    markPaid,
  } = useFamilySettlements(groupId);

  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [noteValue, setNoteValue] = useState('');

  const memberName = useMemo(() => {
    const map: Record<string, string> = {};
    members.forEach((m) => {
      map[m.user_id] = m.display_name || t('family.unknownMember', 'Član');
    });
    return map;
  }, [members, t]);

  const pendingCount = rows.filter((r) => r.status === 'pending').length;

  const confirmPaid = (id: string) => {
    markPaid(id, noteValue || undefined);
    setNoteFor(null);
    setNoteValue('');
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Scale className="h-4 w-4 text-muted-foreground" />
        <h2 className="font-semibold">{t('family.split.settlements.title', 'Tko kome duguje')}</h2>
      </div>

      {/* Period selector */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">{t('family.split.settlements.from', 'Od')}</Label>
          <Input
            type="date"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
            className="h-9 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs">{t('family.split.settlements.to', 'Do')}</Label>
          <Input
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
            className="h-9 text-sm"
          />
        </div>
      </div>

      <div className="flex gap-2">
        <Button onClick={recompute} disabled={computing} className="flex-1 gap-1.5" variant="default">
          {computing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {t('family.split.settlements.recompute', 'Izračunaj saldo')}
        </Button>
        <Button
          onClick={async () => {
            try {
              const [snapRes, memberRes] = await Promise.all([
                supabase
                  .from('family_split_snapshots')
                  .select('member_user_id, shared_total, share_ratio, owed, paid, currency')
                  .eq('group_id', groupId)
                  .eq('period_start', periodStart)
                  .eq('period_end', periodEnd),
                supabase
                  .from('family_groups')
                  .select('name, currency')
                  .eq('id', groupId)
                  .maybeSingle(),
              ]);
              if (snapRes.error || memberRes.error) throw snapRes.error || memberRes.error;
              const groupName = memberRes.data?.name || 'Obitelj';
              const currency = memberRes.data?.currency || 'EUR';
              const memberMap = new Map(members.map((m) => [m.user_id, m.display_name || '?']));
              const memberRows = (snapRes.data || []).map((s: any) => ({
                user_id: s.member_user_id,
                display_name: memberMap.get(s.member_user_id) || '?',
                shared_total: Number(s.shared_total || 0),
                share_ratio: Number(s.share_ratio || 0),
                owed: Number(s.owed || 0),
                paid: Number(s.paid || 0),
              }));
              const settlementRows = rows.map((r) => ({
                debtor: memberMap.get(r.debtor_user_id) || '?',
                creditor: memberMap.get(r.creditor_user_id) || '?',
                amount: Number(r.amount || 0),
                status: r.status,
                paid_at: r.paid_at,
                note: r.note,
              }));
              await generateFamilySettlementPdf({
                groupName,
                periodStart,
                periodEnd,
                currency,
                members: memberRows,
                settlements: settlementRows,
              });
              showSuccess(t('family.split.settlements.exportPdf.success', 'PDF spreman'));
            } catch (e: any) {
              showError(e?.message || t('family.split.settlements.exportPdf.failed', 'Greška'));
            }
          }}
          variant="outline"
          className="gap-1.5"
          disabled={rows.length === 0}
        >
          <FileDown className="h-3.5 w-3.5" />
          {t('family.split.settlements.exportPdf.button', 'PDF')}
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          {t(
            'family.split.settlements.empty',
            'Nema obračuna za odabrano razdoblje. Klikni "Izračunaj saldo".'
          )}
        </p>
      ) : (
        <div className="space-y-2">
          {pendingCount === 0 && (
            <p className="text-xs text-center text-muted-foreground py-2">
              {t('family.split.settlements.allSettled', 'Sve plaćeno za ovo razdoblje 🎉')}
            </p>
          )}
          {rows.map((row) => {
            const debtor = memberName[row.debtor_user_id] || '?';
            const creditor = memberName[row.creditor_user_id] || '?';
            const isMine = row.debtor_user_id === currentUserId || row.creditor_user_id === currentUserId;
            const paid = row.status === 'paid';
            return (
              <div
                key={row.id}
                className={`p-3 rounded-lg border border-border/50 ${paid ? 'bg-muted/20 opacity-70' : 'bg-card'}`}
              >
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium truncate">{debtor}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="font-medium truncate">{creditor}</span>
                  <span className="ml-auto font-semibold shrink-0">{formatAmount(row.amount)}</span>
                </div>
                {row.note && (
                  <p className="text-[11px] text-muted-foreground mt-1 italic">{row.note}</p>
                )}
                <div className="flex items-center gap-2 mt-2">
                  {paid ? (
                    <Badge variant="secondary" className="gap-1">
                      <Check className="h-3 w-3" />
                      {t('family.split.settlements.paid', 'Plaćeno')}
                    </Badge>
                  ) : (
                    <>
                      {isMine && noteFor !== row.id && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setNoteFor(row.id)}
                          className="h-7 gap-1 text-xs"
                        >
                          <Check className="h-3 w-3" />
                          {t('family.split.settlements.markPaid', 'Označi plaćeno')}
                        </Button>
                      )}
                      {noteFor === row.id && (
                        <div className="flex items-center gap-2 flex-1">
                          <Input
                            value={noteValue}
                            onChange={(e) => setNoteValue(e.target.value)}
                            placeholder={t('family.split.settlements.notePh', 'Bilješka (opcionalno)')}
                            className="h-7 text-xs"
                          />
                          <Button size="sm" onClick={() => confirmPaid(row.id)} className="h-7 text-xs">
                            {t('family.split.settlements.confirm', 'Potvrdi')}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setNoteFor(null); setNoteValue(''); }} className="h-7 text-xs">
                            {t('family.cancel', 'Odustani')}
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}


      <FamilySplitAuditTimeline groupId={groupId} />

      <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
        {t(
          'family.split.settlements.disclaimer',
          'Obračun je informativan. Stvarna naplata se ne provodi; označavanje samo zatvara stavku.'
        )}
      </p>
    </section>
  );
};
