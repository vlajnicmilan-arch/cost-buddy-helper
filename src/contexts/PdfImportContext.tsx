import { createContext, useCallback, useContext, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Expense } from '@/types/expense';
import type { CustomPaymentSource } from '@/types/customPaymentSource';
import type { ParsedTransaction } from '@/lib/csvParsers';
import type { PDFParseResult } from '@/hooks/usePDFParser';
import { logDiagnostic } from '@/lib/diagnosticLogger';
import { showError } from '@/hooks/useStatusFeedback';
import { IMPORT_FROZEN } from '@/lib/featureFlags';

export type PdfImportPhase = 'idle' | 'starting' | 'processing' | 'preview' | 'duplicates' | 'importing';

export type FindPdfDuplicatesHandler = (transactions: ParsedTransaction[]) => {
  duplicates: ParsedTransaction[];
  fuzzyDuplicates: ParsedTransaction[];
  fuzzyMatchedExpenses: Expense[];
  suspiciousDuplicates: ParsedTransaction[];
  suspiciousMatchedExpenses: Expense[];
  autoGenMatches: { tx: ParsedTransaction; existing: Expense }[];
  autoMergeMatches: { tx: ParsedTransaction; existing: Expense }[];
  unique: ParsedTransaction[];
};

export type ForcedManualMerge = { tx: ParsedTransaction; manualId: string };

export type ImportMeta = { batchId: string; inserted: number; merged: number; skipped: number };

interface PdfImportHandlers {
  onImportCSV: (
    transactions: ParsedTransaction[],
    opts?: { forcedManualMerges?: ForcedManualMerge[]; onMeta?: (meta: ImportMeta) => void },
  ) => Promise<void>;
  findDuplicates?: FindPdfDuplicatesHandler;
}

interface StartPdfImportOptions {
  file: File;
  source: CustomPaymentSource;
  releaseGuard?: () => void;
  forceImport?: boolean;
}

interface StartHtmlImportOptions {
  file: File;
  source: CustomPaymentSource;
  releaseGuard?: () => void;
  forceImport?: boolean;
}

interface PdfImportContextValue {
  phase: PdfImportPhase;
  isBusy: boolean;
  source: CustomPaymentSource | null;
  jobId: string | null;
  result: PDFParseResult | null;
  hasHandlers: boolean;
  startPdfImport: (options: StartPdfImportOptions) => Promise<void>;
  startHtmlImport: (options: StartHtmlImportOptions) => Promise<void>;
  registerHandlers: (handlers: PdfImportHandlers) => () => void;
  _setProcessing: (source: CustomPaymentSource, jobId: string) => void;
  _setPreview: (result: PDFParseResult, jobId: string | null) => void;
  _setDuplicates: () => void;
  _setIdle: () => void;
  _setImporting: (importing: boolean) => void;
  _runImport: (transactions: ParsedTransaction[], opts?: { forcedManualMerges?: ForcedManualMerge[]; onMeta?: (meta: ImportMeta) => void }) => Promise<void>;
  _runFindDuplicates: (transactions: ParsedTransaction[]) => ReturnType<FindPdfDuplicatesHandler> | null;
  _pendingPdfRef: MutableRefObject<StartPdfImportOptions | null>;
  _pendingHtmlRef: MutableRefObject<StartHtmlImportOptions | null>;
}

const noop = () => {};

const PdfImportContext = createContext<PdfImportContextValue | null>(null);

