import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Expense, ReceiptItem } from '@/types/expense';
import { logDiagnostic } from '@/lib/diagnosticLogger';

export type AddExpenseHandler = (
  expense: Omit<Expense, 'id' | 'user_id' | 'created_at' | 'updated_at'>,
  items?: ReceiptItem[],
  isPendingMemberTransaction?: boolean,
) => Promise<void> | void;

export type CheckDuplicateHandler = (transaction: {
  amount: number;
  description: string;
  date: Date;
  type: string;
  category?: string;
  merchant_name?: string;
}) => Expense | null;

interface ScanContextHandlers {
  onAdd: AddExpenseHandler;
  checkDuplicate?: CheckDuplicateHandler;
}

/**
 * 'idle'      – nothing open
 * 'capturing' – camera/picker is acquiring an image (no dialog rendered)
 * 'editing'   – AddExpenseDialog is mounted (with optional pre-captured image)
 */
export type ScanPhase = 'idle' | 'capturing' | 'editing';

interface ReceiptScanContextValue {
  phase: ScanPhase;
  /** Convenience: editing-or-capturing. Kept for legacy callers. */
  isOpen: boolean;
  autoScan: boolean;
  businessProfileId: string | null;
  hasHandlers: boolean;
  /** Captured image from the capture phase, handed to the dialog. */
  capturedImage: string | null;
  /** Click "Skeniraj" – go straight to capture, no dialog yet. */
  openScan: (opts?: { businessProfileId?: string | null }) => void;
  /** Click "Dodaj ručno" – skip capture, open dialog directly. */
  openManualAdd: (opts?: { businessProfileId?: string | null }) => void;
  /** Capture-runner reports a successful image (base64). Moves to 'editing'. */
  completeCapture: (base64: string) => void;
  /** Capture-runner reports user cancel/failure. Returns to 'idle'. */
  cancelCapture: () => void;
  closeScan: () => void;
  /** Register the active page's add/dup handlers. Returns an unregister fn. */
  registerHandlers: (handlers: ScanContextHandlers) => () => void;
  /** Internal: invoked by the global AddExpenseDialog instance. */
  _runAdd: AddExpenseHandler;
  _runCheckDuplicate: CheckDuplicateHandler;
}

const noop = () => {};
const noDup: CheckDuplicateHandler = () => null;

const ReceiptScanContext = createContext<ReceiptScanContextValue | null>(null);

export const ReceiptScanProvider = ({ children }: { children: ReactNode }) => {
  const [phase, setPhase] = useState<ScanPhase>('idle');
  const [autoScan, setAutoScan] = useState(false);
  const [businessProfileId, setBusinessProfileId] = useState<string | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const handlersRef = useRef<ScanContextHandlers | null>(null);
  const [hasHandlers, setHasHandlers] = useState(false);

  const openScan = useCallback((opts?: { businessProfileId?: string | null }) => {
    setBusinessProfileId(opts?.businessProfileId ?? null);
    setAutoScan(true);
    setCapturedImage(null);
    setPhase('capturing');
    try {
      logDiagnostic('global_scan_open', {
        business_profile_id: opts?.businessProfileId ?? null,
        has_handlers: !!handlersRef.current,
        phase: 'capturing',
      });
    } catch {}
  }, []);

  const openManualAdd = useCallback((opts?: { businessProfileId?: string | null }) => {
    setBusinessProfileId(opts?.businessProfileId ?? null);
    setAutoScan(false);
    setCapturedImage(null);
    setPhase('editing');
    try {
      logDiagnostic('global_manual_add_open', {
        business_profile_id: opts?.businessProfileId ?? null,
        has_handlers: !!handlersRef.current,
      });
    } catch {}
  }, []);

  const completeCapture = useCallback((base64: string) => {
    setCapturedImage(base64);
    setPhase('editing');
    try {
      logDiagnostic('global_scan_capture_complete', { bytes: base64?.length ?? 0 });
    } catch {}
  }, []);

  const cancelCapture = useCallback(() => {
    setPhase('idle');
    setAutoScan(false);
    setCapturedImage(null);
    try { logDiagnostic('global_scan_capture_cancelled', {}); } catch {}
  }, []);

  const closeScan = useCallback(() => {
    setPhase('idle');
    setAutoScan(false);
    setCapturedImage(null);
  }, []);

  const registerHandlers = useCallback((handlers: ScanContextHandlers) => {
    handlersRef.current = handlers;
    setHasHandlers(true);
    try { logDiagnostic('global_scan_handlers_registered', {}); } catch {}
    return () => {
      if (handlersRef.current === handlers) {
        handlersRef.current = null;
        setHasHandlers(false);
        try { logDiagnostic('global_scan_handlers_unregistered', {}); } catch {}
      }
    };
  }, []);

  const _runAdd: AddExpenseHandler = useCallback(async (expense, items, pending) => {
    const h = handlersRef.current;
    if (!h) {
      try {
        logDiagnostic({
          event: 'global_scan_add_no_handler',
          severity: 'error',
          details: { amount: expense.amount },
        });
      } catch {}
      return;
    }
    return h.onAdd(expense, items, pending);
  }, []);

  const _runCheckDuplicate: CheckDuplicateHandler = useCallback((tx) => {
    const h = handlersRef.current;
    if (!h?.checkDuplicate) return null;
    return h.checkDuplicate(tx);
  }, []);

  const value = useMemo<ReceiptScanContextValue>(() => ({
    phase,
    isOpen: phase !== 'idle',
    autoScan,
    businessProfileId,
    hasHandlers,
    capturedImage,
    openScan,
    openManualAdd,
    completeCapture,
    cancelCapture,
    closeScan,
    registerHandlers,
    _runAdd,
    _runCheckDuplicate,
  }), [phase, autoScan, businessProfileId, hasHandlers, capturedImage, openScan, openManualAdd, completeCapture, cancelCapture, closeScan, registerHandlers, _runAdd, _runCheckDuplicate]);

  return (
    <ReceiptScanContext.Provider value={value}>
      {children}
    </ReceiptScanContext.Provider>
  );
};

export const useReceiptScan = (): ReceiptScanContextValue => {
  const ctx = useContext(ReceiptScanContext);
  if (!ctx) {
    return {
      phase: 'idle',
      isOpen: false,
      autoScan: false,
      businessProfileId: null,
      hasHandlers: false,
      capturedImage: null,
      openScan: noop,
      openManualAdd: noop,
      completeCapture: noop,
      cancelCapture: noop,
      closeScan: noop,
      registerHandlers: () => noop,
      _runAdd: async () => {},
      _runCheckDuplicate: noDup,
    };
  }
  return ctx;
};
