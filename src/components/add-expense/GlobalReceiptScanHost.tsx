import { useEffect } from 'react';
import { AddExpenseDialog } from '@/components/AddExpenseDialog';
import { useReceiptScan } from '@/contexts/ReceiptScanContext';
import { logDiagnostic } from '@/lib/diagnosticLogger';

/**
 * Mounts ONE AddExpenseDialog instance above the route tree so the camera
 * roundtrip on Android cannot unmount it. Page components register their
 * own onAdd/checkDuplicate via ReceiptScanContext; this host just dispatches.
 */
export const GlobalReceiptScanHost = () => {
  const { isOpen, businessProfileId, hasHandlers, closeScan, _runAdd, _runCheckDuplicate } = useReceiptScan();

  useEffect(() => {
    try { logDiagnostic('global_scan_host_mounted', {}); } catch { }
    return () => {
      try { logDiagnostic({ event: 'global_scan_host_unmounted', severity: 'warning', details: {} }); } catch { }
    };
  }, []);

  // Don't render the dialog at all unless the scan is actively requested.
  // This keeps the manual "Add expense" button behaviour (per-page dialog)
  // unaffected and avoids any side-effects when the app is idle.
  if (!isOpen) return null;

  // If somehow opened without a registered page handler, bail out gracefully.
  if (!hasHandlers) {
    try { logDiagnostic({ event: 'global_scan_open_without_handlers', severity: 'error', details: {} }); } catch { }
    return null;
  }

  return (
    <AddExpenseDialog
      hideTrigger
      externalOpen={isOpen}
      onOpenChange={(open) => { if (!open) closeScan(); }}
      autoScan
      businessProfileId={businessProfileId}
      onAdd={_runAdd}
      checkDuplicate={_runCheckDuplicate}
    />
  );
};
