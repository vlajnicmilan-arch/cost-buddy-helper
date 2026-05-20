import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Loader2, Upload, X as XIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useCurrency } from '@/contexts/CurrencyContext';
import { usePdfImport } from '@/contexts/PdfImportContext';
import { usePDFParser } from '@/hooks/usePDFParser';
import { useAuth } from '@/hooks/useAuth';
import type { ParsedTransaction } from '@/lib/csvParsers';
import { logDiagnostic } from '@/lib/diagnosticLogger';
import { cn } from '@/lib/utils';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import {
  computeFileHash,
  computeContentHash,
  findExistingStatement,
  recordImportedStatement,
  type ExistingStatement,
} from '@/lib/statementFingerprint';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import type { CustomPaymentSource } from '@/types/customPaymentSource';

const PDF_JOB_TTL_MS = 15 * 60 * 1000;

type DuplicateInfo = {
  duplicates: ParsedTransaction[];
  fuzzyDuplicates: ParsedTransaction[];
  fuzzyMatchedExpenses: import('@/types/expense').Expense[];
  unique: ParsedTransaction[];
};

type StatementDuplicate = {
  existing: ExistingStatement;
  retry: () => void;
};

const readAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('file_read_failed'));
  reader.onload = event => resolve(String(event.target?.result || ''));
  reader.readAsDataURL(file);
});

