import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { useNativeCamera } from '@/hooks/useNativeCamera';
import { useDecisionScan } from '@/contexts/DecisionScanContext';
import { logDiagnostic } from '@/lib/diagnosticLogger';

/**
 * Mirror obrazac ScanCaptureRunnera (receipt scanner) prilagođen modulu
 * "Odluke". Otvara nativnu kameru IZVAN route tree-a; rezultat vraća u
 * DecisionScanContext preko completeCapture/cancelCapture. Ne rendera formu.
 *
 * VAŽNO: nativeFlowActive guard NIJE odgovornost runnera. Postavlja ga
 * beginCapture, a skida ga consumePendingCapture / cancelCapture u
 * DecisionScanContextu. Time guard ostaje aktivan sve dok forma ne
 * pokupi fotku, pa kasni Android popstate ne može zatvoriti dijalog.
 */
export const DecisionCaptureRunner = () => {
  const { t } = useTranslation();
  const { completeCapture, cancelCapture } = useDecisionScan();
  const { takePhoto, isNative, cameraInputRef } = useNativeCamera();
  const launchedRef = useRef(false);

  useEffect(() => {
    if (launchedRef.current) return;
    launchedRef.current = true;

    let cancelled = false;
    try { logDiagnostic('decision_capture_runner_launch', { is_native: isNative }); } catch {}

    (async () => {
      try {
        const dataUrl = await takePhoto();
        if (cancelled) return;
        if (dataUrl) {
          completeCapture(dataUrl);
        } else {
          cancelCapture();
        }
      } catch (err) {
        try {
          logDiagnostic({
            event: 'decision_capture_runner_error',
            severity: 'error',
            details: { message: (err as Error)?.message ?? String(err) },
          });
        } catch {}
        if (!cancelled) cancelCapture();
      }
    })();

    return () => { cancelled = true; };
  }, [takePhoto, completeCapture, cancelCapture, isNative]);


  return (
    <>
      {!isNative && (
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          aria-hidden
          tabIndex={-1}
        />
      )}
      <div
        className="fixed inset-0 z-[90] flex items-center justify-center bg-background/80 backdrop-blur-sm"
        role="status"
        aria-live="polite"
      >
        <div className="flex flex-col items-center gap-3 text-foreground">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            {t('common.openingCamera', 'Otvaram kameru...')}
          </p>
        </div>
      </div>
    </>
  );
};
