/**
 * KrugSettlementSection — Faza A read-only preview.
 * BEZ write akcija. "Označi podmireno" je Faza B.
 */
import { useMemo, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ChevronLeft, ChevronRight, Scale, ArrowRight, Info, Loader2, Settings2, Download } from 'lucide-react';
import { useKrugSettlement, currentMonthRange, shiftMonth } from '@/hooks/useKrugSettlement';
import { useKrug } from '@/hooks/useKrug';
import { useUserProfiles } from '@/hooks/useUserProfiles';
import { getMemberDisplayName, getInitials } from '@/lib/krugDisplay';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
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
  const qc = useQueryClient();
  const [range, setRange] = useState(() => currentMonthRange());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [settleTransfer, setSettleTransfer] = useState<null | {
    fromUser: string; toUser: string; amount: number; currency: string; fromName: string; toName: string;
  }>(null);


  const { data, isLoading, isError, error } = useKrugSettlement({
    krugId,
    periodStart: range.start,
    periodEnd: range.end,
    enabled: isFullMember,
  });
  const { data: krugDetail } = useKrug(krugId);


  const memberIds = useMemo(
    () => Array.from(new Set([
      ...(data?.members ?? []).map((m) => m.user_id),
      ...(data?.transfers ?? []).flatMap((tr) => [tr.from_user, tr.to_user]),
    ])),
    [data],
  );
  const profileMap = useUserProfiles(memberIds);

  const nameFor = useCallback(
    (uid: string) => getMemberDisplayName(profileMap.get(uid), uid, t('krug.member.unknown', 'Nepoznat član')),
    [profileMap, t],
  );
  const initialsFor = (uid: string) => getInitials(profileMap.get(uid)?.display_name || '', uid);

  const handleExportPdf = useCallback(async () => {
    if (!data || exporting) return;
    setExporting(true);
    try {
      const [{ exportKrugSettlementPdf }, { supabase }] = await Promise.all([
        import('@/lib/krugSettlementPdf'),
        import('@/integrations/supabase/client'),
      ]);
      // Prefetch ledger + overrides in parallel (both read-only, RLS-scoped).
      const [ledger, overrides] = await Promise.all([
        qc.fetchQuery({
          queryKey: ['krug', 'ledger', krugId],
          staleTime: 30 * 1000,
          queryFn: async () => {
            const { data: rows, error: err } = await supabase
              .from('krug_settlement_ledger' as any)
              .select('*')
              .eq('krug_id', krugId)
              .order('marked_at', { ascending: false })
              .limit(200);
            if (err) throw err;
            return (rows ?? []) as any[];
          },
        }),
        qc.fetchQuery({
          queryKey: ['krug', 'periodOverrides', krugId, range.start, range.end],
          staleTime: 60 * 1000,
          queryFn: async () => {
            const mod = await import('@/hooks/useKrugPeriodOverrides');
            // Reuse the same fetch logic by inlining a minimal call — the hook
            // exposes only the React query wrapper. We keep it DRY by writing a
            // parallel function; if this ever drifts, extract the fetcher.
            void mod; // for tree-shake safety hint
            const { data: overrideRows, error: err } = await supabase
              .from('krug_expense_split_override' as any)
              .select('id, expense_id, krug_id, proposed_by, status, activated_at, reject_reason, created_at')
              .eq('krug_id', krugId)
              .in('status', ['potvrdjena', 'povucena', 'odbijena'])
              .order('created_at', { ascending: false })
              .limit(500);
            if (err) throw err;
            const rows = (overrideRows ?? []) as any[];
            if (rows.length === 0) return [];
            const ids = rows.map((r) => r.id);
            const expenseIds = Array.from(new Set(rows.map((r) => r.expense_id)));
            const [sh, cf, ex] = await Promise.all([
              supabase.from('krug_expense_split_share' as any).select('*').in('override_id', ids),
              supabase.from('krug_expense_split_confirmation' as any).select('*').in('override_id', ids),
              supabase.from('expenses').select('id, description, amount, currency, date').in('id', expenseIds),
            ]);
            if (sh.error) throw sh.error;
            if (cf.error) throw cf.error;
            if (ex.error) throw ex.error;
            const shares = (sh.data ?? []) as any[];
            const confirms = (cf.data ?? []) as any[];
            const expensesMap = new Map<string, any>(
              ((ex.data ?? []) as any[]).map((e) => [e.id, {
                id: e.id,
                description: e.description ?? null,
                amount: Number(e.amount ?? 0),
                currency: e.currency || 'EUR',
                date: e.date || '',
              }]),
            );
            const inPeriod = (d: string) => !!d && d >= range.start && d <= range.end;
            return rows
              .map((r) => {
                const expense = expensesMap.get(r.expense_id);
                if (!expense || !inPeriod(expense.date)) return null;
                return {
                  id: r.id,
                  expense,
                  krug_id: r.krug_id,
                  proposed_by: r.proposed_by,
                  status: r.status,
                  activated_at: r.activated_at ?? null,
                  reject_reason: r.reject_reason ?? null,
                  created_at: r.created_at,
                  shares: shares.filter((s) => s.override_id === r.id)
                    .map((s) => ({ user_id: s.user_id, share_percent: Number(s.share_percent) })),
                  confirmations: confirms.filter((c) => c.override_id === r.id)
                    .map((c) => ({ user_id: c.user_id, confirmed_at: c.confirmed_at })),
                };
              })
              .filter((r): r is any => r !== null)
              .sort((a: any, b: any) => (a.expense.date < b.expense.date ? 1 : -1));
          },
        }),
      ]);

      const krugName = (krugDetail as any)?.name || t('krug.title', 'Krug');
      await exportKrugSettlementPdf({
        krugName,
        periodStart: range.start,
        periodEnd: range.end,
        language: (i18n.language as any) || 'hr',
        preview: data,
        ledger: ledger as any,
        overrides: overrides as any,
        nameFor,
      });
      showSuccess(t('krug.settlement.pdf.exportSuccess', 'PDF izvještaj spremljen.'));
    } catch (e: any) {
      console.error('[krug pdf]', e);
      showError(t('krug.settlement.pdf.exportError', 'Nije moguće izvesti PDF.'));
    } finally {
      setExporting(false);
    }
  }, [data, exporting, qc, krugId, range.start, range.end, krugDetail, i18n.language, nameFor, t]);

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
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={handleExportPdf}
            disabled={exporting || !data || isLoading}
            aria-label={t('krug.settlement.pdf.exportButton', 'Izvezi PDF')}
            title={t('krug.settlement.pdf.exportButton', 'Izvezi PDF')}
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          </Button>
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
