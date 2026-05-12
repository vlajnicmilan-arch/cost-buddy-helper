import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { useNativeCamera } from '@/hooks/useNativeCamera';
import { useReceiptScan } from '@/contexts/ReceiptScanContext';
import { logDiagnostic } from '@/lib/diagnosticLogger';
import { setNativeFlowActive } from '@/lib/nativeFlowGuard';

/**
 * Headless capture step: when phase==='capturing', this component opens the
 * native camera (or a hidden web file input) IMMEDIATELY, with no form/dialog
 * rendered in front of it. On success it hands the base64 to the context which
 * flips to 'editing' (AddExpenseDialog mounts pre-loaded with the image).
 *
 * Renders only a minimal full-screen spinner while the camera Activity is
 * coming up — so the user never sees an empty form flash.
 */
export const ScanCaptureRunner = () => {
  const { t } = useTranslation();
  const { completeCapture, cancelCapture } = useReceiptScan();
  const { takePhoto, isNative, cameraInputRef } = useNativeCamera();
  const launchedRef = useRef(false);

  useEffect(() => {
    if (launchedRef.current) return;
    launchedRef.current = true;

    let cancelled = false;
    setNativeFlowActive(true);
    try { logDiagnostic('scan_capture_runner_launch', { is_native: isNative }); } catch {}

    (async () => {
      try {
        const base64 = await takePhoto();
        if (cancelled) return;
        if (base64) {
          completeCapture(base64);
        } else {
          // User cancelled at camera UI
          cancelCapture();
        }
      } catch (err) {
        try {
          logDiagnostic({
            event: 'scan_capture_runner_error',
            severity: 'error',
            details: { message: (err as Error)?.message ?? String(err) },
          });
        } catch {}
        if (!cancelled) cancelCapture();
      } finally {
        // Release the native-flow guard a tick later so any pending popstate
        // events from the camera Activity have settled first.
        setTimeout(() => setNativeFlowActive(false), 500);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [takePhoto, completeCapture, cancelCapture, isNative]);

  return (
    <>
      {/* Hidden web fallback inputs used by useNativeCamera on non-native */}
      {!isNative && (
        <>
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            aria-hidden
            tabIndex={-1}
          />
        </>
      )}

      {/* Minimal loading overlay – prevents blank-screen feel while camera spins up */}
      <div
        className="fixed inset-0 z-[80] flex items-center justify-center bg-background/80 backdrop-blur-sm"
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
