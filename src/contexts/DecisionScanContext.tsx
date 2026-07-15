import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { logDiagnostic } from '@/lib/diagnosticLogger';

/**
 * Global capture host + draft store za MODUL "ODLUKE".
 *
 * Klasa problema (Android): kad se otvori Capacitor Camera Activity, WebView
 * može biti pauziran i razne route/back-button reakcije mogu demontirati
 * Dialog u kojem korisnik puni obrazac (opis, cijena, prilozi). Rezultat je
 * gubitak drafta i osjećaj "izbacilo me".
 *
 * Rješenje (poravnato s ReceiptScanContext + GlobalReceiptScanHost):
 *  - Kamera se pokreće IZVAN route tree-a preko `GlobalDecisionCaptureHost`.
 *  - Draft (tekstualna polja + File prilozi) živi u ovom contextu tijekom
 *    trajanja `capturing` faze i preživljava eventualni remount forme.
 *  - Tekstualna polja se dodatno spremaju u sessionStorage kao insurance
 *    protiv WebView reloada; File objekti ostaju samo u memoriji.
 */

export type DecisionScanPhase = 'idle' | 'capturing';

export interface DecisionTextDraft {
  title?: string;
  description?: string;
  priceRaw?: string;
  message?: string;
  replyPriceRaw?: string;
}

interface DraftEntry {
  text: DecisionTextDraft;
  attachments: File[];
}

interface DecisionScanContextValue {
  phase: DecisionScanPhase;
  pendingCapture: { key: string; dataUrl: string } | null;
  beginCapture: (key: string) => void;
  completeCapture: (dataUrl: string) => void;
  cancelCapture: () => void;
  consumePendingCapture: (key: string) => string | null;
  getDraft: (key: string) => DraftEntry;
  saveTextDraft: (key: string, patch: Partial<DecisionTextDraft>) => void;
  saveAttachments: (key: string, files: File[]) => void;
  clearDraft: (key: string) => void;
}

const SS_PREFIX = 'vmb.decisionDraft.';

const readTextFromStorage = (key: string): DecisionTextDraft => {
  try {
    const raw = sessionStorage.getItem(SS_PREFIX + key);
    if (!raw) return {};
    return JSON.parse(raw) as DecisionTextDraft;
  } catch {
    return {};
  }
};

const writeTextToStorage = (key: string, text: DecisionTextDraft) => {
  try {
    const empty = !text.title && !text.description && !text.priceRaw && !text.message && !text.replyPriceRaw;
    if (empty) {
      sessionStorage.removeItem(SS_PREFIX + key);
    } else {
      sessionStorage.setItem(SS_PREFIX + key, JSON.stringify(text));
    }
  } catch { /* no-op */ }
};

const clearTextFromStorage = (key: string) => {
  try { sessionStorage.removeItem(SS_PREFIX + key); } catch { /* no-op */ }
};

const emptyDraft = (): DraftEntry => ({ text: {}, attachments: [] });

const DecisionScanContext = createContext<DecisionScanContextValue | null>(null);

export const DecisionScanProvider = ({ children }: { children: ReactNode }) => {
  const [phase, setPhase] = useState<DecisionScanPhase>('idle');
  const [pendingCapture, setPendingCapture] = useState<{ key: string; dataUrl: string } | null>(null);
  const captureOwnerKeyRef = useRef<string | null>(null);
  // Drafts held in-memory (attachments cannot live in sessionStorage).
  const draftsRef = useRef<Map<string, DraftEntry>>(new Map());
  // Bump on any draft change so consumers rehydrate correctly on remount.
  const [, forceTick] = useState(0);

  const beginCapture = useCallback((key: string) => {
    captureOwnerKeyRef.current = key;
    setPendingCapture(null);
    setPhase('capturing');
    try { logDiagnostic('decision_scan_begin', { key }); } catch {}
  }, []);

  const completeCapture = useCallback((dataUrl: string) => {
    const key = captureOwnerKeyRef.current;
    if (key) setPendingCapture({ key, dataUrl });
    setPhase('idle');
    try { logDiagnostic('decision_scan_complete', { key, bytes: dataUrl?.length ?? 0 }); } catch {}
  }, []);

  const cancelCapture = useCallback(() => {
    setPhase('idle');
    setPendingCapture(null);
    captureOwnerKeyRef.current = null;
    try { logDiagnostic('decision_scan_cancel', {}); } catch {}
  }, []);

  const consumePendingCapture = useCallback((key: string): string | null => {
    if (!pendingCapture || pendingCapture.key !== key) return null;
    const url = pendingCapture.dataUrl;
    setPendingCapture(null);
    captureOwnerKeyRef.current = null;
    return url;
  }, [pendingCapture]);

  const ensureEntry = (key: string): DraftEntry => {
    let entry = draftsRef.current.get(key);
    if (!entry) {
      entry = { text: readTextFromStorage(key), attachments: [] };
      draftsRef.current.set(key, entry);
    }
    return entry;
  };

  const getDraft = useCallback((key: string): DraftEntry => {
    return ensureEntry(key);
  }, []);

  const saveTextDraft = useCallback((key: string, patch: Partial<DecisionTextDraft>) => {
    const entry = ensureEntry(key);
    entry.text = { ...entry.text, ...patch };
    writeTextToStorage(key, entry.text);
    forceTick((n) => n + 1);
  }, []);

  const saveAttachments = useCallback((key: string, files: File[]) => {
    const entry = ensureEntry(key);
    entry.attachments = files;
    forceTick((n) => n + 1);
  }, []);

  const clearDraft = useCallback((key: string) => {
    draftsRef.current.delete(key);
    clearTextFromStorage(key);
    forceTick((n) => n + 1);
  }, []);

  const value = useMemo<DecisionScanContextValue>(() => ({
    phase,
    pendingCapture,
    beginCapture,
    completeCapture,
    cancelCapture,
    consumePendingCapture,
    getDraft,
    saveTextDraft,
    saveAttachments,
    clearDraft,
  }), [phase, pendingCapture, beginCapture, completeCapture, cancelCapture, consumePendingCapture, getDraft, saveTextDraft, saveAttachments, clearDraft]);

  return (
    <DecisionScanContext.Provider value={value}>
      {children}
    </DecisionScanContext.Provider>
  );
};

const noop = () => {};

export const useDecisionScan = (): DecisionScanContextValue => {
  const ctx = useContext(DecisionScanContext);
  if (!ctx) {
    return {
      phase: 'idle',
      pendingCapture: null,
      beginCapture: noop,
      completeCapture: noop,
      cancelCapture: noop,
      consumePendingCapture: () => null,
      getDraft: () => emptyDraft(),
      saveTextDraft: noop,
      saveAttachments: noop,
      clearDraft: noop,
    };
  }
  return ctx;
};

// Silence unused-import lint if effects unused
export const __DecisionScanCtxRef = DecisionScanContext;
export const __unused = useEffect;
