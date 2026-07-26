/**
 * KrugSettlementSection — Faza A read-only preview.
 * BEZ write akcija. "Označi podmireno" je Faza B.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ChevronLeft, ChevronRight, Scale, ArrowRight, Info, Loader2, Settings2 } from 'lucide-react';
import { useKrugSettlement, currentMonthRange, shiftMonth } from '@/hooks/useKrugSettlement';
import { useUserProfiles } from '@/hooks/useUserProfiles';
import { getMemberDisplayName, getInitials } from '@/lib/krugDisplay';
import { KrugSettlementSettings } from './KrugSettlementSettings';
import { KrugSettleTransferDialog } from './KrugSettleTransferDialog';
import { KrugSettlementHistory } from './KrugSettlementHistory';


interface Props {
  krugId: string;
  isFullMember: boolean;
  isOwner?: boolean;
}

const fmt = (n: number, currency: string) =>
  new Intl.NumberFormat('hr-HR', { style: 'currency', currency, minimumFractionDigits: 2 }).format(n);

export function KrugSettlementSection({ krugId, isFullMember, isOwner = false }: Props) {
  const { t, i18n } = useTranslation();
  const [range, setRange] = useState(() => currentMonthRange());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settleTransfer, setSettleTransfer] = useState<null | {
    fromUser: string; toUser: string; amount: number; currency: string; fromName: string; toName: string;
  }>(null);


  const { data, isLoading, isError, error } = useKrugSettlement({
    krugId,
    periodStart: range.start,
    periodEnd: range.end,
    enabled: isFullMember,
  });

  const memberIds = useMemo(
    () => Array.from(new Set([
      ...(data?.members ?? []).map((m) => m.user_id),
      ...(data?.transfers ?? []).flatMap((tr) => [tr.from_user, tr.to_user]),
    ])),
    [data],
  );
  const profileMap = useUserProfiles(memberIds);

  const nameFor = (uid: string) =>
    getMemberDisplayName(profileMap.get(uid), uid, t('krug.member.unknown', 'Nepoznat član'));
  const initialsFor = (uid: string) => getInitials(profileMap.get(uid)?.display_name || '', uid);

  if (!isFullMember) return null;

  const periodLabel = new Intl.DateTimeFormat(i18n.language, { month: 'long', year: 'numeric' }).format(
    new Date(range.start + 'T00:00:00Z'),
  );

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium flex items-center gap-2 text-module-muted">
          <Scale className="w-4 h-4 text-module-muted" />
          {t('krug.settlement.title', 'Razračun')}
        </h3>
        <div className="flex items-center gap-1">
          {isOwner && (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => setSettingsOpen(true)}
              aria-label={t('krug.settlement.settings.title', 'Postavke razračuna')}
            >
              <Settings2 className="w-4 h-4" />
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => setRange((r) => shiftMonth(r, -1))}
            aria-label={t('krug.settlement.previous', 'Prethodni mjesec')}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-xs font-medium min-w-[120px] text-center capitalize">{periodLabel}</span>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => setRange((r) => shiftMonth(r, 1))}
            aria-label={t('krug.settlement.next', 'Sljedeći mjesec')}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {isLoading && (
        <Card className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          {t('common.loading', 'Učitavanje…')}
        </Card>
      )}

      {isError && (
        <Card className="p-4 text-sm text-destructive">
          {t('krug.settlement.error', 'Nije moguće izračunati razračun.')}
          {process.env.NODE_ENV !== 'production' && (
            <div className="text-[10px] mt-1 opacity-70">{String((error as Error)?.message)}</div>
          )}
        </Card>
      )}

      {data && !isLoading && (
        <>
          {/* Info banner */}
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            <Badge variant="outline" className="border-module text-module bg-transparent">
              {t(`krug.settlement.splitMode.${data.split_mode}`, data.split_mode)}
            </Badge>
            <Badge variant="outline">
              {t('krug.settlement.displayCurrency', 'Valuta')}: {data.display_currency}
            </Badge>
            {data.flags.mixed_currencies && (
              <Badge variant="outline" className="border-amber-500/50 text-amber-600 dark:text-amber-400">
                {t('krug.settlement.mixedCurrenciesNotice', 'Više valuta — FX konverzija')}
              </Badge>
            )}
          </div>

          {data.flags.manual_mode_fallback_equal && (
            <Card className="p-3 text-[11px] text-muted-foreground flex items-start gap-2">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              {t(
                'krug.settlement.manualFallbackNotice',
                'Manual mod: u ovoj fazi dijeli jednako. Per-transakciju override dolazi u sljedećoj fazi.',
              )}
            </Card>
          )}
          {data.flags.missing_income_data && (
            <Card className="p-3 text-[11px] text-muted-foreground flex items-start gap-2">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              {t(
                'krug.settlement.missingIncomeNotice',
                'Nedostaju omjeri prihoda za dio članova — koristim jednake udjele.',
              )}
            </Card>
          )}

          {/* Members table */}
          <Card className="divide-y divide-border">
            {(data.members ?? []).length === 0 && (
              <div className="p-4 text-xs text-muted-foreground">
                {t('krug.settlement.empty', 'Nema potvrđenih zajedničkih troškova u ovom periodu.')}
              </div>
            )}
            {(data.members ?? []).map((m) => (
              <div key={m.user_id} className="px-4 py-3 flex items-center justify-between gap-2 text-sm">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className="text-[10px] font-medium bg-muted">
                      {initialsFor(m.user_id)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-medium truncate">{nameFor(m.user_id)}</span>
                </div>
                <div className="flex items-center gap-4 shrink-0 tabular-nums">
                  <div className="text-right">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                      {t('krug.settlement.paid', 'Platio')}
                    </div>
                    <div className="text-xs">{fmt(m.paid, data.display_currency)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                      {t('krug.settlement.owed', 'Duguje')}
                    </div>
                    <div className="text-xs">{fmt(m.owed, data.display_currency)}</div>
                  </div>
                  <div className="text-right min-w-[70px]">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                      {t('krug.settlement.net', 'Neto')}
                    </div>
                    <div
                      className={`text-xs font-semibold ${
                        m.net > 0.01 ? 'text-emerald-600 dark:text-emerald-400' :
                        m.net < -0.01 ? 'text-destructive' : 'text-muted-foreground'
                      }`}
                    >
                      {fmt(m.net, data.display_currency)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </Card>

          {/* Transfers */}
          {(data.transfers ?? []).length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] text-muted-foreground uppercase tracking-wide px-1">
                {t('krug.settlement.transfers', 'Predloženi transferi')}
              </div>
              <Card className="divide-y divide-border">
                {data.transfers.map((tr, i) => (
                  <div key={i} className="px-4 py-2.5 flex items-center justify-between gap-2 text-sm">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="truncate">{nameFor(tr.from_user)}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate font-medium">{nameFor(tr.to_user)}</span>
                    </div>
                    <div className="text-sm font-semibold tabular-nums shrink-0">
                      {fmt(tr.amount, tr.currency)}
                    </div>
                    <Button
                      size="sm" variant="outline" className="h-8 shrink-0"
                      onClick={() => setSettleTransfer({
                        fromUser: tr.from_user, toUser: tr.to_user,
                        amount: tr.amount, currency: tr.currency,
                        fromName: nameFor(tr.from_user), toName: nameFor(tr.to_user),
                      })}
                    >
                      {t('krug.settlement.markSettled', 'Podmiri')}
                    </Button>
                  </div>
                ))}
              </Card>
            </div>
          )}

          <div className="text-[10px] text-muted-foreground px-1">
            {t('krug.settlement.fxNotice', 'FX snapshot')}: {data.fx.snapshot_date} · {data.fx.source}
          </div>

          <KrugSettlementHistory krugId={krugId} isFullMember={isFullMember} />
        </>
      )}

      {isOwner && (
        <KrugSettlementSettings krugId={krugId} open={settingsOpen} onOpenChange={setSettingsOpen} />
      )}

      <KrugSettleTransferDialog
        krugId={krugId}
        open={!!settleTransfer}
        onOpenChange={(v) => { if (!v) setSettleTransfer(null); }}
        transfer={settleTransfer}
      />
    </section>
  );

}
