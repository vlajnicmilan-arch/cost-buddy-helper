import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ChevronDown, ChevronUp, Link2, Loader2, Upload, X as XIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useCurrency } from '@/contexts/CurrencyContext';
import { usePdfImport } from '@/contexts/PdfImportContext';
import { usePDFParser } from '@/hooks/usePDFParser';
import { useAuth } from '@/hooks/useAuth';
import type { ParsedTransaction } from '@/lib/csvParsers';
import { logDiagnostic } from '@/lib/diagnosticLogger';
import { cn } from '@/lib/utils';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { supabase } from '@/integrations/supabase/client';
import { classifyImport, type ClassifierImportedRow, type ClassifierManualCandidate } from '@/lib/importClassifier';
import { computeImportFingerprint } from '@/lib/importFingerprint';
import { savePayload as saveReviewPayload, hasResumableReview, clearDraft as clearReviewDraft, clearPayload as clearReviewPayload } from '@/lib/importReview/draft';
import type { ImportReviewPayload, ImportReviewRow, ManualCandidateInfo } from '@/lib/importReview/types';
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

type RowDecision = 'merge' | 'new' | 'skip';

type DuplicateInfo = {
  duplicates: ParsedTransaction[];
  fuzzyDuplicates: ParsedTransaction[];
  fuzzyMatchedExpenses: import('@/types/expense').Expense[];
  suspiciousDuplicates: ParsedTransaction[];
  suspiciousMatchedExpenses: import('@/types/expense').Expense[];
  autoMergeMatches: { tx: ParsedTransaction; existing: import('@/types/expense').Expense }[];
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
  const navigate = useNavigate();
  const { formatAmount } = useCurrency();
  const pdfImport = usePdfImport();
  const { user } = useAuth();
  const { startPDFParseJob, waitForPDFParseJob, fetchPDFParseJob, normalizeJobResult, parseHTML } = usePDFParser();
  const [resumeVisible, setResumeVisible] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState<DuplicateInfo | null>(null);
  const [includeDuplicates, setIncludeDuplicates] = useState(false);
  const [fuzzyDecisions, setFuzzyDecisions] = useState<Map<number, RowDecision>>(new Map());
  const [suspiciousDecisions, setSuspiciousDecisions] = useState<Map<number, RowDecision>>(new Map());
  const [autoMergeExpanded, setAutoMergeExpanded] = useState(false);
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
    setFuzzyDecisions(new Map());
    setSuspiciousDecisions(new Map());
    setAutoMergeExpanded(false);
    setStatementDup(null);
    fileHashRef.current = null;
    contentHashRef.current = null;
    fileMetaRef.current = null;
    pdfImport._setIdle();
  }, [clearStoredJob, pdfImport._setIdle]);

  const statementTotals = useMemo(() => {
    if (!pdfImport.result) return [] as Array<{ amount: number; description: string; date: Date }>;
    return pdfImport.result.transactions
      .filter(tx => tx.is_statement_total === true)
      .map(tx => ({
        amount: tx.amount,
        description: tx.description,
        date: tx.due_date_override ? new Date(tx.due_date_override) : tx.date,
      }));
  }, [pdfImport.result]);

  const toParsedTransactions = useCallback((): ParsedTransaction[] => {
    if (!pdfImport.result || !pdfImport.source) return [];
    const paymentSourceValue = `custom:${pdfImport.source.id}`;
    return pdfImport.result.transactions
      // Statement total ("Specifikacija troškova ... 788,10 EUR") NIKAD ne ide
      // kao expense — to bi duplo brojalo pojedinačne rate. Korisniku ga
      // prikazujemo zasebno (info: knjiži ručno kao transfer žiro→Diners).
      .filter(tx => tx.is_statement_total !== true)
      // Pending / "Na čekanju" rows are excluded from import (per Milan's
      // decision: pending doesn't get anchored — it re-appears once settled
      // with a stable running-balance).
      .filter(tx => tx.is_pending !== true)
      .map(tx => ({
        // Za rate koristi due_date_override (mjesec naplate) kako bi mjesečni
        // izvještaj sjeo na pravi mjesec. Original date čuvamo u opisu nije
        // potrebno — fingerprint koristi datum + amount + payment_source.
        date: tx.is_installment && tx.due_date_override ? new Date(tx.due_date_override) : tx.date,
        description: tx.description,
        amount: tx.amount,
        type: tx.type,
        category: tx.category,
        merchant_name: tx.merchant_name || undefined,
        source: 'pdf' as const,
        payment_source: paymentSourceValue as any,
        is_installment: tx.is_installment === true,
        installment_current: tx.installment_current ?? null,
        installment_total: tx.installment_total ?? null,
        installment_base_description: tx.installment_base_description ?? null,
        balance_after: tx.balance_after ?? null,
        is_pending: false,
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

  const persistStatementRecord = useCallback(async (count: number, importBatchId: string | null) => {
    if (!user?.id || !pdfImport.source) return;
    // Ensure we have a content hash even if guard 2 was skipped (force re-import path).
    let contentHash = contentHashRef.current;
    if (!contentHash && pdfImport.result) {
      try {
        contentHash = await computeContentHash(
          user.id,
          `custom:${pdfImport.source.id}`,
          pdfImport.result.transactions,
        );
      } catch {
        contentHash = null;
      }
    }
    await recordImportedStatement({
      userId: user.id,
      paymentSourceId: pdfImport.source.id,
      fileHash: fileHashRef.current,
      contentHash,
      fileName: fileMetaRef.current?.name ?? null,
      fileSize: fileMetaRef.current?.size ?? null,
      mimeType: fileMetaRef.current?.type ?? null,
      transactionsCount: count,
      importBatchId,
    });
  }, [user?.id, pdfImport.source, pdfImport.result]);

  // Korak 3b — detect a resumable import review on mount / focus / visibility.
  useEffect(() => {
    const check = () => setResumeVisible(hasResumableReview());
    check();
    const onFocus = () => check();
    const onVis = () => { if (document.visibilityState === 'visible') check(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);


  /**
   * Korak 3b — review flow entry point.
   *
   * Replaces direct write path with: fetch manual candidates + fingerprint
   * hits → classifyImport → sessionStorage payload → navigate /import/review.
   *
   * IMPORT_FROZEN policy: even after review confirmation, ZERO writes happen
   * (executor is Korak 4). The old auto-merge/dedup path
   * (`legacyHandleImport` below + `duplicates` phase modal) stays in the
   * source for Korak 4 wiring but is NOT reachable from the UI anymore.
   */
  const handleImport = async () => {
    if (!pdfImport.source || !pdfImport.result || !user?.id) return;
    const transactions = toParsedTransactions();
    const sourceId = pdfImport.source.id;
    const paymentSourceValue = `custom:${sourceId}`;
    const jobId = pdfImport.jobId ?? `local-${Date.now()}`;
    try { logDiagnostic('global_pdf_import_review_open_clicked', { source_id: sourceId, count: transactions.length }); } catch {}

    try {
      pdfImport._setImporting(true);

      // Compute fingerprints for imported rows (uses Korak 2 balance_after).
      const fingerprints = await Promise.all(transactions.map(tx =>
        computeImportFingerprint({
          userId: user.id,
          paymentSource: paymentSourceValue,
          date: tx.date,
          type: tx.type,
          amount: tx.amount,
          description: tx.description,
          merchantName: tx.merchant_name,
          balanceAfter: tx.balance_after ?? null,
        })
      ));

      // SELECT (a) fingerprint hits — rows already anchored in expenses.
      const existingFpSet = new Set<string>();
      if (fingerprints.length > 0) {
        try {
          const { data } = await supabase
            .from('expenses')
            .select('bank_transaction_id')
            .eq('user_id', user.id)
            .in('bank_transaction_id', fingerprints);
          for (const r of (data ?? []) as Array<{ bank_transaction_id: string | null }>) {
            if (r.bank_transaction_id) existingFpSet.add(r.bank_transaction_id);
          }
        } catch (e) {
          try { logDiagnostic('import_review_fp_lookup_failed', { message: e instanceof Error ? e.message : String(e) }); } catch {}
        }
      }

      // SELECT (b) manual candidates on this source (no bank_transaction_id).
      const dates = transactions.map(tx => tx.date.getTime());
      const minMs = dates.length ? Math.min(...dates) - 24 * 60 * 60 * 1000 : Date.now();
      const maxMs = dates.length ? Math.max(...dates) + 24 * 60 * 60 * 1000 : Date.now();
      const isoFrom = new Date(minMs).toISOString().slice(0, 10);
      const isoTo = new Date(maxMs).toISOString().slice(0, 10);

      let manualRows: Array<{ id: string; date: string; amount: number; type: string; merchant_name: string | null; description: string | null }> = [];
      try {
        const { data } = await supabase
          .from('expenses')
          .select('id,date,amount,type,merchant_name,description')
          .eq('user_id', user.id)
          .eq('payment_source', paymentSourceValue)
          .is('bank_transaction_id', null)
          .gte('date', isoFrom)
          .lte('date', isoTo);
        manualRows = (data ?? []) as typeof manualRows;
      } catch (e) {
        try { logDiagnostic('import_review_manual_lookup_failed', { message: e instanceof Error ? e.message : String(e) }); } catch {}
      }

      const manualCandidatesForClassifier: ClassifierManualCandidate[] = manualRows.map(m => ({
        id: m.id,
        paymentSource: paymentSourceValue,
        type: m.type,
        amount: Number(m.amount),
        date: m.date,
        merchantName: m.merchant_name,
        description: m.description,
      }));

      const importedForClassifier: ClassifierImportedRow[] = transactions.map((tx, i) => ({
        index: i,
        paymentSource: paymentSourceValue,
        type: tx.type,
        amount: tx.amount,
        date: tx.date,
        merchantName: tx.merchant_name,
        description: tx.description,
      }));

      const classified = classifyImport({
        imported: importedForClassifier,
        manualCandidates: manualCandidatesForClassifier,
      });

      // Merge classifier output → review rows.
      const autoByIdx = new Map<number, string>();
      classified.autoMerge.forEach(p => autoByIdx.set(p.importedIndex, p.manualId));
      const qByIdx = new Map<number, { reason: 'merchant_mismatch' | 'no_merchant' | 'ambiguous'; candidateIds: string[] }>();
      classified.questions.forEach(q => qByIdx.set(q.importedIndex, { reason: q.reason, candidateIds: q.candidateIds }));

      const reviewRows: ImportReviewRow[] = transactions.map((tx, i) => {
        const fp = fingerprints[i];
        const dateIso = new Date(tx.date).toISOString();
        const baseRow = {
          index: i,
          date: dateIso,
          amount: tx.amount,
          type: tx.type,
          merchantName: tx.merchant_name ?? null,
          description: tx.description ?? null,
          fingerprint: fp,
        };
        const auto = autoByIdx.get(i);
        if (auto) return { ...baseRow, classification: { kind: 'auto_merge' as const, manualId: auto } };
        const q = qByIdx.get(i);
        if (q) return { ...baseRow, classification: { kind: 'question' as const, reason: q.reason, candidateIds: q.candidateIds } };
        return {
          ...baseRow,
          classification: { kind: 'new' as const, existsByFingerprint: existingFpSet.has(fp) },
        };
      });

      const manualCandidatesRecord: Record<string, ManualCandidateInfo> = {};
      for (const m of manualRows) {
        manualCandidatesRecord[m.id] = {
          id: m.id,
          date: m.date,
          amount: Number(m.amount),
          type: m.type,
          merchantName: m.merchant_name,
          description: m.description,
        };
      }

      const payload: ImportReviewPayload = {
        jobId,
        sourceId,
        sourceName: pdfImport.source.name,
        createdAt: Date.now(),
        rows: reviewRows,
        manualCandidates: manualCandidatesRecord,
      };

      saveReviewPayload(payload);
      // Reset PDF import phase so returning from review doesn't re-open the preview modal.
      pdfImport._setIdle();
      try {
        logDiagnostic('import_review_navigated', {
          job_id: jobId,
          auto: classified.autoMerge.length,
          questions: classified.questions.length,
          new_rows: classified.newRows.length,
          fp_hits: existingFpSet.size,
        });
      } catch { /* noop */ }
      navigate('/import/review');
    } catch (error) {
      try { logDiagnostic('global_pdf_import_review_failed', { message: error instanceof Error ? error.message : String(error) }); } catch {}
      showError(t('toasts.importError'));
      pdfImport._setImporting(false);
    }
  };

  // LEGACY: reachable only via Korak 4 executor. UI no longer calls this.
  // Kept in-source so the auto-merge/dedup pipeline (`_runFindDuplicates` +
  // `_runImport`) is not lost between now and Korak 4. See handleImport above.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const legacyHandleImport = async () => {
    if (!pdfImport.source || !pdfImport.result) return;
    const transactions = toParsedTransactions();
    try { logDiagnostic('global_pdf_import_clicked', { source_id: pdfImport.source.id, count: transactions.length }); } catch {}

    try {
      pdfImport._setImporting(true);
      const duplicateResult = pdfImport._runFindDuplicates(transactions);
      const hasReviewable =
        duplicateResult &&
        (duplicateResult.duplicates.length > 0 ||
          duplicateResult.fuzzyDuplicates.length > 0 ||
          duplicateResult.suspiciousDuplicates.length > 0);

      if (hasReviewable) {
        if (
          duplicateResult.unique.length === 0 &&
          duplicateResult.fuzzyDuplicates.length === 0 &&
          duplicateResult.suspiciousDuplicates.length === 0 &&
          (duplicateResult.autoMergeMatches?.length ?? 0) === 0
        ) {
          toast.info(t('import.noNewTransactions'));
          resetAll();
          return;
        }
        setDuplicateInfo({
          duplicates: duplicateResult.duplicates,
          fuzzyDuplicates: duplicateResult.fuzzyDuplicates,
          fuzzyMatchedExpenses: duplicateResult.fuzzyMatchedExpenses,
          suspiciousDuplicates: duplicateResult.suspiciousDuplicates,
          suspiciousMatchedExpenses: duplicateResult.suspiciousMatchedExpenses,
          autoMergeMatches: duplicateResult.autoMergeMatches ?? [],
          unique: duplicateResult.unique,
        });
        setIncludeDuplicates(false);
        // Default decision: merge if a matched expense exists, else 'new' (preserve old behavior of "tick = import as new").
        const fuzzyInit = new Map<number, RowDecision>();
        duplicateResult.fuzzyDuplicates.forEach((_, idx) => {
          fuzzyInit.set(idx, duplicateResult.fuzzyMatchedExpenses[idx] ? 'merge' : 'skip');
        });
        const suspInit = new Map<number, RowDecision>();
        duplicateResult.suspiciousDuplicates.forEach((_, idx) => {
          suspInit.set(idx, duplicateResult.suspiciousMatchedExpenses[idx] ? 'merge' : 'skip');
        });
        setFuzzyDecisions(fuzzyInit);
        setSuspiciousDecisions(suspInit);
        pdfImport._setDuplicates();
        return;
      }
      // No reviewable duplicates — auto-merge (if any) happens silently inside importFromCSV.
      let meta: { batchId: string; inserted: number; merged: number; skipped: number } | null = null;
      await pdfImport._runImport(transactions, { onMeta: (m) => { meta = m; } });
      await persistStatementRecord(transactions.length, meta?.batchId ?? null);
      const mergedCount = meta?.merged ?? duplicateResult?.autoMergeMatches?.length ?? 0;
      if (mergedCount > 0) {
        showSuccess(t('import.importedWithAutoMerge', { count: transactions.length - mergedCount, merged: mergedCount }));
      } else {
        showSuccess(t('import.importedFromPDF', { count: transactions.length }));
      }
      resetAll();
    } catch (error) {
      try { logDiagnostic('global_pdf_import_save_failed', { message: error instanceof Error ? error.message : String(error) }); } catch {}
      showError(t('toasts.importError'));
      pdfImport._setImporting(false);
    }
  };


  const handleImportDuplicates = async () => {
    if (!duplicateInfo) return;

    // Build forced manual merges from rows the user explicitly chose to merge.
    const forcedManualMerges: { tx: ParsedTransaction; manualId: string }[] = [];
    const fuzzyAsNew: ParsedTransaction[] = [];
    duplicateInfo.fuzzyDuplicates.forEach((tx, index) => {
      const decision = fuzzyDecisions.get(index) ?? 'skip';
      const matched = duplicateInfo.fuzzyMatchedExpenses[index];
      if (decision === 'merge' && matched?.id) {
        forcedManualMerges.push({ tx, manualId: matched.id });
      } else if (decision === 'new') {
        fuzzyAsNew.push(tx);
      }
    });
    const suspiciousAsNew: ParsedTransaction[] = [];
    duplicateInfo.suspiciousDuplicates.forEach((tx, index) => {
      const decision = suspiciousDecisions.get(index) ?? 'skip';
      const matched = duplicateInfo.suspiciousMatchedExpenses[index];
      if (decision === 'merge' && matched?.id) {
        forcedManualMerges.push({ tx, manualId: matched.id });
      } else if (decision === 'new') {
        suspiciousAsNew.push(tx);
      }
    });

    const strictToInclude = includeDuplicates ? duplicateInfo.duplicates : [];
    const autoMergeTxs = duplicateInfo.autoMergeMatches.map(m => m.tx);
    const transactions = [
      ...duplicateInfo.unique,
      ...autoMergeTxs,
      ...fuzzyAsNew,
      ...suspiciousAsNew,
      ...strictToInclude,
      // forced merges must also reach importFromCSV so the auto-merge stage picks the manualId
      ...forcedManualMerges.map(m => m.tx),
    ];
    if (transactions.length === 0 && forcedManualMerges.length === 0) {
      toast.info(t('import.noNewTransactions'));
      resetAll();
      return;
    }
    try {
      pdfImport._setImporting(true);
      let meta: { batchId: string; inserted: number; merged: number; skipped: number } | null = null;
      await pdfImport._runImport(transactions, { forcedManualMerges, onMeta: (m) => { meta = m; } });
      await persistStatementRecord(transactions.length, meta?.batchId ?? null);
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
      {/* Korak 3b — resume banner. Ponuda "Nastavi pregled uvoza", ne auto-navigate. */}
      {resumeVisible && (
        <div className="fixed top-2 inset-x-2 z-[100] rounded-xl border border-primary/50 bg-primary/10 backdrop-blur px-3 py-2 shadow-lg flex items-center gap-2">
          <Link2 className="w-4 h-4 text-primary shrink-0" />
          <p className="flex-1 text-sm truncate">{t('importReview.resumeBanner')}</p>
          <Button
            size="sm"
            variant="ghost"
            className="h-8"
            onClick={() => { clearReviewDraft(); clearReviewPayload(); setResumeVisible(false); }}
          >
            {t('common.dismiss')}
          </Button>
          <Button size="sm" className="h-8" onClick={() => { setResumeVisible(false); navigate('/import/review'); }}>
            {t('importReview.resume')}
          </Button>
        </div>
      )}
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
                {statementTotals.length > 0 && (
                  <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-sm space-y-1">
                    <p className="font-medium text-blue-700 dark:text-blue-300">
                      💳 {t('import.statementTotal.title', 'Ukupna naplata izvoda')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t('import.statementTotal.description', 'Ovo NE knjižimo kao trošak (bi duplo brojalo rate). Kad banka skine ukupni iznos, unesi ručno kao transfer žiro → {{source}}.', { source: source.name })}
                    </p>
                    {statementTotals.map((s, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 text-xs pt-1">
                        <span className="truncate">{s.description} • {s.date.toLocaleDateString()}</span>
                        <span className="font-mono font-bold text-blue-700 dark:text-blue-300 shrink-0">{formatAmount(s.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {result.transactions.filter(tx => tx.is_statement_total !== true).map((tx, index) => (
                    <div key={`${tx.date.getTime()}-${index}`} className="flex items-center justify-between gap-3 p-3 bg-background/50 rounded-xl text-sm border border-border/40">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">
                          {tx.description}
                          {tx.is_installment && tx.installment_current && tx.installment_total && (
                            <span className="ml-1 inline-flex items-center rounded-full bg-primary/15 text-primary px-1.5 py-0.5 text-[10px] font-medium">
                              {t('import.installment.badge', 'Rata {{cur}}/{{total}}', { cur: tx.installment_current, total: tx.installment_total })}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">{(tx.due_date_override ? new Date(tx.due_date_override) : tx.date).toLocaleDateString()} • {tx.merchant_name || tx.category}{tx.card_last4 && <span className="ml-1 font-mono">(*{tx.card_last4})</span>}</p>
                      </div>
                      <p className={cn('font-mono font-bold shrink-0', tx.type === 'income' ? 'text-income' : tx.type === 'transfer' ? 'text-muted-foreground' : 'text-expense')}>{tx.type === 'income' ? '+' : tx.type === 'transfer' ? '↔' : '-'}{formatAmount(tx.amount)}</p>
                    </div>
                  ))}
                </div>
                <div className="p-2 bg-primary/5 rounded-lg text-xs text-muted-foreground text-center">{t('import.allAssignedToSource', { name: source.name })}</div>
              </div>
              <div className="p-4 border-t border-border/50">
                <Button onClick={handleImport} disabled={isImporting} className="w-full rounded-xl min-h-11">
                  {isImporting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('import.importing')}</> : t('import.importCount', { count: result.transactions.filter(tx => tx.is_statement_total !== true).length })}
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
                  <p className="font-medium text-orange-600 dark:text-orange-400">{t('import.duplicatesExist', { count: duplicateInfo.duplicates.length + duplicateInfo.fuzzyDuplicates.length + duplicateInfo.suspiciousDuplicates.length })}</p>
                  <p className="text-muted-foreground text-xs mt-1">{t('import.newTransactionsReady', { count: duplicateInfo.unique.length })}</p>
                </div>
                {duplicateInfo.autoMergeMatches.length > 0 && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setAutoMergeExpanded(prev => !prev)}
                      className="w-full flex items-center gap-2 p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
                      aria-expanded={autoMergeExpanded}
                    >
                      <Link2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                          {t('import.autoMerge.title', { count: duplicateInfo.autoMergeMatches.length })}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {t('import.autoMerge.description')}
                        </p>
                      </div>
                      {autoMergeExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
                    </button>
                    {autoMergeExpanded && (
                      <div className="px-3 pb-3 space-y-2 max-h-64 overflow-y-auto">
                        {duplicateInfo.autoMergeMatches.map(({ tx, existing }, index) => (
                          <div key={`am-${(tx.date instanceof Date ? tx.date.getTime() : index)}-${index}`} className="rounded-lg border border-emerald-500/20 overflow-hidden bg-background/40">
                            <div className="flex items-center gap-2 p-2 bg-muted/40 border-b border-border/30">
                              <span className="text-[10px] font-medium text-muted-foreground uppercase w-14 shrink-0">{t('import.existing')}</span>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate text-xs">{existing.description}</p>
                                <p className="text-[10px] text-muted-foreground">{(existing.date instanceof Date ? existing.date : new Date(existing.date)).toLocaleDateString()}</p>
                              </div>
                              <p className={cn('font-mono text-xs shrink-0', amountColor(existing.type))}>{amountPrefix(existing.type)}{formatAmount(Number(existing.amount))}</p>
                            </div>
                            <div className="flex items-center gap-2 p-2 bg-emerald-500/5">
                              <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 uppercase w-14 shrink-0">{t('import.autoMerge.fromStatement')}</span>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate text-xs">{tx.merchant_name || tx.description}</p>
                                <p className="text-[10px] text-muted-foreground">{(tx.date instanceof Date ? tx.date : new Date(tx.date)).toLocaleDateString()}</p>
                              </div>
                              <p className={cn('font-mono text-xs shrink-0', amountColor(tx.type))}>{amountPrefix(tx.type)}{formatAmount(tx.amount)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {duplicateInfo.duplicates.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-destructive/80">{t('import.strictDuplicates')}</p>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      {duplicateInfo.duplicates.map((tx, index) => <DuplicateRow key={`${(tx.date instanceof Date ? tx.date.getTime() : index)}-${index}`} tx={tx} formatAmount={formatAmount} />)}
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
                    <div className="max-h-80 overflow-y-auto space-y-2">
                      {duplicateInfo.fuzzyDuplicates.map((tx, index) => (
                        <DecisionRow
                          key={`f-${(tx.date instanceof Date ? tx.date.getTime() : index)}-${index}`}
                          tx={tx}
                          matchedExpense={duplicateInfo.fuzzyMatchedExpenses[index]}
                          decision={fuzzyDecisions.get(index) ?? 'skip'}
                          onChange={value => setFuzzyDecisions(prev => {
                            const next = new Map(prev);
                            next.set(index, value);
                            return next;
                          })}
                          formatAmount={formatAmount}
                          t={t}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {duplicateInfo.suspiciousDuplicates.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-amber-600 dark:text-amber-400">{t('import.suspiciousDuplicates')}</p>
                    <p className="text-xs text-muted-foreground">{t('import.compareAndSelect')}</p>
                    <div className="max-h-80 overflow-y-auto space-y-2">
                      {duplicateInfo.suspiciousDuplicates.map((tx, index) => (
                        <DecisionRow
                          key={`s-${(tx.date instanceof Date ? tx.date.getTime() : index)}-${index}`}
                          tx={tx}
                          matchedExpense={duplicateInfo.suspiciousMatchedExpenses[index]}
                          decision={suspiciousDecisions.get(index) ?? 'skip'}
                          onChange={value => setSuspiciousDecisions(prev => {
                            const next = new Map(prev);
                            next.set(index, value);
                            return next;
                          })}
                          formatAmount={formatAmount}
                          t={t}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="p-4 border-t border-border/50 flex flex-col gap-2">
                {(() => {
                  const newCount =
                    duplicateInfo.unique.length
                    + Array.from(fuzzyDecisions.values()).filter(d => d === 'new').length
                    + Array.from(suspiciousDecisions.values()).filter(d => d === 'new').length
                    + (includeDuplicates ? duplicateInfo.duplicates.length : 0);
                  const mergeCount =
                    duplicateInfo.autoMergeMatches.length
                    + Array.from(fuzzyDecisions.values()).filter(d => d === 'merge').length
                    + Array.from(suspiciousDecisions.values()).filter(d => d === 'merge').length;
                  const skipCount =
                    Array.from(fuzzyDecisions.values()).filter(d => d === 'skip').length
                    + Array.from(suspiciousDecisions.values()).filter(d => d === 'skip').length
                    + (includeDuplicates ? 0 : duplicateInfo.duplicates.length);
                  return (
                    <p className="text-xs text-muted-foreground text-center">
                      {t('import.importBreakdown', {
                        newCount,
                        mergeCount,
                        skipCount,
                        defaultValue: 'Novo: {{newCount}} · Spojit će se: {{mergeCount}} · Preskočeno: {{skipCount}}',
                      })}
                    </p>
                  );
                })()}
                <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
                  <Button variant="outline" onClick={resetAll} className="rounded-xl min-h-11">{t('common.cancel')}</Button>
                  <Button onClick={handleImportDuplicates} disabled={isImporting} className="rounded-xl min-h-11">
                    {isImporting
                      ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('import.importing')}</>
                      : t('import.importCount', {
                          count:
                            duplicateInfo.unique.length
                            + duplicateInfo.autoMergeMatches.length
                            + Array.from(fuzzyDecisions.values()).filter(d => d === 'new' || d === 'merge').length
                            + Array.from(suspiciousDecisions.values()).filter(d => d === 'new' || d === 'merge').length
                            + (includeDuplicates ? duplicateInfo.duplicates.length : 0),
                        })}
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {statementDup && (
          <motion.div role="dialog" aria-modal="true" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[95] bg-background/90 backdrop-blur-sm p-4 flex items-center justify-center">
            <motion.div initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.98 }} transition={{ duration: 0.18 }} className="w-full max-w-sm bg-background border border-border/50 shadow-2xl rounded-xl flex flex-col overflow-hidden">
              <div className="p-5 space-y-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h2 className="text-base font-semibold">{t('statementDuplicate.title')}</h2>
                    <p className="text-sm text-muted-foreground">
                      {t('statementDuplicate.descriptionWithCount', {
                        date: format(new Date(statementDup.existing.imported_at), 'd. MMM yyyy', { locale: hr }),
                        count: statementDup.existing.transactions_count ?? 0,
                      })}
                    </p>
                  </div>
                </div>
              </div>
              <div className="p-4 border-t border-border/50 flex flex-col gap-2">
                <Button variant="outline" onClick={resetAll} className="rounded-xl min-h-11">{t('statementDuplicate.cancel')}</Button>
                <Button onClick={statementDup.retry} variant="default" className="rounded-xl min-h-11">{t('statementDuplicate.continueAnyway')}</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

const amountPrefix = (type: string) => (type === 'income' ? '+' : type === 'transfer' ? '↔' : '-');
const amountColor = (type: string) =>
  type === 'income' ? 'text-income' : type === 'transfer' ? 'text-muted-foreground' : 'text-expense';

const DuplicateRow = ({ tx, formatAmount }: { tx: ParsedTransaction; formatAmount: (amount: number) => string }) => (
  <div className="flex items-center justify-between gap-3 p-2 bg-destructive/5 rounded-lg text-sm border border-destructive/10 opacity-60">
    <div className="flex-1 min-w-0">
      <p className="font-medium truncate text-xs">{tx.description}</p>
      <p className="text-xs text-muted-foreground">{tx.date.toLocaleDateString()}</p>
    </div>
    <p className={cn('font-mono text-xs shrink-0', amountColor(tx.type))}>{amountPrefix(tx.type)}{formatAmount(tx.amount)}</p>
  </div>
);

type DecisionRowProps = {
  tx: ParsedTransaction;
  matchedExpense: import('@/types/expense').Expense | undefined;
  decision: RowDecision;
  onChange: (value: RowDecision) => void;
  formatAmount: (amount: number) => string;
  t: (key: string, opts?: Record<string, unknown>) => string;
};

const DecisionRow = ({ tx, matchedExpense, decision, onChange, formatAmount, t }: DecisionRowProps) => {
  const canMerge = !!matchedExpense?.id;
  const borderClass =
    decision === 'merge' ? 'border-emerald-500/40'
    : decision === 'new' ? 'border-primary/40'
    : 'border-border/40';
  const hint =
    decision === 'merge' ? t('import.duplicateDecision.mergeHint')
    : decision === 'new' ? t('import.duplicateDecision.newHint')
    : t('import.duplicateDecision.skipHint');
  return (
    <div className={cn('rounded-xl text-sm border overflow-hidden transition-colors', borderClass)}>
      {matchedExpense && (
        <div className="flex items-center gap-2 p-2 bg-muted/40 border-b border-border/30">
          <span className="text-[10px] font-medium text-muted-foreground uppercase w-14 shrink-0">{t('import.existing')}</span>
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate text-xs">{matchedExpense.description}</p>
            <p className="text-[10px] text-muted-foreground">{(matchedExpense.date instanceof Date ? matchedExpense.date : new Date(matchedExpense.date)).toLocaleDateString()}</p>
          </div>
          <p className={cn('font-mono text-xs shrink-0', amountColor(matchedExpense.type))}>{amountPrefix(matchedExpense.type)}{formatAmount(Number(matchedExpense.amount))}</p>
        </div>
      )}
      <div className="flex items-center gap-2 p-2 bg-amber-500/5">
        <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400 uppercase w-14 shrink-0">{t('common.new')}</span>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate text-xs">{tx.description}</p>
          <p className="text-[10px] text-muted-foreground">{(tx.date instanceof Date ? tx.date : new Date(tx.date)).toLocaleDateString()}</p>
        </div>
        <p className={cn('font-mono text-xs shrink-0', amountColor(tx.type))}>{amountPrefix(tx.type)}{formatAmount(tx.amount)}</p>
      </div>
      <div className="p-2 bg-background/40 border-t border-border/30 space-y-1.5">
        <ToggleGroup
          type="single"
          value={decision}
          onValueChange={(value) => {
            if (!value) return;
            const next = value as RowDecision;
            if (next === 'merge' && !canMerge) return;
            onChange(next);
          }}
          className="w-full grid grid-cols-3 gap-1"
        >
          <ToggleGroupItem
            value="merge"
            disabled={!canMerge}
            className="text-xs h-9 data-[state=on]:bg-emerald-500/15 data-[state=on]:text-emerald-700 dark:data-[state=on]:text-emerald-300"
            aria-label={t('import.duplicateDecision.merge')}
          >
            {t('import.duplicateDecision.merge')}
          </ToggleGroupItem>
          <ToggleGroupItem
            value="new"
            className="text-xs h-9 data-[state=on]:bg-primary/15 data-[state=on]:text-primary"
            aria-label={t('import.duplicateDecision.new')}
          >
            {t('import.duplicateDecision.new')}
          </ToggleGroupItem>
          <ToggleGroupItem
            value="skip"
            className="text-xs h-9"
            aria-label={t('import.duplicateDecision.skip')}
          >
            {t('import.duplicateDecision.skip')}
          </ToggleGroupItem>
        </ToggleGroup>
        <p className="text-[10px] text-muted-foreground leading-snug">
          {!canMerge && decision !== 'new' && decision !== 'skip' ? t('import.duplicateDecision.noMatchToMerge') : hint}
        </p>
      </div>
    </div>
  );
};