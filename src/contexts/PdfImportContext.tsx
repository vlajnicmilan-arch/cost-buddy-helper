import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Expense } from '@/types/expense';
import type { CustomPaymentSource } from '@/types/customPaymentSource';
import type { ParsedTransaction } from '@/lib/csvParsers';
import type { PDFParseResult } from '@/hooks/usePDFParser';
import { logDiagnostic } from '@/lib/diagnosticLogger';

export type PdfImportPhase = 'idle' | 'starting' | 'processing' | 'preview' | 'duplicates' | 'importing';

export type FindPdfDuplicatesHandler = (transactions: ParsedTransaction[]) => {
  duplicates: ParsedTransaction[];
  fuzzyDuplicates: ParsedTransaction[];
  fuzzyMatchedExpenses: Expense[];
  autoGenMatches: { tx: ParsedTransaction; existing: Expense }[];
  unique: ParsedTransaction[];
};

interface PdfImportHandlers {
  onImportCSV: (transactions: ParsedTransaction[]) => Promise<void>;
  findDuplicates?: FindPdfDuplicatesHandler;
}

interface StartPdfImportOptions {
  file: File;
  source: CustomPaymentSource;
  releaseGuard?: () => void;
}

interface StartHtmlImportOptions {
  file: File;
  source: CustomPaymentSource;
  releaseGuard?: () => void;
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
  _setIdle: () => void;
  _setImporting: (importing: boolean) => void;
  _runImport: (transactions: ParsedTransaction[]) => Promise<void>;
  _runFindDuplicates: FindPdfDuplicatesHandler | null;
  _pendingPdfRef: React.MutableRefObject<StartPdfImportOptions | null>;
  _pendingHtmlRef: React.MutableRefObject<StartHtmlImportOptions | null>;
}

const noop = () => {};

const PdfImportContext = createContext<PdfImportContextValue | null>(null);

export const PdfImportProvider = ({ children }: { children: ReactNode }) => {
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

  const _runImport = useCallback(async (transactions: ParsedTransaction[]) => {
    const handlers = handlersRef.current;
    if (!handlers) {
      try { logDiagnostic({ event: 'global_pdf_import_no_handler', severity: 'error', details: { count: transactions.length } }); } catch {}
      return;
    }
    await handlers.onImportCSV(transactions);
  }, []);

  const _runFindDuplicates = useMemo(() => {
    return handlersRef.current?.findDuplicates ?? null;
  }, [hasHandlers]);

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
    _setIdle,
    _setImporting,
    _runImport,
    _runFindDuplicates,
    _pendingPdfRef: pendingPdfRef,
    _pendingHtmlRef: pendingHtmlRef,
  }), [phase, source, jobId, result, hasHandlers, startPdfImport, startHtmlImport, registerHandlers, _setProcessing, _setPreview, _setIdle, _setImporting, _runImport, _runFindDuplicates]);

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
      _setIdle: noop,
      _setImporting: noop,
      _runImport: async () => {},
      _runFindDuplicates: null,
      _pendingPdfRef: { current: null },
      _pendingHtmlRef: { current: null },
    };
  }
  return ctx;
};