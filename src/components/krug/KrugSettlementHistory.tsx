/**
 * Collapsed povijest podmirenja. Voidani zapisi prekriženi.
 * Poništi otvara prompt za razlog.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { History, Loader2 } from 'lucide-react';
import { CollapsibleSection } from '@/components/common/CollapsibleSection';
import { ConfirmActionDialog } from '@/components/common/ConfirmActionDialog';
import { useKrugSettlementLedger, useKrugVoidSettlement, type KrugSettlementLedgerRow } from '@/hooks/useKrugSettlementMutations';
import { useUserProfiles } from '@/hooks/useUserProfiles';
import { getMemberDisplayName } from '@/lib/krugDisplay';
import { useAuth } from '@/hooks/useAuth';
import { useShowMore } from '@/hooks/useShowMore';
import { ShowMoreButton } from '@/components/common/ShowMoreButton';
import { useAllPaymentSourceNames } from '@/hooks/useAllPaymentSourceNames';
import { canActOnReceipt } from '@/lib/krugSettleWithSource';
import { KrugSettlementHistoryRow } from './KrugSettlementHistoryRow';
import { KrugConfirmReceiptDialog, type ConfirmReceiptTarget } from './KrugConfirmReceiptDialog';

interface Props {
  krugId: string;
  isFullMember: boolean;
  /** Arhivirani Krug: zapisi se čitaju, poništavanje nije moguće. */
  readOnly?: boolean;
  /** Deep-link iz obavijesti — otvori povijest da HighlightTarget nađe zapis. */
  focusSettlementId?: string | null;
  /** Deep-link za primatelja: otvori prozor potvrde primitka za focusSettlementId. */
  focusConfirmReceipt?: boolean;
}

export function KrugSettlementHistory({ krugId, isFullMember, readOnly = false, focusSettlementId = null, focusConfirmReceipt = false }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [voidTarget, setVoidTarget] = useState<string | null>(null);
  // "Nisam primio" reuses the existing void flow with a pre-filled, editable reason.
  const [voidPrefill, setVoidPrefill] = useState<string | undefined>(undefined);
  const [confirmTarget, setConfirmTarget] = useState<ConfirmReceiptTarget | null>(null);
  const autoConfirmDone = useRef<string | null>(null);
  // Brojka u naslovu mora biti točna i dok je sekcija zatvorena, pa se ledger
  // dohvaća čim je korisnik punopravan član (ne tek na otvaranje).
  const { data = [], isLoading } = useKrugSettlementLedger(krugId, isFullMember);
  const { visible, hasMore, remaining, showMore } = useShowMore(data);

  // Obavijest o podmirenju vodi ravno ovdje — sekcija se sama otvori.
  useEffect(() => {
    if (focusSettlementId) setOpen(true);
  }, [focusSettlementId]);
  const voidMut = useKrugVoidSettlement(krugId);

  const uids = Array.from(new Set(data.flatMap((r) => [r.from_user, r.to_user])));
  const profiles = useUserProfiles(uids);
  const nameFor = (uid: string) =>
    getMemberDisplayName(profiles.get(uid), uid, t('krug.member.unknown', 'Nepoznat član'));

  const sourceNames = useAllPaymentSourceNames();
  const sourceNameFor = (id: string | null | undefined) =>
    (id && sourceNames.find((s) => s.id === id)?.name) || null;

  const openConfirm = (r: KrugSettlementLedgerRow) => setConfirmTarget({
    ledgerId: r.id, amount: Number(r.amount), currency: r.currency, fromName: nameFor(r.from_user),
  });

  // Recipient deep link (`&confirm=1`): open the confirm dialog once for that row.
  const focusedRow = focusConfirmReceipt && focusSettlementId
    ? data.find((r) => r.id === focusSettlementId) ?? null
    : null;
  const canAutoConfirm = !!focusedRow && canActOnReceipt(focusedRow, user?.id, readOnly);
  useEffect(() => {
    if (!canAutoConfirm || !focusedRow || autoConfirmDone.current === focusedRow.id) return;
    autoConfirmDone.current = focusedRow.id;
    openConfirm(focusedRow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAutoConfirm, focusedRow?.id]);

  if (!isFullMember) return null;

  const handleVoid = async (reason?: string) => {
    if (!voidTarget || !reason?.trim()) return;
    try {
      await voidMut.mutateAsync({ ledgerId: voidTarget, reason: reason.trim() });
      setVoidTarget(null);
    } catch { /* handled */ }
  };


  return (
    <>
      <CollapsibleSection
        title={t('krug.settle.history.title', 'Povijest podmirenja')}
        count={data.length}
        icon={History}
        open={open}
        onOpenChange={setOpen}
        testId="krug-settlement-history"
      >
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
          {visible.map((r) => (
            <KrugSettlementHistoryRow
              key={r.id}
              row={r}
              userId={user?.id}
              readOnly={readOnly}
              voidPending={voidMut.isPending}
              nameFor={nameFor}
              sourceNameFor={sourceNameFor}
              onVoid={(id) => { setVoidPrefill(undefined); setVoidTarget(id); }}
              onConfirmReceipt={openConfirm}
              onNotReceived={(id) => { setVoidPrefill(t('krug.settle.history.notReceivedReason')); setVoidTarget(id); }}
            />
          ))}
          <ShowMoreButton hasMore={hasMore} remaining={remaining} onClick={showMore} />
        </Card>
      </CollapsibleSection>


      <ConfirmActionDialog
        open={!!voidTarget}
        onOpenChange={(v) => { if (!v) setVoidTarget(null); }}
        title={t('krug.settle.history.voidDialog.title', 'Poništi podmirenje')}
        description={t('krug.settle.history.voidDialog.description', 'Poništavaš zabilježeno podmirenje. Druga strana dobiva obavijest s razlogom.')}
        reason={{
          label: t('krug.settle.history.voidDialog.reasonLabel', 'Razlog poništenja (obavezno)'),
          placeholder: t('krug.settle.history.voidDialog.reasonPlaceholder', 'npr. novac nije stigao'),
          required: true,
          defaultValue: voidPrefill,
        }}
        confirmLabel={t('krug.settle.history.voidDialog.confirm', 'Poništi podmirenje')}
        destructive
        pending={voidMut.isPending}
        onConfirm={handleVoid}
      />

      <KrugConfirmReceiptDialog
        krugId={krugId}
        target={confirmTarget}
        onOpenChange={(v) => { if (!v) setConfirmTarget(null); }}
      />
    </>
  );
}
