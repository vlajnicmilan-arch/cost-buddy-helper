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
  const { isOpen, autoScan, businessProfileId, closeScan, _runAdd, _runCheckDuplicate } = useReceiptScan();

  useEffect(() => {
    try { logDiagnostic('global_scan_host_mounted', {}); } catch { }
    return () => {
      try { logDiagnostic({ event: 'global_scan_host_unmounted', severity: 'warning', details: {} }); } catch { }
    };
  }, []);

  if (!isOpen) return null;

  return (
    <AddExpenseDialog
      hideTrigger
      externalOpen={isOpen}
      onOpenChange={(open) => { if (!open) closeScan(); }}
      autoScan={autoScan}
      businessProfileId={businessProfileId}
      onAdd={_runAdd}
      checkDuplicate={_runCheckDuplicate}
    />
  );
};
