import { createContext, useCallback, useContext, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
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
  /** Mail stavka iz koje je datoteka otvorena; serverski fallback kad SHA nije dostupan. */
  sourceDocumentItemId?: string | null;
  releaseGuard?: () => void;
  forceImport?: boolean;
  /** Završni saldo ispisan na izvodu (mail ekstrakcija) — bankovna istina bez Open Bankinga. */
  statementClosingBalance?: number | null;
  /** Datum na koji taj saldo vrijedi (ISO ili YYYY-MM-DD). */
  statementDate?: string | null;
}

interface StartHtmlImportOptions {
  file: File;
  source: CustomPaymentSource;
  releaseGuard?: () => void;
  forceImport?: boolean;
}

export interface StatementBalanceHint {
  readonly closingBalance: number | null;
  readonly statementDate: string | null;
}

interface PdfImportContextValue {
  phase: PdfImportPhase;
  isBusy: boolean;
  source: CustomPaymentSource | null;
  jobId: string | null;
  result: PDFParseResult | null;
  hasHandlers: boolean;
  /** Saldo s papira za tekući uvoz; null kad ga nema (ručni upload). */
  statementBalanceHint: StatementBalanceHint | null;
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
  
  const [phase, setPhase] = useState<PdfImportPhase>('idle');
  const [source, setSource] = useState<CustomPaymentSource | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [result, setResult] = useState<PDFParseResult | null>(null);
  const [hasHandlers, setHasHandlers] = useState(false);
  const [statementBalanceHint, setStatementBalanceHint] = useState<StatementBalanceHint | null>(null);
  const handlersRef = useRef<PdfImportHandlers | null>(null);
  const pendingPdfRef = useRef<StartPdfImportOptions | null>(null);
  const pendingHtmlRef = useRef<StartHtmlImportOptions | null>(null);

  const startPdfImport = useCallback(async (options: StartPdfImportOptions) => {
    pendingPdfRef.current = options;
    setStatementBalanceHint(
      typeof options.statementClosingBalance === 'number'
        ? { closingBalance: options.statementClosingBalance, statementDate: options.statementDate ?? null }
        : null,
    );
    pendingHtmlRef.current = null;
    setSource(options.source);
    setResult(null);
    setJobId(null);
    setPhase('starting');
    try { logDiagnostic('global_pdf_import_start_requested', { source_id: options.source.id, file_size: options.file.size }); } catch {}
  }, []);

  const startHtmlImport = useCallback(async (options: StartHtmlImportOptions) => {
    pendingHtmlRef.current = options;
    setStatementBalanceHint(null);
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
    // SALDO PRIPADA IZVODU, NE PUTU: mail-put donese saldo već u
    // `startPdfImport`, disk-put ga dobije tek iz čitanja (parse-pdf-statement).
    // Mig s maila ima prednost — ovdje se puni SAMO kad ga još nema.
    setStatementBalanceHint((current) => {
      if (current && typeof current.closingBalance === 'number') return current;
      const closing = nextResult.closing_balance;
      if (typeof closing !== 'number' || !Number.isFinite(closing)) return current;
      return { closingBalance: closing, statementDate: nextResult.statement_period_to ?? null };
    });
  }, []);


  const _setDuplicates = useCallback(() => {
    setPhase('duplicates');
  }, []);

  const _setIdle = useCallback(() => {
    pendingPdfRef.current = null;
    pendingHtmlRef.current = null;
    setPhase('idle');
    setStatementBalanceHint(null);
    setSource(null);
    setJobId(null);
    setResult(null);
  }, []);

  const _setImporting = useCallback((importing: boolean) => {
    setPhase(importing ? 'importing' : 'preview');
  }, []);

  const _runImport = useCallback(async (transactions: ParsedTransaction[], opts?: { forcedManualMerges?: ForcedManualMerge[]; onMeta?: (meta: ImportMeta) => void }) => {
    // NOTE (Korak 4): live PDF/HTML uvoz sada teče kroz Import Review executor
    // (src/lib/importReview/executor.ts). Ovaj legacy hook je zadržan za CSV
    // dialog dok se i on ne prebaci — dotad ga čuva CSV_IMPORT_ENABLED=false
    // flag u call-siteu.
    const handlers = handlersRef.current;
    if (!handlers) {
      try { logDiagnostic({ event: 'global_pdf_import_no_handler', severity: 'error', details: { count: transactions.length } }); } catch {}
      return;
    }
    await handlers.onImportCSV(transactions, opts);
  }, []);

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
    statementBalanceHint,
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
  }), [phase, source, jobId, result, hasHandlers, statementBalanceHint, startPdfImport, startHtmlImport, registerHandlers, _setProcessing, _setPreview, _setDuplicates, _setIdle, _setImporting, _runImport, _runFindDuplicates]);

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
      statementBalanceHint: null,
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