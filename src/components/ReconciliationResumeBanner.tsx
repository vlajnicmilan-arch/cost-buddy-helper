/**
 * ReconciliationResumeBanner — Dashboard banner koji signalizira kada su
 * pending reconciliacije ostale otvorene (X / back / navigacija u TUR 1).
 *
 * Refresh pattern: on mount + focus + visibilitychange (isti obrazac kao
 * hasResumableReview za import review draft).
 *
 * Akcije:
 *  - "Nastavi" — enqueue-a iste entrye iz snapshota u in-memory queue;
 *    ReconciliationDialogHost pokupi head i prikaže dijalog.
 *  - "Odbaci" — AlertDialog confirm; poziva keepMine za sve preostale
 *    pending sourceove svakog statementa (idempotentno postavlja
 *    reconciliation_state='user_override'). Saldo se NE mijenja.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AlertCircle, ArrowRightLeft, Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { logDiagnostic } from '@/lib/diagnosticLogger';
import {
  fetchResumableReconciliations,
  countPendingSources,
  type ResumableStatement,
} from '@/lib/reconciliation/resume';
import { enqueueReconciliation, subscribeReconciliation } from '@/lib/reconciliation/queue';
import { keepMine, type ReconciliationSupabaseClient } from '@/lib/reconciliation/actions';
import { useAuth } from '@/hooks/useAuth';

export function ReconciliationResumeBanner() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [list, setList] = useState<ResumableStatement[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dialogActive, setDialogActive] = useState(false);

  const refresh = useCallback(async () => {
    if (!user?.id) { setList([]); return; }
    try {
      const rows = await fetchResumableReconciliations(
        supabase as unknown as ReconciliationSupabaseClient,
      );
      setList(rows);
    } catch { /* noop — banner tiho izostane */ }
  }, [user?.id]);

  // Mount + focus + visibility (isti pattern kao hasResumableReview banner).
  useEffect(() => {
    void refresh();
    const onFocus = () => { void refresh(); };
    const onVis = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [refresh]);

  // Skrivamo banner dok je dijalog otvoren (queue head != null); nakon
  // zatvaranja osvježimo listu (odluke su možda upisane).
  useEffect(() => {
    return subscribeReconciliation((head) => {
      const active = head !== null;
      setDialogActive(active);
      if (!active) { void refresh(); }
    });
  }, [refresh]);

  const total = countPendingSources(list);
  if (total === 0 || dialogActive) return null;

  const handleResume = () => {
    try { logDiagnostic('reconciliation_resume_clicked', { statements: list.length, sources: total }); } catch { /* noop */ }
    // Redom svi statementi → sve pending entrye. Dijalog ih obrađuje jedan po jedan.
    for (const s of list) {
      enqueueReconciliation(s.entries);
    }
  };

  const handleDiscardConfirm = async () => {
    setBusy(true);
    try { logDiagnostic('reconciliation_resume_discarded', { statements: list.length, sources: total }); } catch { /* noop */ }
    try {
      for (const s of list) {
        for (const e of s.entries) {
          try {
            await keepMine({
              supabase: supabase as unknown as ReconciliationSupabaseClient,
              summary: e.summary,
              importedStatementId: e.importedStatementId ?? s.statementId,
            });
          } catch { /* nastavi s ostalima */ }
        }
      }
      toast(t('reconciliation.resumeBanner.discardedToast'));
    } finally {
      setBusy(false);
      setConfirmOpen(false);
      void refresh();
    }
  };

  const firstName = list[0]?.entries[0]?.sourceName ?? '';
  const subtitle = total === 1
    ? t('reconciliation.resumeBanner.subtitleSingle', { name: firstName })
    : t('reconciliation.resumeBanner.subtitleMulti', { count: total });

  return (
    <>
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="mt-0.5 shrink-0 rounded-full bg-amber-500/20 p-2">
            <AlertCircle className="w-4 h-4 text-amber-600" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              {t('reconciliation.resumeBanner.title')}
            </p>
            <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
          </div>
        </div>
        <div className="flex gap-2 sm:shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="min-h-11"
            onClick={() => setConfirmOpen(true)}
            disabled={busy}
          >
            {t('reconciliation.resumeBanner.discard')}
          </Button>
          <Button
            size="sm"
            className="min-h-11"
            onClick={handleResume}
            disabled={busy}
          >
            <ArrowRightLeft className="w-4 h-4 mr-1.5" />
            {t('reconciliation.resumeBanner.resume')}
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={(v) => !busy && setConfirmOpen(v)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('reconciliation.resumeBanner.discardConfirmTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('reconciliation.resumeBanner.discardConfirmDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDiscardConfirm} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {t('reconciliation.resumeBanner.discardConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
