import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ParsedTransaction } from '@/lib/csvParsers';
import type { Expense } from '@/types/expense';
import { logDiagnostic } from '@/lib/diagnosticLogger';

export interface PdfImportSource {
  id: string;
  name: string;
  icon?: string;
  color?: string;
}

export interface ParsedPDFTransaction {
  date: Date;
  description: string;
  amount: number;
  type: string;
  category: string;
  merchant_name: string | null;
  card_last4?: string | null;
}

export interface ParsedPDFData {
  transactions: ParsedPDFTransaction[];
  detected_bank: string | null;
  account_iban: string | null;
  holder_name: string | null;
  cards_detected: string[];
  summary: {
    total_income: number;
    total_expenses: number;
    transaction_count: number;
  } | null;
}

export type FindDuplicatesFn = (txs: ParsedTransaction[]) => {
  duplicates: ParsedTransaction[];
  fuzzyDuplicates: ParsedTransaction[];
  fuzzyMatchedExpenses: Expense[];
  unique: ParsedTransaction[];
};
export type ImportTransactionsFn = (txs: ParsedTransaction[]) => Promise<void>;

export interface PdfImportHandlers {
  importTransactions: ImportTransactionsFn;
  findDuplicates?: FindDuplicatesFn;
  onAfterImport?: () => void;
}

export type PdfImportPhase = 'idle' | 'starting' | 'processing' | 'preview';

interface PdfImportState {
  phase: PdfImportPhase;
  source: PdfImportSource | null;
  jobId: string | null;
  result: ParsedPDFData | null;
}

interface PdfImportContextValue extends PdfImportState {
  /** Begin a NEW PDF import: set source + job, host will poll. */
  startImport: (args: { source: PdfImportSource; jobId: string; handlers: PdfImportHandlers }) => void;
  /** Re-attach to an in-flight job (e.g. localStorage recovery). */
  resumeJob: (args: { source: PdfImportSource; jobId: string; handlers: PdfImportHandlers }) => void;
  /** A job already finished — open preview immediately. */
  showCompleted: (args: { source: PdfImportSource; jobId: string | null; result: ParsedPDFData; handlers: PdfImportHandlers }) => void;
  /** Update phase from inside the host poller. */
  setPhase: (phase: PdfImportPhase) => void;
  /** Host calls this when poll finishes successfully. */
  applyResult: (result: ParsedPDFData) => void;
  /** Cancel/close everything. */
  cancel: () => void;
  /** Internal: handlers ref (used by host). */
  getHandlers: () => PdfImportHandlers | null;
}

const PdfImportContext = createContext<PdfImportContextValue | null>(null);

export const PdfImportProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<PdfImportState>({
    phase: 'idle',
    source: null,
    jobId: null,
    result: null,
  });
  const handlersRef = useRef<PdfImportHandlers | null>(null);

  const startImport: PdfImportContextValue['startImport'] = useCallback(({ source, jobId, handlers }) => {
    handlersRef.current = handlers;
    setState({ phase: 'processing', source, jobId, result: null });
    try { logDiagnostic('pdf_import_ctx_start', { source_id: source.id, job_id: jobId }); } catch {}
  }, []);

  const resumeJob: PdfImportContextValue['resumeJob'] = useCallback(({ source, jobId, handlers }) => {
    handlersRef.current = handlers;
    setState({ phase: 'processing', source, jobId, result: null });
    try { logDiagnostic('pdf_import_ctx_resume', { source_id: source.id, job_id: jobId }); } catch {}
  }, []);

  const showCompleted: PdfImportContextValue['showCompleted'] = useCallback(({ source, jobId, result, handlers }) => {
    handlersRef.current = handlers;
    setState({ phase: 'preview', source, jobId, result });
    try { logDiagnostic('pdf_import_ctx_show_completed', { source_id: source.id, job_id: jobId, count: result.transactions.length }); } catch {}
  }, []);

  const setPhase = useCallback((phase: PdfImportPhase) => {
    setState((s) => ({ ...s, phase }));
  }, []);

  const applyResult = useCallback((result: ParsedPDFData) => {
    setState((s) => ({ ...s, phase: 'preview', result }));
    try { logDiagnostic('pdf_import_ctx_apply_result', { source_id: state.source?.id ?? null, count: result.transactions.length }); } catch {}
  }, [state.source]);

  const cancel = useCallback(() => {
    handlersRef.current = null;
    setState({ phase: 'idle', source: null, jobId: null, result: null });
    try { logDiagnostic('pdf_import_ctx_cancel', {}); } catch {}
  }, []);

  const getHandlers = useCallback(() => handlersRef.current, []);

  const value = useMemo<PdfImportContextValue>(() => ({
    ...state,
    startImport,
    resumeJob,
    showCompleted,
    setPhase,
    applyResult,
    cancel,
    getHandlers,
  }), [state, startImport, resumeJob, showCompleted, setPhase, applyResult, cancel, getHandlers]);

  return <PdfImportContext.Provider value={value}>{children}</PdfImportContext.Provider>;
};

export const usePdfImport = (): PdfImportContextValue => {
  const ctx = useContext(PdfImportContext);
  if (!ctx) throw new Error('usePdfImport must be used within PdfImportProvider');
  return ctx;
};

export const PDF_IMPORT_STORAGE_PREFIX = 'vmb-pdf-parse-job:';
export const PDF_IMPORT_TTL_MS = 15 * 60 * 1000;

export interface StoredPdfJob {
  jobId: string;
  sourceId: string;
  sourceName?: string;
  sourceIcon?: string;
  sourceColor?: string;
  startedAt: string;
}
