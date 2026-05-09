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
  const { isOpen, businessProfileId, closeScan, _runAdd, _runCheckDuplicate } = useReceiptScan();

  useEffect(() => {
    try { logDiagnostic('global_scan_host_mounted', {}); } catch { }
    return () => {
      try { logDiagnostic({ event: 'global_scan_host_unmounted', severity: 'warning', details: {} }); } catch { }
    };
  }, []);

  // IMPORTANT: do NOT gate rendering on `hasHandlers`. Page components
  // (PersonalModeView/BusinessModeView) re-register their handlers on every
  // remount, which briefly flips hasHandlers to false. If we unmount the
  // dialog during that blip, autoScan re-fires on the next mount and the
  // camera reopens after the user already took a photo. _runAdd already
  // logs an error if the page handler is missing at save time.
  if (!isOpen) return null;

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
