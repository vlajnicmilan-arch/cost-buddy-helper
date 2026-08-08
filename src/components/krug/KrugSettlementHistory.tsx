/**
 * Collapsed povijest podmirenja. Voidani zapisi prekriženi.
 * Poništi otvara prompt za razlog.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, History, ArrowRight, X, Loader2 } from 'lucide-react';
import { useKrugSettlementLedger, useKrugVoidSettlement } from '@/hooks/useKrugSettlementMutations';
import { useUserProfiles } from '@/hooks/useUserProfiles';
import { getMemberDisplayName } from '@/lib/krugDisplay';
import { useAuth } from '@/hooks/useAuth';

interface Props {
  krugId: string;
  isFullMember: boolean;
}

export function KrugSettlementHistory({ krugId, isFullMember }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const { data = [], isLoading } = useKrugSettlementLedger(krugId, isFullMember && open);
  const voidMut = useKrugVoidSettlement(krugId);

  const uids = Array.from(new Set(data.flatMap((r) => [r.from_user, r.to_user])));
  const profiles = useUserProfiles(uids);
  const nameFor = (uid: string) =>
    getMemberDisplayName(profiles.get(uid), uid, t('krug.member.unknown', 'Nepoznat član'));

  if (!isFullMember) return null;

  const handleVoid = async (id: string) => {
    const reason = window.prompt(t('krug.settle.history.voidPrompt', 'Razlog poništenja:'));
    if (!reason || !reason.trim()) return;
    try {
      await voidMut.mutateAsync({ ledgerId: id, reason: reason.trim() });
    } catch { /* handled */ }
  };

  return (
    <section className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 text-sm font-medium text-module-muted"
      >
        <span className="flex items-center gap-2">
          <History className="w-4 h-4" />
          {t('krug.settle.history.title', 'Povijest podmirenja')}
        </span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {open && (
        <Card className="divide-y divide-border">
          {isLoading && (
            <div className="p-4 text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {t('common.loading', 'Učitavanje…')}
            </div>
          )}
          {!isLoading && data.length === 0 && (
            <div className="p-4 text-xs text-muted-foreground">
              {t('krug.settle.history.empty', 'Još nema zabilježenih podmirenja.')}
            </div>
          )}
          {data.map((r) => {
            const voided = !!r.voided_at;
            return (
              <div key={r.id} className="px-4 py-2.5 flex items-center justify-between gap-2 text-sm">
                <div className={`min-w-0 flex-1 ${voided ? 'line-through opacity-60' : ''}`}>
                  <div className="flex items-center gap-1.5 text-sm">
                    <span className="truncate">{nameFor(r.from_user)}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate font-medium">{nameFor(r.to_user)}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {new Date(r.marked_at).toLocaleDateString()} · {r.note || t('krug.settle.history.noNote', 'bez napomene')}
                  </div>
                  {voided && (
                    <div className="text-[11px] text-destructive">
                      {t('krug.settle.history.voidedLabel', 'Poništeno')}: {r.void_reason}
                    </div>
                  )}
                </div>
                <div className={`text-sm font-semibold tabular-nums shrink-0 ${voided ? 'line-through opacity-60' : ''}`}>
                  {Number(r.amount).toFixed(2)} {r.currency}
                </div>
                {/* Poništenje je zaštita obiju strana duga. */}
                {!voided && (user?.id === r.from_user || user?.id === r.to_user) && (
                  <Button
                    size="icon" variant="ghost" className="h-8 w-8 shrink-0"
                    disabled={voidMut.isPending}
                    onClick={() => handleVoid(r.id)}
                    aria-label={t('krug.settle.history.void', 'Poništi')}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            );
          })}
        </Card>
      )}
    </section>
  );
}
