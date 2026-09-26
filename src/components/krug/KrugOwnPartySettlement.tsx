/**
 * "Tko kome" for a regular Krug member (preview flag `own_party_view`).
 * Renders only what the server returned for the caller: direct pairs and
 * own settled transfers. No member balances, totals, FX snapshot or export.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Info } from 'lucide-react';
import type { SettlementPreview } from '@/hooks/useKrugSettlement';
import { useKrugSettlementLedger } from '@/hooks/useKrugSettlementMutations';
import { useUserProfiles } from '@/hooks/useUserProfiles';
import { getMemberDisplayName } from '@/lib/krugDisplay';
import { canActOnReceipt, isAwaitingReceipt } from '@/lib/krugSettleWithSource';
import { splitOwnPartyTransfers } from '@/lib/krugOwnParty';
import { KrugSettleTransferDialog } from './KrugSettleTransferDialog';
import { KrugConfirmReceiptDialog, type ConfirmReceiptTarget } from './KrugConfirmReceiptDialog';

interface Props {
  krugId: string;
  data: SettlementPreview;
  userId: string;
  readOnly: boolean;
  focusSettlementId?: string | null;
  focusConfirmReceipt?: boolean;
}

const fmt = (n: number, currency: string) =>
  new Intl.NumberFormat('hr-HR', { style: 'currency', currency, minimumFractionDigits: 2 }).format(n);

export function KrugOwnPartySettlement({
  krugId, data, userId, readOnly, focusSettlementId = null, focusConfirmReceipt = false,
}: Props) {
  const { t } = useTranslation();
  const { iOwe, owedToMe } = useMemo(() => splitOwnPartyTransfers(data.transfers ?? [], userId), [data, userId]);
  const settled = data.settled_transfers ?? [];
  const [settleTransfer, setSettleTransfer] = useState<null | {
    fromUser: string; toUser: string; amount: number; currency: string; fromName: string; toName: string;
  }>(null);
  const [confirmTarget, setConfirmTarget] = useState<ConfirmReceiptTarget | null>(null);
  const autoConfirmDone = useRef<string | null>(null);

  // Ledger is RLS-scoped to the caller's own rows; used only for receipt status.
  const { data: ledger = [] } = useKrugSettlementLedger(krugId, settled.length > 0);
  const ledgerById = useMemo(() => new Map(ledger.map((r) => [r.id, r])), [ledger]);

  const otherIds = useMemo(() => Array.from(new Set([
    ...(data.transfers ?? []).flatMap((tr) => [tr.from_user, tr.to_user]),
    ...settled.flatMap((s) => [s.from_user, s.to_user]),
  ])), [data, settled]);
  const profiles = useUserProfiles(otherIds);
  const nameFor = (uid: string) =>
    getMemberDisplayName(profiles.get(uid), uid, t('krug.member.unknown', 'Nepoznat član'));

  const openConfirm = (ledgerId: string) => {
    const r = ledgerById.get(ledgerId);
    if (!r) return;
    setConfirmTarget({ ledgerId: r.id, amount: Number(r.amount), currency: r.currency, fromName: nameFor(r.from_user) });
  };

  const focusedRow = focusConfirmReceipt && focusSettlementId ? ledgerById.get(focusSettlementId) ?? null : null;
  const canAutoConfirm = !!focusedRow && canActOnReceipt(focusedRow, userId, readOnly);
  useEffect(() => {
    if (!canAutoConfirm || !focusedRow || autoConfirmDone.current === focusedRow.id) return;
    autoConfirmDone.current = focusedRow.id;
    openConfirm(focusedRow.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAutoConfirm, focusedRow?.id]);

  const empty = iOwe.length === 0 && owedToMe.length === 0 && settled.length === 0;

  return (
    <div className="space-y-2" data-testid="krug-own-party-view">
      <div className="flex items-start gap-2 text-[11px] text-muted-foreground px-1">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>{t('krug.settlement.ownParty.notice')}</span>
      </div>

      {empty && (
        <Card className="p-4 text-xs text-muted-foreground" data-testid="krug-own-party-empty">
          {t('krug.settlement.ownParty.empty')}
        </Card>
      )}

      {iOwe.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[11px] text-muted-foreground uppercase tracking-wide px-1">
            {t('krug.settlement.ownParty.iOwe')}
          </div>
          <Card className="divide-y divide-border">
            {iOwe.map((tr) => (
              <div key={tr.to_user} data-testid="own-party-owe-row" className="px-4 py-2.5 flex items-center justify-between gap-2 text-sm">
                <span className="truncate min-w-0 flex-1 font-medium">{nameFor(tr.to_user)}</span>
                <span className="font-semibold tabular-nums shrink-0">{fmt(tr.amount, tr.currency)}</span>
                {!readOnly && (
                  <Button
                    size="sm" variant="outline" className="min-h-[44px] shrink-0"
                    onClick={() => setSettleTransfer({
                      fromUser: tr.from_user, toUser: tr.to_user, amount: tr.amount, currency: tr.currency,
                      fromName: nameFor(tr.from_user), toName: nameFor(tr.to_user),
                    })}
                  >
                    {t('krug.settlement.markSettled', 'Podmiri')}
                  </Button>
                )}
              </div>
            ))}
          </Card>
        </div>
      )}

      {owedToMe.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[11px] text-muted-foreground uppercase tracking-wide px-1">
            {t('krug.settlement.ownParty.owedToMe')}
          </div>
          <Card className="divide-y divide-border">
            {owedToMe.map((tr) => (
              <div key={tr.from_user} data-testid="own-party-owed-row" className="px-4 py-2.5 flex items-center justify-between gap-2 text-sm">
                <span className="truncate min-w-0 flex-1 font-medium">{nameFor(tr.from_user)}</span>
                <span className="font-semibold tabular-nums shrink-0">{fmt(tr.amount, tr.currency)}</span>
              </div>
            ))}
          </Card>
        </div>
      )}

      {settled.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[11px] text-muted-foreground uppercase tracking-wide px-1">
            {t('krug.settle.history.title', 'Povijest podmirenja')}
          </div>
          <Card className="divide-y divide-border">
            {settled.map((s) => {
              const row = ledgerById.get(s.ledger_id);
              const canConfirm = !!row && canActOnReceipt(row, userId, readOnly);
              return (
                <div key={s.ledger_id} data-highlight-id={`settlement:${s.ledger_id}`} data-testid="own-party-settled-row" className="px-4 py-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate">
                        {s.from_user === userId
                          ? t('krug.settlement.ownParty.paidTo', { name: nameFor(s.to_user) })
                          : t('krug.settlement.ownParty.receivedFrom', { name: nameFor(s.from_user) })}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {new Date(s.marked_at).toLocaleDateString()}
                        {row && isAwaitingReceipt(row) && ` · ${t('krug.settle.history.awaitingReceipt')}`}
                      </div>
                    </div>
                    <span className="font-semibold tabular-nums shrink-0">{fmt(s.amount, s.currency)}</span>
                  </div>
                  {canConfirm && (
                    <Button size="sm" className="min-h-[44px] w-full mt-2" data-testid="own-party-confirm" onClick={() => openConfirm(s.ledger_id)}>
                      {t('krug.settle.history.confirmReceipt')}
                    </Button>
                  )}
                </div>
              );
            })}
          </Card>
        </div>
      )}

      <KrugSettleTransferDialog
        krugId={krugId}
        open={!!settleTransfer}
        onOpenChange={(v) => { if (!v) setSettleTransfer(null); }}
        transfer={settleTransfer}
      />
      {confirmTarget && (
        <KrugConfirmReceiptDialog
          krugId={krugId}
          target={confirmTarget}
          onOpenChange={(v) => { if (!v) setConfirmTarget(null); }}
        />
      )}
    </div>
  );
}
