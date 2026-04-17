import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { logDiagnostic } from '@/lib/diagnosticLogger';

/**
 * Logs every route change to the diagnostics table so we can see exactly
 * where the app navigates on a real device.
 */
export const DiagnosticRouteTracker = () => {
  const location = useLocation();
  const previousRef = useRef<string | null>(null);

  useEffect(() => {
    const previous = previousRef.current;
    const current = location.pathname + location.search;
    logDiagnostic('route_change', { from: previous, to: current });
    previousRef.current = current;
  }, [location.pathname, location.search]);

  return null;
};
