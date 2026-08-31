/**
 * useBundleFreshness — silent web-bundle self-refresh.
 *
 * Checks the live build marker on foreground return and every ~30 min
 * (debounced to at most one check / 5 min). When a newer bundle exists and
 * no critical work is open, the tab reloads itself with zero UI. When work is
 * open, the reload silently waits for the next calm moment.
 */
import { useCallback, useEffect, useRef } from 'react';
import { COMMIT_SHA } from '@/lib/version';
import { logDiagnostic } from '@/lib/diagnosticLogger';
import { useReceiptScan } from '@/contexts/ReceiptScanContext';
import { usePdfImport } from '@/contexts/PdfImportContext';
import { useDecisionScan } from '@/contexts/DecisionScanContext';
import {
  BUNDLE_CHECK_DEBOUNCE_MS,
  BUNDLE_CHECK_INTERVAL_MS,
  decideBundleAction,
  fetchLiveBuildSha,
  hasImportReviewWork,
  hasOpenModal,
} from '@/lib/bundleFreshness';

export const useBundleFreshness = () => {
  const { phase: scanPhase } = useReceiptScan();
  const { isBusy: pdfBusy, phase: pdfPhase } = usePdfImport();
  const { phase: decisionPhase } = useDecisionScan();

  const busyRef = useRef(false);
  busyRef.current =
    scanPhase !== 'idle' ||
    decisionPhase !== 'idle' ||
    pdfBusy ||
    pdfPhase !== 'idle' ||
    hasImportReviewWork() ||
    hasOpenModal();

  const lastCheckRef = useRef(0);
  const inFlightRef = useRef(false);
  const pendingShaRef = useRef<string | null>(null);

  const applyDecision = useCallback((liveSha: string | null) => {
    const action = decideBundleAction({
      localSha: COMMIT_SHA,
      liveSha,
      isBusy: busyRef.current,
      documentHidden: typeof document !== 'undefined' && document.visibilityState === 'hidden',
    });

    if (action === 'none') {
      pendingShaRef.current = null;
      return action;
    }
    if (action === 'defer') {
      pendingShaRef.current = liveSha;
      return action;
    }

    pendingShaRef.current = null;
    // Stamp the reload as ours BEFORE it happens, so the boot watchdog on the
    // next load does not mistake it for a crash.
    try {
      markIntentionalReload({ reason: 'bundle_freshness', from: COMMIT_SHA, to: liveSha });
    } catch {
      /* never break the refresh */
    }
    try {
      logDiagnostic({
        event: 'bundle_refreshed',
        details: { from: COMMIT_SHA, to: liveSha },
        severity: 'info',
      });
    } catch {
      /* never break the refresh */
    }
    // Small delay so the fire-and-forget diagnostic has a chance to flush.
    setTimeout(() => {
      try { window.location.reload(); } catch { /* noop */ }
    }, 150);

    return action;
  }, []);

  const check = useCallback(async (force = false) => {
    if (inFlightRef.current) return;
    const now = Date.now();

    // A previously deferred update needs no new network call — just retry.
    if (pendingShaRef.current) {
      applyDecision(pendingShaRef.current);
      if (pendingShaRef.current === null) return;
    }

    if (!force && now - lastCheckRef.current < BUNDLE_CHECK_DEBOUNCE_MS) return;

    inFlightRef.current = true;
    lastCheckRef.current = now;
    try {
      const liveSha = await fetchLiveBuildSha();
      applyDecision(liveSha);
    } finally {
      inFlightRef.current = false;
    }
  }, [applyDecision]);

  useEffect(() => {
    const onVisibility = () => { void check(); };
    document.addEventListener('visibilitychange', onVisibility);
    const timer = window.setInterval(() => { void check(); }, BUNDLE_CHECK_INTERVAL_MS);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(timer);
    };
  }, [check]);
};
