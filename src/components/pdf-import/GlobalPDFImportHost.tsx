import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { FileText, Loader2, Upload, X as XIcon, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { useCurrency } from '@/contexts/CurrencyContext';
import { usePdfImport, type ParsedPDFData } from '@/contexts/PdfImportContext';
import { usePDFParser } from '@/hooks/usePDFParser';
import { logDiagnostic } from '@/lib/diagnosticLogger';
import { setNativeFlowActive } from '@/lib/nativeFlowGuard';
import type { ParsedTransaction } from '@/lib/csvParsers';
import type { Expense } from '@/types/expense';

export const GlobalPDFImportHost = () => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const ctx = usePdfImport();
  const { phase, source, jobId, result } = ctx;
  const { waitForPDFParseJob, normalizeJobResult } = usePDFParser();

  // Polling lifecycle (keyed by jobId so transitions cancel the previous loop).
  const activeJobRef = useRef<string | null>(null);
  useEffect(() => {
    if (phase !== 'processing' || !jobId) return;
    if (activeJobRef.current === jobId) return;
    activeJobRef.current = jobId;
    let cancelled = false;
    try { logDiagnostic('pdf_import_host_poll_start', { job_id: jobId, source_id: source?.id ?? null }); } catch {}
    (async () => {
      try {
        const parsed = await waitForPDFParseJob(jobId);
        if (cancelled || activeJobRef.current !== jobId) return;
        if (!parsed) return;
        const normalized = parsed as unknown as ParsedPDFData;
        if (normalized.transactions.length === 0) {
          try { logDiagnostic('pdf_import_host_no_transactions', { job_id: jobId }); } catch {}
          toast.warning(t('toasts.pdfNoTransactions'));
          ctx.cancel();
          clearStoredJob(source?.id);
          return;
        }
        ctx.applyResult(normalized);
        clearStoredJob(source?.id);
        try { logDiagnostic('pdf_import_host_preview_opened', { job_id: jobId, count: normalized.transactions.length }); } catch {}
      } catch (err) {
        if (cancelled || activeJobRef.current !== jobId) return;
        try { logDiagnostic('pdf_import_host_poll_failed', { job_id: jobId, message: err instanceof Error ? err.message : String(err) }); } catch {}
        showError(t('toasts.pdfAnalysisError'));
        ctx.cancel();
        clearStoredJob(source?.id);
      } finally {
        setNativeFlowActive(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, jobId]);

  // Clear stored job when preview is open (we no longer need to recover).
  useEffect(() => {
    if (phase === 'preview' && source?.id) clearStoredJob(source.id);
  }, [phase, source?.id]);

  // ===== Import / duplicates =====
  const [isImporting, setIsImporting] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState<{
    duplicates: ParsedTransaction[];
    fuzzyDuplicates: ParsedTransaction[];
    fuzzyMatchedExpenses: Expense[];
    unique: ParsedTransaction[];
  } | null>(null);
  const [includeStrict, setIncludeStrict] = useState(false);
  const [selectedFuzzy, setSelectedFuzzy] = useState<Set<number>>(new Set());
  const [showDuplicates, setShowDuplicates] = useState(false);

  const resetAll = () => {
    setDuplicateInfo(null);
    setIncludeStrict(false);
    setSelectedFuzzy(new Set());
    setShowDuplicates(false);
    ctx.cancel();
  };

  const buildTransactions = (): ParsedTransaction[] => {
    if (!result || !source) return [];
    const paymentSourceValue = `custom:${source.id}`;
    return result.transactions.map((tx) => ({
      date: tx.date,
      description: tx.description,
      amount: tx.amount,
      type: tx.type as any,
      category: tx.category as any,
      merchant_name: tx.merchant_name || undefined,
      source: 'pdf' as const,
      payment_source: paymentSourceValue as any,
    }));
  };

  const runActualImport = async (txs: ParsedTransaction[]) => {
    const handlers = ctx.getHandlers();
    if (!handlers || !source) {
      try { logDiagnostic('pdf_import_host_blocked', { has_handlers: !!handlers, has_source: !!source }); } catch {}
      showError(t('toasts.importError'));
      return;
    }
    try {
      setIsImporting(true);
      try { logDiagnostic('pdf_import_host_insert_started', { source_id: source.id, count: txs.length }); } catch {}
      await handlers.importTransactions(txs);
      try { logDiagnostic('pdf_import_host_insert_success', { source_id: source.id, count: txs.length }); } catch {}
      handlers.onAfterImport?.();
      showSuccess(t('import.importedFromPDF', { count: txs.length }));
      resetAll();
    } catch (err) {
      try { logDiagnostic('pdf_import_host_insert_failed', { source_id: source?.id, message: err instanceof Error ? err.message : String(err) }); } catch {}
      showError(t('toasts.importError'));
    } finally {
      setIsImporting(false);
    }
  };

  const handleImportClick = async () => {
    if (!result || !source) return;
    const handlers = ctx.getHandlers();
    const txs = buildTransactions();
    try { logDiagnostic('pdf_import_host_import_clicked', { source_id: source.id, count: txs.length }); } catch {}

    if (handlers?.findDuplicates) {
      const dedup = handlers.findDuplicates(txs);
      try { logDiagnostic('pdf_import_host_dedup', { source_id: source.id, duplicates: dedup.duplicates.length, fuzzy: dedup.fuzzyDuplicates.length, unique: dedup.unique.length }); } catch {}
      if (dedup.duplicates.length > 0 || dedup.fuzzyDuplicates.length > 0) {
        if (dedup.unique.length === 0 && dedup.fuzzyDuplicates.length === 0) {
          toast.info(t('import.noNewTransactions'));
          resetAll();
          return;
        }
        setDuplicateInfo(dedup);
        setIncludeStrict(false);
        setSelectedFuzzy(new Set());
        setShowDuplicates(true);
        return;
      }
    }
    await runActualImport(txs);
  };

  const handleConfirmWithDuplicates = async () => {
    if (!duplicateInfo) return;
    const fuzzy = duplicateInfo.fuzzyDuplicates.filter((_, i) => selectedFuzzy.has(i));
    const strict = includeStrict ? duplicateInfo.duplicates : [];
    const txs = [...duplicateInfo.unique, ...fuzzy, ...strict];
    if (txs.length === 0) {
      toast.info(t('import.noNewTransactions'));
      resetAll();
      return;
    }
    await runActualImport(txs);
  };

  // ===== Render =====
  if (phase === 'idle' && !showDuplicates) return null;

  return (
    <>
      {/* Processing overlay */}
      <AnimatePresence>
        {(phase === 'starting' || phase === 'processing') && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center gap-6 p-8"
          >
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <FileText className="w-8 h-8 text-primary animate-pulse" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-foreground">
                  {phase === 'starting' ? t('import.pdfStarting') : t('import.pdfProcessing')}
                </h3>
                <p className="text-sm text-muted-foreground max-w-xs">
                  {t('import.pdfProcessingDescription')}
                  {source ? ` → ${source.name}` : ''}
                </p>
              </div>
              <div className="w-48 h-2 overflow-hidden rounded-full bg-secondary">
                <motion.div
                  className="h-full bg-primary rounded-full"
                  initial={{ x: '-100%' }}
                  animate={{ x: '100%' }}
                  transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
                  style={{ width: '40%' }}
                />
              </div>
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              <Button variant="ghost" size="sm" onClick={() => { ctx.cancel(); clearStoredJob(source?.id); }}>
                {t('common.cancel', 'Odustani')}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Preview overlay */}
      <AnimatePresence>
        {phase === 'preview' && result && source && !showDuplicates && (
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-background/90 backdrop-blur-sm p-3 sm:p-6 flex items-center justify-center"
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              className="w-full max-w-lg max-h-[88dvh] bg-background border border-border/50 shadow-2xl rounded-xl flex flex-col overflow-hidden"
            >
              <div className="flex items-center justify-between gap-3 p-4 border-b border-border/50">
                <h2 className="flex items-center gap-2 text-base font-semibold min-w-0">
                  <Upload className="w-5 h-5 text-primary shrink-0" />
                  <span className="truncate">{t('import.foundTransactions')} → {source.name}</span>
                </h2>
                <Button variant="ghost" size="icon" onClick={resetAll} className="h-10 w-10 shrink-0" aria-label={t('common.close', 'Zatvori')}>
                  <XIcon className="h-5 w-5" />
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {(result.detected_bank || result.account_iban || result.cards_detected.length > 0) && (
                  <div className="p-3 bg-primary/10 rounded-xl text-sm space-y-1">
                    {result.detected_bank && (
                      <p className="font-medium">🏦 {t('import.bank')}: <span className="text-primary">{result.detected_bank}</span></p>
                    )}
                    {result.account_iban && (
                      <p className="text-muted-foreground text-xs font-mono">{t('import.account')}: {result.account_iban}</p>
                    )}
                    {result.cards_detected.length > 0 && (
                      <p className="text-muted-foreground text-xs">💳 {t('import.cards')}: {result.cards_detected.map((c) => `*${c}`).join(', ')}</p>
                    )}
                  </div>
                )}
                {result.summary && (
                  <div className="grid grid-cols-3 gap-2 p-3 bg-muted/50 rounded-xl text-sm">
                    <div className="text-center">
                      <p className="text-muted-foreground">{t('import.income')}</p>
                      <p className="font-bold text-income">{formatAmount(result.summary.total_income)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-muted-foreground">{t('import.expenses')}</p>
                      <p className="font-bold text-expense">{formatAmount(result.summary.total_expenses)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-muted-foreground">{t('import.total')}</p>
                      <p className="font-bold">{result.summary.transaction_count}</p>
                    </div>
                  </div>
                )}
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {result.transactions.map((tx, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-3 p-3 bg-background/50 rounded-xl text-sm border border-border/40">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{tx.description}</p>
                        <p className="text-xs text-muted-foreground">{tx.date.toLocaleDateString()}</p>
                      </div>
                      <p className={cn('font-mono text-sm shrink-0', tx.type === 'income' ? 'text-income' : tx.type === 'transfer' ? 'text-muted-foreground' : 'text-expense')}>
                        {tx.type === 'income' ? '+' : tx.type === 'transfer' ? '↔' : '-'}{formatAmount(tx.amount)}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="p-2 bg-primary/5 rounded-lg text-xs text-muted-foreground text-center">
                  {t('import.allAssignedToSource', { name: source.name })}
                </div>
              </div>
              <div className="p-4 border-t border-border/50">
                <Button onClick={handleImportClick} disabled={isImporting} className="w-full rounded-xl min-h-11">
                  {isImporting ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('import.importing', 'Uvozim...')}</>
                  ) : (
                    t('import.importCount', { count: result.transactions.length })
                  )}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Duplicate warning overlay */}
      <AnimatePresence>
        {showDuplicates && duplicateInfo && source && (
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-background/90 backdrop-blur-sm p-3 sm:p-6 flex items-center justify-center"
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              className="w-full max-w-lg max-h-[88dvh] bg-background border border-border/50 shadow-2xl rounded-xl flex flex-col overflow-hidden"
            >
              <div className="flex items-center justify-between gap-3 p-4 border-b border-border/50">
                <h2 className="flex items-center gap-2 text-base font-semibold min-w-0">
                  <AlertTriangle className="w-5 h-5 text-orange-500 shrink-0" />
                  <span className="truncate">{t('import.duplicatesFound')}</span>
                </h2>
                <Button variant="ghost" size="icon" onClick={resetAll} className="h-10 w-10 shrink-0" aria-label={t('common.close', 'Zatvori')}>
                  <XIcon className="h-5 w-5" />
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div className="p-3 bg-orange-500/10 border border-orange-500/20 rounded-xl text-sm">
                  <p className="font-medium text-orange-600 dark:text-orange-400">
                    {duplicateInfo.duplicates.length > 0 && `${duplicateInfo.duplicates.length} sigurnih duplikata`}
                    {duplicateInfo.duplicates.length > 0 && duplicateInfo.fuzzyDuplicates.length > 0 && ' • '}
                    {duplicateInfo.fuzzyDuplicates.length > 0 && `${duplicateInfo.fuzzyDuplicates.length} mogućih duplikata (±3 dana)`}
                  </p>
                  <p className="text-muted-foreground text-xs mt-1">
                    {t('import.newTransactionsReady', { count: duplicateInfo.unique.length })}
                  </p>
                </div>

                {duplicateInfo.duplicates.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-destructive/80">🚫 Sigurni duplikati (isti datum i iznos):</p>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      {duplicateInfo.duplicates.map((tx, idx) => (
                        <div key={idx} className="flex items-center justify-between gap-3 p-2 bg-destructive/5 rounded-lg text-sm border border-destructive/10 opacity-60">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate text-xs">{tx.description}</p>
                            <p className="text-xs text-muted-foreground">{tx.date.toLocaleDateString()}</p>
                          </div>
                          <p className={cn('font-mono text-xs shrink-0', tx.type === 'income' ? 'text-income' : 'text-expense')}>
                            {tx.type === 'income' ? '+' : '-'}{formatAmount(tx.amount)}
                          </p>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center space-x-2 p-2 bg-muted/30 rounded-lg">
                      <Checkbox id="include-strict-host" checked={includeStrict} onCheckedChange={(c) => setIncludeStrict(c === true)} />
                      <label htmlFor="include-strict-host" className="text-xs cursor-pointer text-muted-foreground">
                        Ipak uvezi sigurne duplikate ({duplicateInfo.duplicates.length})
                      </label>
                    </div>
                  </div>
                )}

                {duplicateInfo.fuzzyDuplicates.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-amber-600 dark:text-amber-400">⚠️ Mogući duplikati (±3 dana, isti iznos):</p>
                    <p className="text-xs text-muted-foreground">Odaberi koje uvezi:</p>
                    <div className="max-h-64 overflow-y-auto space-y-2">
                      {duplicateInfo.fuzzyDuplicates.map((tx, idx) => {
                        const matched = duplicateInfo.fuzzyMatchedExpenses[idx];
                        const selected = selectedFuzzy.has(idx);
                        return (
                          <button
                            type="button"
                            key={idx}
                            className={cn(
                              'w-full text-left rounded-xl text-sm border cursor-pointer transition-colors overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                              selected ? 'border-primary/30' : 'border-amber-500/20'
                            )}
                            onClick={() => {
                              const next = new Set(selectedFuzzy);
                              next.has(idx) ? next.delete(idx) : next.add(idx);
                              setSelectedFuzzy(next);
                            }}
                          >
                            <div className="flex items-center gap-2 p-2 bg-muted/40 border-b border-border/30">
                              <span className="text-[10px] font-medium text-muted-foreground uppercase w-14 shrink-0">Postojeća</span>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate text-xs">{matched.description}</p>
                                <p className="text-[10px] text-muted-foreground">{matched.date.toLocaleDateString()}</p>
                              </div>
                              <p className={cn('font-mono text-xs shrink-0', matched.type === 'income' ? 'text-income' : 'text-expense')}>
                                {matched.type === 'income' ? '+' : '-'}{formatAmount(Number(matched.amount))}
                              </p>
                            </div>
                            <div className={`flex items-center gap-2 p-2 ${selected ? 'bg-primary/5' : 'bg-amber-500/5'}`}>
                              <Checkbox checked={selected} className="ml-0.5 pointer-events-none" />
                              <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400 uppercase w-8 shrink-0">Nova</span>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate text-xs">{tx.description}</p>
                                <p className="text-[10px] text-muted-foreground">{tx.date.toLocaleDateString()}</p>
                              </div>
                              <p className={cn('font-mono text-xs shrink-0', tx.type === 'income' ? 'text-income' : 'text-expense')}>
                                {tx.type === 'income' ? '+' : '-'}{formatAmount(tx.amount)}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              <div className="p-4 border-t border-border/50 flex flex-col sm:flex-row gap-2 sm:justify-end">
                <Button variant="outline" onClick={resetAll} className="rounded-xl min-h-11">
                  {t('common.cancel')}
                </Button>
                <Button onClick={handleConfirmWithDuplicates} disabled={isImporting} className="rounded-xl min-h-11">
                  {isImporting ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Uvozim...</>
                  ) : (
                    t('import.importCount', { count: duplicateInfo.unique.length + (includeStrict ? duplicateInfo.duplicates.length : 0) + selectedFuzzy.size })
                  )}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

const clearStoredJob = (sourceId?: string | null) => {
  if (!sourceId) return;
  try { localStorage.removeItem(`vmb-pdf-parse-job:${sourceId}`); } catch {}
};
