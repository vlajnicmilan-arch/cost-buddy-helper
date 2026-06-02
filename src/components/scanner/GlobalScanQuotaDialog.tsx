import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScanQuotaReachedDialog } from '@/components/scanner/ScanQuotaReachedDialog';

interface State {
  open: boolean;
  resetAt: string | null;
}

/**
 * Globalni mount koji slusa `core-scan-limit-reached` window event i prikazuje
 * ScanQuotaReachedDialog. Emit je u svim scan-call sajtovima preko
 * `emitCoreScanLimitReached` iz `@/lib/aiQuotaError`.
 */
export function GlobalScanQuotaDialog() {
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ open: false, resetAt: null });

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ resetAt?: string | null }>).detail || {};
      setState({ open: true, resetAt: detail.resetAt ?? null });
    };
    window.addEventListener('core-scan-limit-reached', handler);
    return () => window.removeEventListener('core-scan-limit-reached', handler);
  }, []);

  return (
    <ScanQuotaReachedDialog
      open={state.open}
      onOpenChange={(open) => setState((prev) => ({ ...prev, open }))}
      resetAt={state.resetAt}
      onUpgradeClick={() => {
        setState((prev) => ({ ...prev, open: false }));
        navigate('/subscription');
      }}
    />
  );
}