export const GlobalPDFImportHost = () => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const pdfImport = usePdfImport();
  const { user } = useAuth();
  const { startPDFParseJob, waitForPDFParseJob, fetchPDFParseJob, normalizeJobResult, parseHTML } = usePDFParser();
  const [duplicateInfo, setDuplicateInfo] = useState<DuplicateInfo | null>(null);
  const [includeDuplicates, setIncludeDuplicates] = useState(false);
  const [selectedFuzzy, setSelectedFuzzy] = useState<Set<number>>(new Set());
  const [statementDup, setStatementDup] = useState<StatementDuplicate | null>(null);
  const fileHashRef = useRef<string | null>(null);
  const contentHashRef = useRef<string | null>(null);
  const fileMetaRef = useRef<{ name: string; size: number; type: string } | null>(null);

  const storageKey = useMemo(() => (
    pdfImport.source ? `vmb-pdf-parse-job:${pdfImport.source.id}` : null
  ), [pdfImport.source]);

  const clearStoredJob = useCallback(() => {
    if (!storageKey) return;
    try { localStorage.removeItem(storageKey); } catch {}
  }, [storageKey]);

  const resetAll = useCallback(() => {
    clearStoredJob();
    setDuplicateInfo(null);
    setIncludeDuplicates(false);
    setSelectedFuzzy(new Set());
    setStatementDup(null);
    fileHashRef.current = null;
    contentHashRef.current = null;
    fileMetaRef.current = null;
    pdfImport._setIdle();
  }, [clearStoredJob, pdfImport._setIdle]);

  const toParsedTransactions = useCallback((): ParsedTransaction[] => {
    if (!pdfImport.result || !pdfImport.source) return [];
    const paymentSourceValue = `custom:${pdfImport.source.id}`;
    return pdfImport.result.transactions.map(tx => ({
      date: tx.date,
      description: tx.description,
      amount: tx.amount,
      type: tx.type,
      category: tx.category,
      merchant_name: tx.merchant_name || undefined,
      source: 'pdf' as const,
      payment_source: paymentSourceValue as any,
    }));
  }, [pdfImport.result, pdfImport.source]);

  useEffect(() => {
    if (pdfImport.phase !== 'starting' || !pdfImport.source) return;

    const pendingPdf = pdfImport._pendingPdfRef.current;
    const pendingHtml = pdfImport._pendingHtmlRef.current;
    pdfImport._pendingPdfRef.current = null;
    pdfImport._pendingHtmlRef.current = null;
    if (!pendingPdf && !pendingHtml) return;

    const source = pdfImport.source;

    const showStatementDuplicate = (
      existing: ExistingStatement,
      retryOptions:
        | { kind: 'pdf'; opts: typeof pendingPdf }
        | { kind: 'html'; opts: typeof pendingHtml },
    ) => {
      pendingPdf?.releaseGuard?.();
      pendingHtml?.releaseGuard?.();
      const retry = () => {
        setStatementDup(null);
        if (retryOptions.kind === 'pdf' && retryOptions.opts) {
          void pdfImport.startPdfImport({ ...retryOptions.opts, forceImport: true });
        } else if (retryOptions.kind === 'html' && retryOptions.opts) {
          void pdfImport.startHtmlImport({ ...retryOptions.opts, forceImport: true });
        }
      };
      setStatementDup({ existing, retry });
      // Reset phase but keep the dialog open via statementDup state.
      pdfImport._setIdle();
    };

    const run = async () => {
      try {
        if (pendingPdf) {
          fileMetaRef.current = {
            name: pendingPdf.file.name,
            size: pendingPdf.file.size,
            type: pendingPdf.file.type || 'application/pdf',
          };

          // Guard 1: file-hash check before parsing.
          if (user?.id && !pendingPdf.forceImport) {
            try {
              const fileHash = await computeFileHash(pendingPdf.file);
              fileHashRef.current = fileHash;
              const existing = await findExistingStatement(user.id, { fileHash });
              if (existing) {
                showStatementDuplicate(existing, { kind: 'pdf', opts: pendingPdf });
                return;
              }
            } catch (e) {
              // Hash failure should not block import.
              fileHashRef.current = null;
            }
          }

          const base64 = await readAsDataUrl(pendingPdf.file);
          if (!base64) throw new Error('file_read_failed');
          const jobId = await startPDFParseJob(base64);
          try {
            localStorage.setItem(`vmb-pdf-parse-job:${source.id}`, JSON.stringify({
              jobId,
              sourceId: source.id,
              source,
              startedAt: new Date().toISOString(),
            }));
          } catch {}
          pdfImport._setProcessing(source, jobId);
          const result = await waitForPDFParseJob(jobId);
          if (!result) return;
          if (result.transactions.length === 0) {
            toast.warning(t('toasts.pdfNoTransactions'));
            resetAll();
            return;
          }

          // Guard 2: content-hash check after parsing.
          if (user?.id && !pendingPdf.forceImport) {
            try {
              const paymentSourceValue = `custom:${source.id}`;
              const contentHash = await computeContentHash(user.id, paymentSourceValue, result.transactions);
              contentHashRef.current = contentHash;
              const existing = await findExistingStatement(user.id, { contentHash });
              if (existing) {
                clearStoredJob();
                showStatementDuplicate(existing, { kind: 'pdf', opts: pendingPdf });
                return;
              }
            } catch (e) {
              contentHashRef.current = null;
            }
          }

          clearStoredJob();
          pdfImport._setPreview(result, jobId);
          try { logDiagnostic('global_pdf_import_preview_opened', { job_id: jobId, source_id: source.id, count: result.transactions.length }); } catch {}
          return;
        }

        if (pendingHtml) {
          fileMetaRef.current = {
            name: pendingHtml.file.name,
            size: pendingHtml.file.size,
            type: pendingHtml.file.type || 'text/html',
          };

          if (user?.id && !pendingHtml.forceImport) {
            try {
              const fileHash = await computeFileHash(pendingHtml.file);
              fileHashRef.current = fileHash;
              const existing = await findExistingStatement(user.id, { fileHash });
              if (existing) {
                showStatementDuplicate(existing, { kind: 'html', opts: pendingHtml });
                return;
              }
            } catch (e) {
              fileHashRef.current = null;
            }
          }

          const content = await pendingHtml.file.text();
          const result = await parseHTML(content);
          if (!result) return;
          if (result.transactions.length === 0) {
            toast.warning(t('toasts.htmlNoTransactions'));
            resetAll();
            return;
          }

          if (user?.id && !pendingHtml.forceImport) {
            try {
              const paymentSourceValue = `custom:${source.id}`;
              const contentHash = await computeContentHash(user.id, paymentSourceValue, result.transactions);
              contentHashRef.current = contentHash;
              const existing = await findExistingStatement(user.id, { contentHash });
              if (existing) {
                showStatementDuplicate(existing, { kind: 'html', opts: pendingHtml });
                return;
              }
            } catch (e) {
              contentHashRef.current = null;
            }
          }

          pdfImport._setPreview(result, null);
          try { logDiagnostic('global_html_import_preview_opened', { source_id: source.id, count: result.transactions.length }); } catch {}
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        try { logDiagnostic('global_pdf_import_failed', { source_id: source.id, message }); } catch {}
        showError(t(pendingHtml ? 'toasts.htmlAnalysisError' : 'toasts.pdfAnalysisError'));
        resetAll();
      } finally {
        pendingPdf?.releaseGuard?.();
        pendingHtml?.releaseGuard?.();
      }
    };

    void run();
  }, [clearStoredJob, parseHTML, pdfImport._pendingHtmlRef, pdfImport._pendingPdfRef, pdfImport._setPreview, pdfImport._setProcessing, pdfImport.phase, pdfImport.source, resetAll, startPDFParseJob, t, waitForPDFParseJob]);

  useEffect(() => {
    if (pdfImport.phase !== 'idle') return;

    const recover = async () => {
      const prefix = 'vmb-pdf-parse-job:';
      const storedJobs: Array<{ jobId: string; sourceId: string; source: any; startedAt: string }> = [];
      try {
        for (let i = 0; i < localStorage.length; i += 1) {
          const key = localStorage.key(i);
          if (!key?.startsWith(prefix)) continue;
          const raw = localStorage.getItem(key);
          if (!raw) continue;
          const parsed = JSON.parse(raw);
          const startedAt = parsed.startedAt ? new Date(parsed.startedAt).getTime() : 0;
          if (!parsed.jobId || !parsed.sourceId || !parsed.source || !startedAt || Date.now() - startedAt > PDF_JOB_TTL_MS) {
            localStorage.removeItem(key);
            continue;
          }
          storedJobs.push(parsed);
        }
      } catch {}

      const stored = storedJobs.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0];
      if (!stored) return;

      try {
        const source = stored.source as import('@/types/customPaymentSource').CustomPaymentSource;
        const job = await fetchPDFParseJob(stored.jobId);
        if (!job || job.status === 'failed') {
          try { localStorage.removeItem(`${prefix}${stored.sourceId}`); } catch {}
          return;
        }
        if (job.status === 'completed' && job.result) {
          const result = normalizeJobResult(job.result);
          try { localStorage.removeItem(`${prefix}${stored.sourceId}`); } catch {}
          if (result.transactions.length > 0) pdfImport._setPreview(result, stored.jobId);
          return;
        }
        pdfImport._setProcessing(source, stored.jobId);
        const result = await waitForPDFParseJob(stored.jobId);
        try { localStorage.removeItem(`${prefix}${stored.sourceId}`); } catch {}
        if (result?.transactions.length) pdfImport._setPreview(result, stored.jobId);
      } catch (error) {
        try { logDiagnostic('global_pdf_import_recovery_failed', { message: error instanceof Error ? error.message : String(error) }); } catch {}
      }
    };

    void recover();
  }, [fetchPDFParseJob, normalizeJobResult, pdfImport, waitForPDFParseJob]);

  const handleImport = async () => {
    if (!pdfImport.source || !pdfImport.result) return;
    const transactions = toParsedTransactions();
    try { logDiagnostic('global_pdf_import_clicked', { source_id: pdfImport.source.id, count: transactions.length }); } catch {}

    try {
      pdfImport._setImporting(true);
      const duplicateResult = pdfImport._runFindDuplicates(transactions);
      if (duplicateResult && (duplicateResult.duplicates.length > 0 || duplicateResult.fuzzyDuplicates.length > 0)) {
        if (duplicateResult.unique.length === 0 && duplicateResult.fuzzyDuplicates.length === 0) {
          toast.info(t('import.noNewTransactions'));
          resetAll();
          return;
        }
        setDuplicateInfo(duplicateResult);
        setIncludeDuplicates(false);
        setSelectedFuzzy(new Set());
        pdfImport._setDuplicates();
        return;
      }
      await pdfImport._runImport(transactions);
      showSuccess(t('import.importedFromPDF', { count: transactions.length }));
      resetAll();
    } catch (error) {
      try { logDiagnostic('global_pdf_import_save_failed', { message: error instanceof Error ? error.message : String(error) }); } catch {}
      showError(t('toasts.importError'));
      pdfImport._setImporting(false);
    }
  };

  const handleImportDuplicates = async () => {
    if (!duplicateInfo) return;
    const fuzzyToInclude = duplicateInfo.fuzzyDuplicates.filter((_, index) => selectedFuzzy.has(index));
    const strictToInclude = includeDuplicates ? duplicateInfo.duplicates : [];
    const transactions = [...duplicateInfo.unique, ...fuzzyToInclude, ...strictToInclude];
    if (transactions.length === 0) {
      toast.info(t('import.noNewTransactions'));
      resetAll();
      return;
    }
    try {
      pdfImport._setImporting(true);
      await pdfImport._runImport(transactions);
      showSuccess(t('import.importedTransactions', { count: transactions.length }));
      resetAll();
    } catch (error) {
      try { logDiagnostic('global_pdf_duplicate_import_failed', { message: error instanceof Error ? error.message : String(error) }); } catch {}
      showError(t('toasts.importError'));
      pdfImport._setDuplicates();
    }
  };

  const isProcessing = pdfImport.phase === 'starting' || pdfImport.phase === 'processing';
  const isImporting = pdfImport.phase === 'importing';
  const result = pdfImport.result;
  const source = pdfImport.source;

  return (
    <>
      <AnimatePresence>
        {isProcessing && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[90] bg-background/90 backdrop-blur-sm flex items-center justify-center p-6">
            <motion.div initial={{ scale: 0.96, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 10 }} className="w-full max-w-sm rounded-xl border border-border/60 bg-background shadow-2xl p-6 flex flex-col items-center gap-4 text-center">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
              <div className="space-y-1">
                <h2 className="text-lg font-semibold">{t(pdfImport.phase === 'starting' ? 'import.pdfStarting' : 'import.pdfProcessing')}</h2>
                <p className="text-sm text-muted-foreground">{t('import.pdfProcessingDescription')}</p>
              </div>
              <div className="h-2 w-48 overflow-hidden rounded-full bg-secondary">
                <motion.div className="h-full bg-primary rounded-full" initial={{ x: '-100%' }} animate={{ x: '100%' }} transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }} style={{ width: '40%' }} />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {pdfImport.phase === 'preview' && result && source && (
          <motion.div role="dialog" aria-modal="true" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[90] bg-background/90 backdrop-blur-sm p-3 sm:p-6 flex items-center justify-center">
            <motion.div initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.98 }} transition={{ duration: 0.18 }} className="w-full max-w-lg max-h-[88dvh] bg-background border border-border/50 shadow-2xl rounded-xl flex flex-col overflow-hidden">
              <div className="flex items-center justify-between gap-3 p-4 border-b border-border/50">
                <h2 className="flex items-center gap-2 text-base font-semibold min-w-0">
                  <Upload className="w-5 h-5 text-primary shrink-0" />
                  <span className="truncate">{t('import.foundTransactions')} → {source.name}</span>
                </h2>
                <Button type="button" variant="ghost" size="icon" onClick={resetAll} className="h-10 w-10 shrink-0" aria-label={t('common.close')}>
                  <XIcon className="h-5 w-5" />
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {(result.detected_bank || result.account_iban || result.cards_detected.length > 0) && (
                  <div className="p-3 bg-primary/10 rounded-xl text-sm space-y-1">
                    {result.detected_bank && <p className="font-medium">🏦 {t('import.bank')}: <span className="text-primary">{result.detected_bank}</span></p>}
                    {result.account_iban && <p className="text-muted-foreground text-xs font-mono">{t('import.account')}: {result.account_iban}</p>}
                    {result.cards_detected.length > 0 && <p className="text-muted-foreground text-xs">💳 {t('import.cards')}: {result.cards_detected.map(card => `*${card}`).join(', ')}</p>}
                  </div>
                )}
                {result.summary && (
                  <div className="grid grid-cols-3 gap-2 p-3 bg-muted/50 rounded-xl text-sm">
                    <div className="text-center"><p className="text-muted-foreground">{t('import.income')}</p><p className="font-bold text-income">{formatAmount(result.summary.total_income)}</p></div>
                    <div className="text-center"><p className="text-muted-foreground">{t('import.expenses')}</p><p className="font-bold text-expense">{formatAmount(result.summary.total_expenses)}</p></div>
                    <div className="text-center"><p className="text-muted-foreground">{t('import.total')}</p><p className="font-bold">{result.summary.transaction_count}</p></div>
                  </div>
                )}
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {result.transactions.map((tx, index) => (
                    <div key={`${tx.date.toISOString()}-${index}`} className="flex items-center justify-between gap-3 p-3 bg-background/50 rounded-xl text-sm border border-border/40">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{tx.description}</p>
                        <p className="text-xs text-muted-foreground">{tx.date.toLocaleDateString()} • {tx.merchant_name || tx.category}{tx.card_last4 && <span className="ml-1 font-mono">(*{tx.card_last4})</span>}</p>
                      </div>
                      <p className={cn('font-mono font-bold shrink-0', tx.type === 'income' ? 'text-income' : tx.type === 'transfer' ? 'text-muted-foreground' : 'text-expense')}>{tx.type === 'income' ? '+' : tx.type === 'transfer' ? '↔' : '-'}{formatAmount(tx.amount)}</p>
                    </div>
                  ))}
                </div>
                <div className="p-2 bg-primary/5 rounded-lg text-xs text-muted-foreground text-center">{t('import.allAssignedToSource', { name: source.name })}</div>
              </div>
              <div className="p-4 border-t border-border/50">
                <Button onClick={handleImport} disabled={isImporting} className="w-full rounded-xl min-h-11">
                  {isImporting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('import.importing')}</> : t('import.importCount', { count: result.transactions.length })}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {pdfImport.phase === 'duplicates' && duplicateInfo && (
          <motion.div role="dialog" aria-modal="true" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[90] bg-background/90 backdrop-blur-sm p-3 sm:p-6 flex items-center justify-center">
            <motion.div initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.98 }} transition={{ duration: 0.18 }} className="w-full max-w-lg max-h-[88dvh] bg-background border border-border/50 shadow-2xl rounded-xl flex flex-col overflow-hidden">
              <div className="flex items-center justify-between gap-3 p-4 border-b border-border/50">
                <h2 className="flex items-center gap-2 text-base font-semibold min-w-0"><AlertTriangle className="w-5 h-5 text-orange-500 shrink-0" /><span className="truncate">{t('import.duplicatesFound')}</span></h2>
                <Button type="button" variant="ghost" size="icon" onClick={resetAll} className="h-10 w-10 shrink-0" aria-label={t('common.close')}><XIcon className="h-5 w-5" /></Button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div className="p-3 bg-orange-500/10 border border-orange-500/20 rounded-xl text-sm">
                  <p className="font-medium text-orange-600 dark:text-orange-400">{t('import.duplicatesExist', { count: duplicateInfo.duplicates.length + duplicateInfo.fuzzyDuplicates.length })}</p>
                  <p className="text-muted-foreground text-xs mt-1">{t('import.newTransactionsReady', { count: duplicateInfo.unique.length })}</p>
                </div>
                {duplicateInfo.duplicates.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-destructive/80">{t('import.strictDuplicates')}</p>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      {duplicateInfo.duplicates.map((tx, index) => <DuplicateRow key={`${tx.date.toISOString()}-${index}`} tx={tx} formatAmount={formatAmount} />)}
                    </div>
                    <div className="flex items-center space-x-2 p-2 bg-muted/30 rounded-lg">
                      <Checkbox id="global-include-strict-dups-source" checked={includeDuplicates} onCheckedChange={checked => setIncludeDuplicates(checked === true)} />
                      <label htmlFor="global-include-strict-dups-source" className="text-xs cursor-pointer text-muted-foreground">{t('import.importDuplicatesAnyway', { count: duplicateInfo.duplicates.length })}</label>
                    </div>
                  </div>
                )}
                {duplicateInfo.fuzzyDuplicates.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-amber-600 dark:text-amber-400">{t('import.possibleDuplicates')}</p>
                    <p className="text-xs text-muted-foreground">{t('import.compareAndSelect')}</p>
                    <div className="max-h-64 overflow-y-auto space-y-2">
                      {duplicateInfo.fuzzyDuplicates.map((tx, index) => {
                        const matchedExpense = duplicateInfo.fuzzyMatchedExpenses[index];
                        return (
                          <button type="button" key={`${tx.date.toISOString()}-${index}`} className={cn('w-full text-left rounded-xl text-sm border cursor-pointer transition-colors overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', selectedFuzzy.has(index) ? 'border-primary/30' : 'border-amber-500/20')} onClick={() => setSelectedFuzzy(prev => {
                            const next = new Set(prev);
                            next.has(index) ? next.delete(index) : next.add(index);
                            return next;
                          })}>
                            {matchedExpense && <div className="flex items-center gap-2 p-2 bg-muted/40 border-b border-border/30"><span className="text-[10px] font-medium text-muted-foreground uppercase w-14 shrink-0">{t('import.existing')}</span><div className="flex-1 min-w-0"><p className="font-medium truncate text-xs">{matchedExpense.description}</p><p className="text-[10px] text-muted-foreground">{matchedExpense.date.toLocaleDateString()}</p></div><p className={cn('font-mono text-xs shrink-0', matchedExpense.type === 'income' ? 'text-income' : 'text-expense')}>{matchedExpense.type === 'income' ? '+' : '-'}{formatAmount(Number(matchedExpense.amount))}</p></div>}
                            <div className={cn('flex items-center gap-2 p-2', selectedFuzzy.has(index) ? 'bg-primary/5' : 'bg-amber-500/5')}><Checkbox checked={selectedFuzzy.has(index)} className="ml-0.5 pointer-events-none" /><span className="text-[10px] font-medium text-amber-600 dark:text-amber-400 uppercase w-8 shrink-0">{t('common.new')}</span><div className="flex-1 min-w-0"><p className="font-medium truncate text-xs">{tx.description}</p><p className="text-[10px] text-muted-foreground">{tx.date.toLocaleDateString()}</p></div><p className={cn('font-mono text-xs shrink-0', tx.type === 'income' ? 'text-income' : 'text-expense')}>{tx.type === 'income' ? '+' : '-'}{formatAmount(tx.amount)}</p></div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              <div className="p-4 border-t border-border/50 flex flex-col sm:flex-row gap-2 sm:justify-end">
                <Button variant="outline" onClick={resetAll} className="rounded-xl min-h-11">{t('common.cancel')}</Button>
                <Button onClick={handleImportDuplicates} disabled={isImporting} className="rounded-xl min-h-11">{isImporting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('import.importing')}</> : t('import.importCount', { count: duplicateInfo.unique.length + selectedFuzzy.size + (includeDuplicates ? duplicateInfo.duplicates.length : 0) })}</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

const DuplicateRow = ({ tx, formatAmount }: { tx: ParsedTransaction; formatAmount: (amount: number) => string }) => (
  <div className="flex items-center justify-between gap-3 p-2 bg-destructive/5 rounded-lg text-sm border border-destructive/10 opacity-60">
    <div className="flex-1 min-w-0">
      <p className="font-medium truncate text-xs">{tx.description}</p>
      <p className="text-xs text-muted-foreground">{tx.date.toLocaleDateString()}</p>
    </div>
    <p className={cn('font-mono text-xs shrink-0', tx.type === 'income' ? 'text-income' : 'text-expense')}>{tx.type === 'income' ? '+' : '-'}{formatAmount(tx.amount)}</p>
  </div>
);