export const PdfImportProvider = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<PdfImportPhase>('idle');
  const [source, setSource] = useState<CustomPaymentSource | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [result, setResult] = useState<PDFParseResult | null>(null);
  const [hasHandlers, setHasHandlers] = useState(false);
  const handlersRef = useRef<PdfImportHandlers | null>(null);
  const pendingPdfRef = useRef<StartPdfImportOptions | null>(null);
  const pendingHtmlRef = useRef<StartHtmlImportOptions | null>(null);

  const startPdfImport = useCallback(async (options: StartPdfImportOptions) => {
    pendingPdfRef.current = options;
    pendingHtmlRef.current = null;
    setSource(options.source);
    setResult(null);
    setJobId(null);
    setPhase('starting');
    try { logDiagnostic('global_pdf_import_start_requested', { source_id: options.source.id, file_size: options.file.size }); } catch {}
  }, []);

  const startHtmlImport = useCallback(async (options: StartHtmlImportOptions) => {
    pendingHtmlRef.current = options;
    pendingPdfRef.current = null;
    setSource(options.source);
    setResult(null);
    setJobId(null);
    setPhase('starting');
    try { logDiagnostic('global_html_import_start_requested', { source_id: options.source.id, file_size: options.file.size }); } catch {}
  }, []);

  const registerHandlers = useCallback((handlers: PdfImportHandlers) => {
    handlersRef.current = handlers;
    setHasHandlers(true);
    try { logDiagnostic('global_pdf_import_handlers_registered', {}); } catch {}
    return () => {
      if (handlersRef.current === handlers) {
        handlersRef.current = null;
        setHasHandlers(false);
        try { logDiagnostic('global_pdf_import_handlers_unregistered', {}); } catch {}
      }
    };
  }, []);

  const _setProcessing = useCallback((nextSource: CustomPaymentSource, nextJobId: string) => {
    setSource(nextSource);
    setJobId(nextJobId);
    setPhase('processing');
  }, []);

  const _setPreview = useCallback((nextResult: PDFParseResult, nextJobId: string | null) => {
    setResult(nextResult);
    setJobId(nextJobId);
    setPhase('preview');
  }, []);

  const _setDuplicates = useCallback(() => {
    setPhase('duplicates');
  }, []);

  const _setIdle = useCallback(() => {
    pendingPdfRef.current = null;
    pendingHtmlRef.current = null;
    setPhase('idle');
    setSource(null);
    setJobId(null);
    setResult(null);
  }, []);

  const _setImporting = useCallback((importing: boolean) => {
    setPhase(importing ? 'importing' : 'preview');
  }, []);

  const _runImport = useCallback(async (transactions: ParsedTransaction[], opts?: { forcedManualMerges?: ForcedManualMerge[]; onMeta?: (meta: ImportMeta) => void }) => {
    if (IMPORT_FROZEN) {
      showError(t('import.frozen'));
      try { logDiagnostic('global_pdf_import_run_blocked_frozen', { count: transactions.length }); } catch {}
      return;
    }
    const handlers = handlersRef.current;
    if (!handlers) {
      try { logDiagnostic({ event: 'global_pdf_import_no_handler', severity: 'error', details: { count: transactions.length } }); } catch {}
      return;
    }
    await handlers.onImportCSV(transactions, opts);
  }, [t]);

  const _runFindDuplicates = useCallback((transactions: ParsedTransaction[]) => {
    return handlersRef.current?.findDuplicates?.(transactions) ?? null;
  }, []);

  const value = useMemo<PdfImportContextValue>(() => ({
    phase,
    isBusy: phase === 'starting' || phase === 'processing' || phase === 'importing',
    source,
    jobId,
    result,
    hasHandlers,
    startPdfImport,
    startHtmlImport,
    registerHandlers,
    _setProcessing,
    _setPreview,
    _setDuplicates,
    _setIdle,
    _setImporting,
    _runImport,
    _runFindDuplicates,
    _pendingPdfRef: pendingPdfRef,
    _pendingHtmlRef: pendingHtmlRef,
  }), [phase, source, jobId, result, hasHandlers, startPdfImport, startHtmlImport, registerHandlers, _setProcessing, _setPreview, _setDuplicates, _setIdle, _setImporting, _runImport, _runFindDuplicates]);

  return <PdfImportContext.Provider value={value}>{children}</PdfImportContext.Provider>;
};

export const usePdfImport = (): PdfImportContextValue => {
  const ctx = useContext(PdfImportContext);
  if (!ctx) {
    return {
      phase: 'idle',
      isBusy: false,
      source: null,
      jobId: null,
      result: null,
      hasHandlers: false,
      startPdfImport: async () => {},
      startHtmlImport: async () => {},
      registerHandlers: () => noop,
      _setProcessing: noop,
      _setPreview: noop,
      _setDuplicates: noop,
      _setIdle: noop,
      _setImporting: noop,
      _runImport: async () => {},
      _runFindDuplicates: () => null,
      _pendingPdfRef: { current: null },
      _pendingHtmlRef: { current: null },
    };
  }
  return ctx;
};