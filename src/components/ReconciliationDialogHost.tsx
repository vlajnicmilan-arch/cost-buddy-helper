/**
 * ReconciliationDialogHost — globalni Dialog koji se pali nakon uspješnog
 * uvoza (ImportReview.handleConfirm) i prikazuje razliku aplikacijskog vs
 * bankinog salda po novčaniku. Uvijek jedan po jedan (queue FIFO).
 *
 * 3 akcije: Poravnaj s bankom / Zadrži moj saldo / Pregledaj transakcije.
 * Zatvaranje (X/back) = 'pending' (banner iz TUR 2 nudi Nastavi).
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertTriangle, ArrowRightLeft, Loader2, Wallet as WalletIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useBackButton } from '@/hooks/useBackButton';
import { supabase } from '@/integrations/supabase/client';
import { logDiagnostic } from '@/lib/diagnosticLogger';
import {
  dequeueReconciliation,
  subscribeReconciliation,
  type ReconciliationQueueEntry,
} from '@/lib/reconciliation/queue';
import { alignToBank, keepMine, type ReconciliationSupabaseClient } from '@/lib/reconciliation/actions';
import { toDayKey } from '@/lib/dayKey';

export function ReconciliationDialogHost() {
  const { t, i18n } = useTranslation();
  const { formatAmount } = useCurrency();
  const navigate = useNavigate();
  const [active, setActive] = useState<ReconciliationQueueEntry | null>(null);
  const [busy, setBusy] = useState<'align' | 'keep' | null>(null);
  const [anchorNewerThanBank, setAnchorNewerThanBank] = useState<{ anchorDate: string; bankDate: string } | null>(null);

  useEffect(() => subscribeReconciliation(setActive), []);

  // FAZA 4 t.3 — ako je korekcijsko sidro NOVIJE od kraja izvoda (as_of),
  // prikaži info red. Ne mijenja ponašanje gumba.
  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!active) { setAnchorNewerThanBank(null); return; }
      try {
        const { data } = await (supabase as any)
          .from('custom_payment_sources')
          .select('correction_anchor_date')
          .eq('id', active.summary.sourceId)
          .maybeSingle();
        if (cancelled) return;
        const anchorRaw: string | Date | null = data?.correction_anchor_date ?? null;
        // FIX regresije: uspoređujemo day-key (Date | string safe) umjesto sirovih vrijednosti.
        const anchorKey = toDayKey(anchorRaw);
        const bankKey = toDayKey(active.asOfIso);
        if (anchorKey && bankKey && anchorKey > bankKey) {
          setAnchorNewerThanBank({ anchorDate: anchorKey, bankDate: bankKey });
        } else {
          setAnchorNewerThanBank(null);
        }
      } catch { setAnchorNewerThanBank(null); }
    }
    check();
    return () => { cancelled = true; };
  }, [active]);


  const open = active !== null;

  const finish = (sourceId: string) => {
    setBusy(null);
    dequeueReconciliation(sourceId);
  };

  const handleAlign = async () => {
    if (!active) return;
    setBusy('align');
    try {
      const res = await alignToBank({
        supabase: supabase as unknown as ReconciliationSupabaseClient,
        summary: active.summary,
        asOfIso: active.asOfIso,
        importedStatementId: active.importedStatementId ?? null,
      });
      try { logDiagnostic('reconciliation_aligned', { source_id: active.summary.sourceId, batch_id: active.batchId, delta: active.summary.delta }); } catch { /* noop */ }
      toast.success(t('reconciliation.alignedToast', { balance: formatAmount(res.newBalance) }));
      finish(active.summary.sourceId);
    } catch (e) {
      toast.error(t('reconciliation.alignFailed'));
      setBusy(null);
    }
  };

  const handleKeep = async () => {
    if (!active) return;
    setBusy('keep');
    try {
      await keepMine({
        supabase: supabase as unknown as ReconciliationSupabaseClient,
        summary: active.summary,
        importedStatementId: active.importedStatementId ?? null,
      });
      try { logDiagnostic('reconciliation_user_override', { source_id: active.summary.sourceId, batch_id: active.batchId, delta: active.summary.delta }); } catch { /* noop */ }
      toast(t('reconciliation.keptToast'));
      finish(active.summary.sourceId);
    } catch (e) {
      toast.error(t('reconciliation.keepFailed'));
      setBusy(null);
    }
  };

  const handleReview = () => {
    if (!active) return;
    try { logDiagnostic('reconciliation_review_opened', { source_id: active.summary.sourceId, batch_id: active.batchId }); } catch { /* noop */ }
    const sourceKey = `custom:${active.summary.sourceId}`;
    // Zatvaramo bez pisanja (state ostaje 'pending' → banner iz TUR 2).
    dequeueReconciliation(active.summary.sourceId);
    navigate(`/wallet?source=${encodeURIComponent(sourceKey)}`);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && active && !busy) {
      // Zatvaranje bez odluke — 'pending' (default DB stanje).
      dequeueReconciliation(active.summary.sourceId);
    }
  };

  // Back button: dok je dijalog otvoren, presreći navigaciju.
  useBackButton(open, () => {
    if (busy) return;
    if (active) dequeueReconciliation(active.summary.sourceId);
  }, 60, 'reconciliation-dialog');

  if (!active) return null;

  const app = active.summary.appBalance;
  const bank = active.summary.bankBalance;
  const delta = active.summary.delta ?? 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-primary" />
            {t('reconciliation.title')}
          </DialogTitle>
          <DialogDescription>
            {t('reconciliation.description', { delta: formatAmount(Math.abs(delta)) })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            {active.sourceIcon ? <span>{active.sourceIcon}</span> : <WalletIcon className="w-4 h-4 text-muted-foreground" />}
            <span className="truncate">{active.sourceName}</span>
          </div>

          <div className="rounded-xl border border-border/60 bg-card divide-y divide-border/60">
            <div className="flex items-center justify-between p-3">
              <span className="text-sm text-muted-foreground">{t('reconciliation.appBalance')}</span>
              <span className="font-mono font-semibold">{app !== null ? formatAmount(app) : '—'}</span>
            </div>
            <div className="flex items-center justify-between p-3">
              <span className="text-sm text-muted-foreground">{t('reconciliation.bankBalance')}</span>
              <span className="font-mono font-semibold">{bank !== null ? formatAmount(bank) : '—'}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-amber-500/5">
              <span className="text-sm font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                {t('reconciliation.difference')}
              </span>
              <span className={`font-mono font-bold ${delta > 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                {delta > 0 ? '+' : ''}{formatAmount(delta)}
              </span>
            </div>
          </div>

          {anchorNewerThanBank && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs text-foreground/80 flex gap-2">
              <AlertTriangle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <span>
                {t('reconciliation.anchorNewerNote', {
                  anchorDate: new Date(anchorNewerThanBank.anchorDate).toLocaleDateString(i18n.language),
                  bankDate: new Date(anchorNewerThanBank.bankDate).toLocaleDateString(i18n.language),
                })}
              </span>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          <Button className="w-full min-h-11" onClick={handleAlign} disabled={busy !== null || bank === null}>
            {busy === 'align' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {t('reconciliation.alignToBank')}
          </Button>
          <Button className="w-full min-h-11" variant="outline" onClick={handleKeep} disabled={busy !== null}>
            {busy === 'keep' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {t('reconciliation.keepMine')}
          </Button>
          <Button className="w-full min-h-11" variant="ghost" onClick={handleReview} disabled={busy !== null}>
            {t('reconciliation.reviewTransactions')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
