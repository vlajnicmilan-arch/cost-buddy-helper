import { useEffect } from 'react';
import { useDecisionScan } from '@/contexts/DecisionScanContext';
import { DecisionCaptureRunner } from './DecisionCaptureRunner';
import { logDiagnostic } from '@/lib/diagnosticLogger';

/**
 * Montiran u App.tsx iznad ruta. Kad DecisionScanContext prijeđe u
 * phase='capturing', mounta DecisionCaptureRunner koji otvara nativnu kameru.
 * Time se osigurava da kamera roundtrip ne demontira formu odluke.
 */
export const GlobalDecisionCaptureHost = () => {
  const { phase } = useDecisionScan();

  useEffect(() => {
    try { logDiagnostic('global_decision_capture_host_mounted', {}); } catch {}
    return () => {
      try {
        logDiagnostic({ event: 'global_decision_capture_host_unmounted', severity: 'warning', details: {} });
      } catch {}
    };
  }, []);

  if (phase !== 'capturing') return null;
  return <DecisionCaptureRunner />;
};
