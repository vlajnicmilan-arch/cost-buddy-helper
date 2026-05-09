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

interface ReceiptScanContextValue {
  isOpen: boolean;
  autoScan: boolean;
  businessProfileId: string | null;
  hasHandlers: boolean;
  openScan: (opts?: { businessProfileId?: string | null }) => void;
  openManualAdd: (opts?: { businessProfileId?: string | null }) => void;
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
  const [isOpen, setIsOpen] = useState(false);
  const [autoScan, setAutoScan] = useState(false);
  const [businessProfileId, setBusinessProfileId] = useState<string | null>(null);
  const handlersRef = useRef<ScanContextHandlers | null>(null);
  const [hasHandlers, setHasHandlers] = useState(false);

  const openScan = useCallback((opts?: { businessProfileId?: string | null }) => {
    setBusinessProfileId(opts?.businessProfileId ?? null);
    setAutoScan(true);
    setIsOpen(true);
    try {
      logDiagnostic('global_scan_open', {
        business_profile_id: opts?.businessProfileId ?? null,
        has_handlers: !!handlersRef.current,
      });
    } catch {}
  }, []);

  const openManualAdd = useCallback((opts?: { businessProfileId?: string | null }) => {
    setBusinessProfileId(opts?.businessProfileId ?? null);
    setAutoScan(false);
    setIsOpen(true);
    try {
      logDiagnostic('global_manual_add_open', {
        business_profile_id: opts?.businessProfileId ?? null,
        has_handlers: !!handlersRef.current,
      });
    } catch {}
  }, []);

  const closeScan = useCallback(() => {
    setIsOpen(false);
    setAutoScan(false);
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
    isOpen,
    businessProfileId,
    hasHandlers,
    openScan,
    closeScan,
    registerHandlers,
    _runAdd,
    _runCheckDuplicate,
  }), [isOpen, businessProfileId, hasHandlers, openScan, closeScan, registerHandlers, _runAdd, _runCheckDuplicate]);

  return (
    <ReceiptScanContext.Provider value={value}>
      {children}
    </ReceiptScanContext.Provider>
  );
};

export const useReceiptScan = (): ReceiptScanContextValue => {
  const ctx = useContext(ReceiptScanContext);
  if (!ctx) {
    // Safe fallback so non-provider trees don't crash.
    return {
      isOpen: false,
      businessProfileId: null,
      hasHandlers: false,
      openScan: noop,
      closeScan: noop,
      registerHandlers: () => noop,
      _runAdd: async () => {},
      _runCheckDuplicate: noDup,
    };
  }
  return ctx;
};
