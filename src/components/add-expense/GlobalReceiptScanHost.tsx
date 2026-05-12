import { useEffect } from 'react';
import { AddExpenseDialog } from '@/components/AddExpenseDialog';
import { useReceiptScan } from '@/contexts/ReceiptScanContext';
import { ScanCaptureRunner } from './ScanCaptureRunner';
import { logDiagnostic } from '@/lib/diagnosticLogger';

/**
 * Mounts the receipt scan flow above the route tree so the camera roundtrip
 * on Android cannot unmount it. Two phases:
 *  - 'capturing' → ScanCaptureRunner opens the camera immediately, NO dialog.
 *  - 'editing'   → AddExpenseDialog mounts (optionally pre-loaded with the
 *                  captured image).
 */
export const GlobalReceiptScanHost = () => {
  const {
    phase,
    autoScan,
    businessProfileId,
    capturedImage,
    closeScan,
    _runAdd,
    _runCheckDuplicate,
  } = useReceiptScan();

  useEffect(() => {
    try { logDiagnostic('global_scan_host_mounted', {}); } catch { }
    return () => {
      try { logDiagnostic({ event: 'global_scan_host_unmounted', severity: 'warning', details: {} }); } catch { }
    };
  }, []);

  if (phase === 'idle') return null;

  if (phase === 'capturing') {
    return <ScanCaptureRunner />;
  }

  // phase === 'editing'
  return (
    <AddExpenseDialog
      hideTrigger
      externalOpen
      onOpenChange={(open) => { if (!open) closeScan(); }}
      autoScan={autoScan}
      initialCapturedImage={capturedImage}
      businessProfileId={businessProfileId}
      onAdd={_runAdd}
      checkDuplicate={_runCheckDuplicate}
    />
  );
};
