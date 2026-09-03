import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { showError } from '@/hooks/useStatusFeedback';
// IZNIMKA (Faza 3): uspješni sažetak uvoza ostaje na sonneru — treba duration 10s
// + Undo akciju koju CentarNote (fiksna trajanja) još ne podržava.
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, ArrowRightLeft, CheckCircle2, HelpCircle, Loader2, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useAuth } from '@/hooks/useAuth';
import { useAppState } from '@/contexts/AppStateContext';
import { supabase } from '@/integrations/supabase/client';
import { logDiagnostic } from '@/lib/diagnosticLogger';
import { cn } from '@/lib/utils';
import { formatDateUi } from '@/lib/dateFormat';
import { PageContainer } from '@/components/layout/PageContainer';
import { RawLineDisclosure } from '@/components/statement/RawLineDisclosure';
import { splitRowDescription } from '@/lib/importReview/describeRow';
import {
  clearDraft,
  clearPayload,
  clearStatementHint,
  hydrateStatementHint,
  loadDraft,
  loadPayload,
  saveDraft,
} from '@/lib/importReview/draft';
import {
  answerQuestion,
  buildInitialDecisions,
  isNeedsExplanation,
  isNewRowLocked,
  isPreviouslyDeletedRow,
  isRestoreDeleted,
  setRestoreDeleted,
  setAutoMerge,
  setNeedsExplanation,
  setNewRow,
  setTransferDecision,
  summarize,
} from '@/lib/importReview/state';
import { buildBlockerMessages, firstBlockingRowIndex } from '@/lib/importReview/confirmBlockers';
import {
  executeDecisions,
  ImportExecutionIncompleteError,
  type ExecutorResult,
  type ImportOutcomeFailure,
  type ReconciliationSummaryEntry,
} from '@/lib/importReview/executor';
import { enqueueReconciliation, type ReconciliationQueueEntry } from '@/lib/reconciliation/queue';
import { writePendingSnapshot, type ReconciliationPendingSnapshot } from '@/lib/reconciliation/resume';
import { resolveAsOfIso, isHistoricalWithGap } from '@/lib/reconciliation/historyGate';
import { recordImportedStatement } from '@/lib/statementFingerprint';


import type { ReconciliationSupabaseClient } from '@/lib/reconciliation/actions';
import { buildTransferRuleKey } from '@/lib/importReview/transferRules';
import {
  computePatternFill,
  type PatternCandidateRow,
  type PatternManualDecision,
} from '@/lib/importReview/patternFill';
import {
  computeQuestionPatternFill,
  type QuestionCandidateRow,
  type QuestionManualDecision,
} from '@/lib/importReview/questionPatternFill';
import { deriveComparableName } from '@/lib/importReview/comparableName';
import { resolvePaymentSourceKey } from '@/lib/paymentSource/resolve';
import { classifyTransferDescription, type MoneyDirection } from '@/lib/moneyDirection';
import { openImportBatch } from '@/lib/importUndo/host';
import { clearReconciliationQueue } from '@/lib/reconciliation/queue';
import type {
  ImportReviewDecisions,
  ImportReviewPayload,
  ImportReviewRow,
  QuestionAnswer,
  TransferDecision,
} from '@/lib/importReview/types';

const SAVE_DEBOUNCE_MS = 300;

function formatFailedOutcome(
  item: ImportOutcomeFailure,
  t: (key: string, options?: Record<string, unknown>) => string,
  formatAmount: (amount: number) => string,
  language?: string,
): string {
  const date = formatDateUi(item.dateIso, language);
  return t('importReview.failedOutcomeRow', {
    date,
    description: item.description,
    amount: formatAmount(item.amount),
    reason: t(`importReview.failureReasons.${item.reason}`),
  });
}

/**
 * Iznos retka prema istom dogovoru kao u TransactionItem:
 * - expense: predznak −, boja text-expense
 * - income: predznak +, boja text-income
 * - transfer: predznak ↔, boja text-muted-foreground
 */
const AmountCell = ({
  amount,
  type,
  formatAmount,
}: {
  amount: number;
  type: string;
  formatAmount: (amount: number) => string;
}) => {
  const isExpense = type === 'expense';
  const isIncome = type === 'income';
  const isTransfer = type === 'transfer';
  return (
    <span
      className={cn(
        'font-mono font-semibold text-sm',
        isExpense ? 'text-expense' : isIncome ? 'text-income' : 'text-muted-foreground',
      )}
    >
      {isExpense ? '−' : isIncome ? '+' : '↔'}
      {formatAmount(amount)}
    </span>
  );
};

/**
 * Opis retka: ljudski dio u primarnom retku, tehnički identifikatori
 * (maskirana kartica, UUID, reference) u JEDNOM prigušenom retku. Ništa se ne
 * briše — samo se stišava.
 */
const RowDescription = ({ description }: { description?: string | null }) => {
  const { primary, technical } = splitRowDescription(description);
  if (!primary && technical.length === 0) return null;
  return (
    <>
      {primary && <p className="text-sm text-muted-foreground truncate">{primary}</p>}
      {technical.length > 0 && (
        <p className="text-xs text-muted-foreground/70 font-mono truncate" title={technical.join(', ')}>
          {technical.join(' · ')}
        </p>
      )}
    </>
  );
};

const ImportReview = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { formatAmount } = useCurrency();

  const [payload, setPayload] = useState<ImportReviewPayload | null>(null);
  const [decisions, setDecisions] = useState<ImportReviewDecisions | null>(null);
  const [confirming, setConfirming] = useState(false);
  /**
   * TIHA VALIDACIJA: crvena upozorenja se NE prikazuju preventivno. Pale se tek
   * kad korisnik pokuša nastaviti (`attemptedConfirm`) ili kad je konkretan
   * redak dirao pa ostavio prazno (`touchedRows`). Sama pravila obaveznih polja
   * su nepromijenjena — gate i dalje živi u `summarize()`/`handleConfirm`.
   */
  const [attemptedConfirm, setAttemptedConfirm] = useState(false);
  /** Riječi uz crvene okvire: ŠTO točno koči potvrdu (brojke iz summarizea). */
  const [blockerMessages, setBlockerMessages] = useState<string[]>([]);
  const [touchedRows, setTouchedRows] = useState<Record<number, boolean>>({});
  const markTouched = useCallback((idx: number) => {
    setTouchedRows(prev => (prev[idx] ? prev : { ...prev, [idx]: true }));
  }, []);

  /**
   * UČENJE UNUTAR ISTE SERIJE — redci popunjeni po korisnikovom obrascu.
   * `autoFilled` nosi vidljivu oznaku; `patternOptOut` pamti retke koje je
   * korisnik izričito vratio u neodlučeno; `patternDisabled` gasi obrazac za
   * cijelu seriju nakon "Poništi za sve".
   */
  const [autoFilled, setAutoFilled] = useState<Record<number, boolean>>({});
  const [patternOptOut, setPatternOptOut] = useState<number[]>([]);
  const [patternDisabled, setPatternDisabled] = useState(false);
  /** Isti obrazac, ali za ODGOVORE NA PITANJA (npr. 14x "Naknada za plaćanje"). */
  const [autoFilledQuestions, setAutoFilledQuestions] = useState<Record<number, boolean>>({});
  const [questionPatternDisabled, setQuestionPatternDisabled] = useState(false);

  // Load payload + optional draft on mount.
  useEffect(() => {
    const raw = loadPayload();
    if (!raw) {
      navigate('/app', { replace: true });
      return;
    }
    // Saldo-mig preživljava pad/nastavak: ako payload nema završni saldo
    // izvoda, dopuni ga iz trajne pohrane vezane uz isti jobId.
    const p = hydrateStatementHint(raw);
    setPayload(p);
    const draft = loadDraft({ jobId: p.jobId });
    if (draft) {
      setDecisions(draft.decisions);
    } else {
      setDecisions(buildInitialDecisions(p));
    }
  }, [navigate]);

  // Debounced draft save.
  useEffect(() => {
    if (!payload || !decisions) return;
    const timeout = setTimeout(() => {
      saveDraft(payload.jobId, decisions);
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [payload, decisions]);

  const summary = useMemo(() => {
    if (!payload || !decisions) return null;
    return summarize(payload, decisions);
  }, [payload, decisions]);

  /**
   * OBRAZAC SERIJE: dvije istovjetne korisnikove odluke na istom ključu
   * (trgovac + izvorni novčanik + smjer) popunjavaju preostale NEODLUČENE
   * retke istog ključa. Iznos nije dio ključa. Ništa se ne upisuje — samo se
   * predlaže odluka koju "Potvrdi uvoz" i dalje mora proći.
   */
  useEffect(() => {
    if (!payload || !decisions || patternDisabled) return;
    const txByIndex = new Map(payload.importedTransactions.map(tx => [tx.index, tx]));
    const manual: PatternManualDecision[] = [];
    const candidates: PatternCandidateRow[] = [];

    for (const row of payload.rows) {
      const tx = txByIndex.get(row.index);
      const key = buildTransferRuleKey({
        merchantName: row.merchantName ?? null,
        paymentSource: tx?.paymentSource ?? null,
      });
      const td = decisions.transfers[row.index];

      if (td) {
        if (!td.enabled) continue;              // korisnik je rekao "nije prijenos"
        if (autoFilled[row.index]) continue;    // auto-popunjeno se NE broji u prag
        if (!td.targetIncomeSourceId || !td.direction) continue;
        manual.push({
          index: row.index,
          merchantKey: td.merchantKey ?? key?.merchantKey ?? null,
          sourceWalletKey: td.sourceWalletKey ?? key?.sourceWalletKey ?? null,
          direction: td.direction,
          targetIncomeSourceId: td.targetIncomeSourceId,
        });
        continue;
      }

      // Podobni su SAMO čisti novi redci: bez fingerprint pogotka, bez ponude
      // kasne kartice, bez odgovorenog pitanja i bez pogotka pravila.
      if (row.classification.kind !== 'new') continue;
      if (row.classification.existsByFingerprint) continue;
      if (row.lateMatchOffer) continue;
      if (decisions.questions[row.index]) continue;

      const type = tx?.type ?? row.type;
      const direction: MoneyDirection | null =
        type === 'income' ? 'in' : type === 'expense' ? 'out' : null;
      candidates.push({
        index: row.index,
        merchantKey: key?.merchantKey ?? null,
        sourceWalletKey: key?.sourceWalletKey ?? null,
        direction,
      });
    }

    const fills = computePatternFill({ manual, candidates, excluded: patternOptOut });
    if (fills.length === 0) return;

    setDecisions(prev => {
      if (!prev) return prev;
      let next = prev;
      for (const f of fills) {
        next = setTransferDecision(next, f.index, {
          enabled: true,
          targetIncomeSourceId: f.targetIncomeSourceId,
          direction: f.direction,
          rememberRule: false,
          merchantKey: f.merchantKey,
          sourceWalletKey: f.sourceWalletKey,
        });
      }
      return next;
    });
    setAutoFilled(prev => {
      const next = { ...prev };
      for (const f of fills) next[f.index] = true;
      return next;
    });
  }, [payload, decisions, autoFilled, patternOptOut, patternDisabled]);

  /**
   * OBRAZAC SERIJE — PITANJA. Dvije istovjetne korisnikove odluke na istom
   * ključu (izvedeno ime retka + novčanik) popunjavaju preostala NEODGOVORENA
   * pitanja istog ključa. Iznos nije dio ključa. Nije autoMerge: odluka je
   * vidljivo popunjena i "Potvrdi uvoz" je i dalje mora proći.
   */
  useEffect(() => {
    if (!payload || !decisions || questionPatternDisabled) return;
    const txByIndex = new Map(payload.importedTransactions.map(tx => [tx.index, tx]));
    const nameOfCandidate = (id: string): string | null => {
      const cand = payload.manualCandidates[id];
      if (!cand) return null;
      return deriveComparableName({ merchantName: cand.merchantName, description: cand.description }) || null;
    };

    const manual: QuestionManualDecision[] = [];
    const candidates: QuestionCandidateRow[] = [];

    for (const row of payload.rows) {
      if (row.classification.kind !== 'question') continue;
      if (decisions.transfers[row.index]?.enabled) continue;
      const tx = txByIndex.get(row.index);
      const nameKey =
        deriveComparableName({ merchantName: row.merchantName, description: row.description }) || null;
      const sourceWalletKey = resolvePaymentSourceKey(tx?.paymentSource ?? `custom:${payload.sourceId}`);
      const answer = decisions.questions[row.index];

      if (answer) {
        if (autoFilledQuestions[row.index]) continue; // auto-popunjeno se NE broji u prag
        if (answer.choice === 'new') {
          manual.push({ index: row.index, nameKey, sourceWalletKey, answer: { choice: 'new' } });
        } else {
          const candidateNameKey = nameOfCandidate(answer.manualId);
          if (!candidateNameKey) continue;
          manual.push({
            index: row.index,
            nameKey,
            sourceWalletKey,
            answer: { choice: 'merge', candidateNameKey },
          });
        }
        continue;
      }

      candidates.push({
        index: row.index,
        nameKey,
        sourceWalletKey,
        candidates: row.classification.candidateIds.map(id => ({ id, nameKey: nameOfCandidate(id) })),
      });
    }

    const fills = computeQuestionPatternFill({ manual, candidates });
    if (fills.length === 0) return;

    setDecisions(prev => {
      if (!prev) return prev;
      let next = prev;
      for (const f of fills) next = answerQuestion(next, f.index, f.answer);
      return next;
    });
    setAutoFilledQuestions(prev => {
      const next = { ...prev };
      for (const f of fills) next[f.index] = true;
      return next;
    });
  }, [payload, decisions, autoFilledQuestions, questionPatternDisabled]);

  /**
   * Grouping honours transfer overrides — a row currently marked as transfer
   * (either from a matched rule or from the user's "Ovo je prijenos" action)
   * moves to the Prijenosi section, regardless of its underlying classifier
   * kind. This keeps the UI in lock-step with what the executor will actually
   * write.
   */
  const grouped = useMemo(() => {
    if (!payload || !decisions) {
      return { auto: [] as ImportReviewRow[], questions: [] as ImportReviewRow[], news: [] as ImportReviewRow[], transfers: [] as ImportReviewRow[] };
    }
    const auto: ImportReviewRow[] = [];
    const questions: ImportReviewRow[] = [];
    const news: ImportReviewRow[] = [];
    const transfers: ImportReviewRow[] = [];
    for (const r of payload.rows) {
      const td = decisions.transfers[r.index];
      if (td && td.enabled) { transfers.push(r); continue; }
      if (r.classification.kind === 'transfer') { transfers.push(r); continue; }
      if (r.classification.kind === 'auto_merge') auto.push(r);
      else if (r.classification.kind === 'question') questions.push(r);
      else news.push(r);
    }
    return { auto, questions, news, transfers };
  }, [payload, decisions]);

  const handleCancel = useCallback(() => {
    navigate('/app');
  }, [navigate]);

  const { user } = useAuth();
  const { activeBusinessProfileId } = useAppState();

  const handleConfirm = useCallback(async () => {
    if (!payload || !decisions || !summary) return;
    if (!summary.canConfirm) {
      // Gate je isti kao prije (nastavak nije moguć) — mijenja se samo trenutak
      // kad upozorenja postanu vidljiva.
      setAttemptedConfirm(true);
      setBlockerMessages(buildBlockerMessages(summary, t));
      const firstIdx = firstBlockingRowIndex(payload, decisions);
      if (firstIdx !== null && typeof document !== 'undefined') {
        document.getElementById(`ir-row-${firstIdx}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }
    if (!user) {
      showError(t('common.notAuthenticated'), { module: 'wallet' });
      return;
    }
    setBlockerMessages([]);
    setConfirming(true);
    saveDraft(payload.jobId, decisions);
    let result: ExecutorResult | null = null;
    try {
      result = await executeDecisions({
        supabase: supabase as unknown as Parameters<typeof executeDecisions>[0]['supabase'],
        userId: user.id,
        activeBusinessProfileId: activeBusinessProfileId ?? null,
        payload,
        decisions,
      });
      try {
        logDiagnostic('import_executed', {
          batch_id: result.batchId,
          merged: result.merged,
          inserted: result.inserted,
          transfers_created: result.transfersCreated,
          rules_saved: result.rulesSaved,
          skipped_by_user: result.skippedByUser,
          skipped_fingerprint: result.skippedFingerprint,
          skipped_merged: result.skippedMerged,
          skipped_duplicate: result.skippedDuplicate,
          skipped_existing_unique: result.skippedExistingUnique,
          skipped_previously_deleted: result.skippedPreviouslyDeleted,
          restored_deleted: result.restoredDeleted,
          fulfilled_existing: result.fulfilledExisting,
          completed_outcomes: result.completedOutcomes,
          duration_ms: result.durationMs,
          errors: result.errors.length,
        });
      } catch { /* noop */ }

      clearDraft();
      clearPayload();
      clearStatementHint();
      const batchId = result.batchId;

      // Zapis izvoda: vraća zaštitu od dvostrukog uvoza iste datoteke i
      // "Nastavi" banner. Non-fatal — uvoz je već commitan.
      if (user?.id && payload.statement) {
        await recordImportedStatement({
          userId: user.id,
          paymentSourceId: payload.sourceId,
          fileHash: payload.statement.fileHash,
          contentHash: payload.statement.contentHash,
          sourceDocumentItemId: payload.statement.sourceDocumentItemId ?? null,
          fileName: payload.statement.fileName,
          fileSize: payload.statement.fileSize,
          mimeType: payload.statement.mimeType,
          transactionsCount: result.completedOutcomes,
          importBatchId: batchId,
        });
      }

      toast.success(t('importReview.confirmedSummaryV3', {
        merged: result.merged,
        inserted: result.inserted,
        transfers: result.transfersCreated,
        skipped: result.skippedByUser + result.skippedFingerprint + result.skippedMerged + result.skippedDuplicate
          + result.fulfilledExisting + result.skippedExistingUnique + result.skippedPreviouslyDeleted,
        existing: result.skippedFingerprint + result.skippedDuplicate
          + result.fulfilledExisting + result.skippedExistingUnique,
      }), {
        duration: 10000,
        action: batchId ? {
          label: t('importBatch.undoActionShort'),
          onClick: () => openImportBatch(batchId, () => {
            // Ako je uvoz poništen, sve reconciliation stavke za taj batch više nemaju smisla.
            clearReconciliationQueue();
          }),
        } : undefined,
      });

      // Ranije obrisani redci se broje ODVOJENO od "već postoji" — korisnik mora
      // vidjeti da ih baza i dalje drži i da se sami ne vraćaju.
      if (result.skippedPreviouslyDeleted > 0) {
        toast.info(t('importReview.skippedPreviouslyDeletedSummary', { count: result.skippedPreviouslyDeleted }), { duration: 8000 });
      }

      // Povijesni izvod (završava prije sidra) ne traži odluku — samo informacija
      // da je povijest dopunjena i da će se stanje uskladiti na kraju.
      const historical = result.reconciliationSummary.filter(isHistoricalWithGap);
      if (historical.length > 0) {
        toast.info(t('importReview.historyExtended', { count: historical.length }), { duration: 8000 });
      }

      // FAZA 3 — enqueue ReconciliationDialog samo za ne-povijesne izvode s |delta|>0.01.
      await enqueueReconciliationForBatch(result.reconciliationSummary, result.batchId, payload);


      navigate('/app');
    } catch (e) {
      try {
        const failedOutcomes = e instanceof ImportExecutionIncompleteError ? e.failedOutcomes : [];
        logDiagnostic('import_execute_failed', {
          job_id: payload.jobId,
          message: e instanceof Error ? e.message : String(e),
          failed_outcomes: failedOutcomes,
        });
      } catch { /* noop */ }
      if (e instanceof ImportExecutionIncompleteError && e.failedOutcomes.length > 0) {
        showError(t('importReview.incompleteNamed', {
          rows: e.failedOutcomes.map(item => formatFailedOutcome(item, t, formatAmount)).join('\n'),
        }), { module: 'wallet' });
      } else {
        showError(t('importReview.confirmFailed'), { module: 'wallet' });
      }
    } finally {
      setConfirming(false);
    }
  }, [payload, decisions, summary, navigate, t, user, activeBusinessProfileId, formatAmount]);

  const updateAuto = useCallback((idx: number, value: boolean) => {
    setDecisions(prev => (prev ? setAutoMerge(prev, idx, value) : prev));
  }, []);
  const updateRestoreDeleted = useCallback((idx: number, value: boolean) => {
    setDecisions(prev => (prev ? setRestoreDeleted(prev, idx, value) : prev));
  }, []);
  const updateNew = useCallback((idx: number, value: boolean) => {
    setDecisions(prev => (prev ? setNewRow(prev, idx, value) : prev));
  }, []);
  const updateQuestion = useCallback((idx: number, answer: QuestionAnswer) => {
    setDecisions(prev => (prev ? answerQuestion(prev, idx, answer) : prev));
    // Ručna izmjena gasi oznaku "popunjeno po tvom obrascu" na tom retku.
    setAutoFilledQuestions(prev => {
      if (!prev[idx]) return prev;
      const next = { ...prev };
      delete next[idx];
      return next;
    });
  }, []);
  /**
   * KORISNIKOV put — svaka ručna izmjena gasi oznaku "popunjeno po tvom
   * obrascu" na tom retku. Vraćanje u neodlučeno stanje ga ujedno trajno
   * izuzima iz ponovnog popunjavanja.
   */
  const updateTransfer = useCallback((idx: number, decision: TransferDecision | null) => {
    setDecisions(prev => (prev ? setTransferDecision(prev, idx, decision) : prev));
    setAutoFilled(prev => {
      if (!prev[idx]) return prev;
      const next = { ...prev };
      delete next[idx];
      return next;
    });
    if (!decision || decision.enabled === false) {
      setPatternOptOut(prev => (prev.includes(idx) ? prev : [...prev, idx]));
    }
  }, []);

  /** "Poništi za sve" — vraća SAMO automatski popunjene retke u neodlučeno. */
  const undoAllPatternFills = useCallback(() => {
    const indices = Object.keys(autoFilled).map(Number);
    if (indices.length === 0) return;
    setDecisions(prev => {
      if (!prev) return prev;
      let next = prev;
      for (const idx of indices) next = setTransferDecision(next, idx, null);
      return next;
    });
    setAutoFilled({});
    setPatternDisabled(true);
  }, [autoFilled]);

  /** "Poništi za sve" (pitanja) — vraća SAMO auto-popunjene odgovore u neodgovoreno. */
  const undoAllQuestionFills = useCallback(() => {
    const indices = Object.keys(autoFilledQuestions).map(Number);
    if (indices.length === 0) return;
    setDecisions(prev => {
      if (!prev) return prev;
      let next = prev;
      for (const idx of indices) next = answerQuestion(next, idx, null);
      return next;
    });
    setAutoFilledQuestions({});
    setQuestionPatternDisabled(true);
  }, [autoFilledQuestions]);

  const autoFilledQuestionCount = useMemo(
    () => Object.keys(autoFilledQuestions).length,
    [autoFilledQuestions],
  );

  const autoFilledCount = useMemo(() => Object.keys(autoFilled).length, [autoFilled]);

  if (!payload || !decisions || !summary) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  /**
   * CITAT S IZVODA — doslovni redak stiže u payloadu uz svaku uvezenu stavku.
   * Prikazuje se zatvoreno; ne dira širinu kartice.
   */
  /**
   * KVAČICA "Ne znam još što je ovo" — jedini ulaz za oznaku "Bez objašnjenja".
   * Ne dira uvoz: redak se upisuje normalno, saldo ostaje točan.
   */
  const renderNeedsExplanation = (rowIndex: number) => {
    const id = `ir-nx-${rowIndex}`;
    return (
      <label htmlFor={id} className="mt-2 flex items-center gap-2 min-h-9 cursor-pointer">
        <Checkbox
          id={id}
          data-testid={`needs-explanation-${rowIndex}`}
          checked={isNeedsExplanation(decisions, rowIndex)}
          onCheckedChange={(v) =>
            setDecisions(prev => (prev ? setNeedsExplanation(prev, rowIndex, v === true) : prev))
          }
        />
        <span className="text-xs text-muted-foreground">
          {t('needsExplanation.checkbox', 'Ne znam još što je ovo')}
        </span>
      </label>
    );
  };

  const renderRawLine = (rowIndex: number) => {
    const tx = payload.importedTransactions.find(it => it.index === rowIndex);
    if (!tx?.bankRawLine) return null;
    return <RawLineDisclosure rawLine={tx.bankRawLine} source={tx.bankRawLineSource ?? null} />;
  };

  const fmtDate = (iso: string) => formatDateUi(iso, i18n.language);

  const targets = payload.availableTargets ?? [];

  /**
   * Given a row + user's picked target id, build the TransferDecision to
   * persist. If the row already has a rule-based classification we don't
   * offer "Zapamti" (rule already exists) — the checkbox is only shown for
   * user-flagged transfers on new/question rows.
   */
  const buildDecision = (
    row: ImportReviewRow,
    targetId: string,
    remember: boolean,
    direction: MoneyDirection | null,
  ): TransferDecision => {
    const tx = payload.importedTransactions.find(t => t.index === row.index);
    const key = buildTransferRuleKey({
      merchantName: row.merchantName ?? null,
      paymentSource: tx?.paymentSource ?? null,
    });
    return {
      enabled: true,
      targetIncomeSourceId: targetId,
      direction,
      rememberRule: remember,
      merchantKey: key?.merchantKey ?? null,
      sourceWalletKey: key?.sourceWalletKey ?? null,
    };
  };

  /**
   * PONUDA SPAJANJA (kartično kašnjenje). Prikazuje OBA retka jedan kraj
   * drugog; zadano stanje je RAZDVOJENO (uvoz kao novi redak). Korisnikov
   * dodir spaja, šutnja ne radi ništa.
   */
  const renderLateMatchOffer = (row: ImportReviewRow) => {
    const manualId = row.lateMatchOffer;
    if (!manualId) return null;
    const cand = payload.manualCandidates[manualId];
    if (!cand) return null;
    const merged = decisions.questions[row.index]?.choice === 'merge';
    return (
      <div className={cn(
        'mt-3 rounded-lg border p-2 space-y-2',
        merged ? 'border-primary/50 bg-primary/5' : 'border-border/50 bg-muted/30',
      )}>
        <p className="text-xs text-muted-foreground">{t('importReview.lateMatch.title')}</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="min-w-0 rounded-md border border-border/40 p-2">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground block">{t('importReview.lateMatch.manualSide')}</span>
            <span className="text-xs text-muted-foreground block">{fmtDate(cand.date)}</span>
            <span className="text-sm block truncate">{cand.merchantName || cand.description || '—'}</span>
            <span className="font-mono text-sm block">{formatAmount(cand.amount)}</span>
          </div>
          <div className="min-w-0 rounded-md border border-border/40 p-2">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground block">{t('importReview.lateMatch.bankSide')}</span>
            <span className="text-xs text-muted-foreground block">{fmtDate(row.date)}</span>
            <span className="text-sm block truncate">{row.merchantName || row.description || '—'}</span>
            <span className="font-mono text-sm block">{formatAmount(row.amount)}</span>
            {renderRawLine(row.index)}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={merged ? 'outline' : 'secondary'}
            className="flex-1 min-h-11"
            onClick={() => updateQuestion(row.index, { choice: 'new' })}
          >
            {t('importReview.lateMatch.keepSeparate')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={merged ? 'default' : 'outline'}
            className="flex-1 min-h-11"
            onClick={() => updateQuestion(row.index, { choice: 'merge', manualId })}
          >
            {t('importReview.lateMatch.merge')}
          </Button>
        </div>
      </div>
    );
  };

  /**
   * Render the transfer control (picker + remember + clear). Used inside every
   * section — a `new` row can be flipped to transfer, a rule-hit row can be
   * removed with "Poništi pravilo".
   */
  const renderTransferControls = (row: ImportReviewRow) => {
    const td = decisions.transfers[row.index] ?? null;
    const isTransferClass = row.classification.kind === 'transfer';
    // Bedž "Iz pravila" smije se prikazati SAMO za stvaran pogodak iz baze.
    const isRuleHit = isTransferClass && row.classification.origin === 'rule';
    /**
     * Predznak je odgovor: kad smjer dolazi s izvoda, UI ne pita — samo javlja.
     * Odluka korisnika (`td`) ne može ga promijeniti jer se gumbi ni ne nude.
     */
    const derivedDirection: MoneyDirection | null =
      isTransferClass && row.classification.directionSource === 'amount'
        ? row.classification.direction
        : null;
    const directionConflict = isTransferClass && row.classification.directionConflict;
    const currentTargetId = td?.enabled
      ? td.targetIncomeSourceId
      : (isTransferClass ? row.classification.targetIncomeSourceId : '');
    // Predodabir smjera: izvod → odluka → klasifikacija → opis.
    const suggestedDirection: MoneyDirection | null = isTransferClass
      ? row.classification.direction
      : classifyTransferDescription(row.description).direction;
    const currentDirection: MoneyDirection | null =
      derivedDirection ?? (td?.enabled ? td.direction : suggestedDirection);
    /**
     * Korisnik je izričito rekao "novac je otišao izvan mojih računa" —
     * postojeći `enabled:false` put (redak se uvozi po predznaku). Ovdje je
     * samo VIDLJIVO stanje te odluke, bez ikakve promjene logike.
     */
    const optedOut = isTransferClass && td?.enabled === false;
    const showControls = (!!td?.enabled || isTransferClass) && !optedOut;
    const showValidation = attemptedConfirm || touchedRows[row.index] === true;
    const missingTarget = showControls && !currentTargetId && showValidation;
    const missingDirection =
      showControls && !derivedDirection && currentDirection !== 'in'
      && currentDirection !== 'out' && showValidation;

    if (optedOut) {
      return (
        <div
          className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/40 p-2"
          data-testid={`transfer-opted-out-${row.index}`}
        >
          <span className="text-xs text-foreground">
            {currentDirection === 'in'
              ? t('importReview.outsideAccounts.appliedIn')
              : t('importReview.outsideAccounts.appliedOut')}
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-xs shrink-0"
            onClick={() => updateTransfer(
              row.index,
              buildDecision(row, currentTargetId, false, currentDirection),
            )}
          >
            {t('importReview.outsideAccounts.undo')}
          </Button>
        </div>
      );
    }


    if (!showControls) {
      // Compact CTA for new/question rows. Clicking creates an ENABLED
      // decision with an EMPTY target — the user must then pick a wallet.
      // No default selection: prevents "Keks was first in list" mis-book.
      if (targets.length === 0) return null;
      return (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-2 h-9 rounded-lg"
          onClick={() => {
            updateTransfer(
              row.index,
              buildDecision(row, '', false, classifyTransferDescription(row.description).direction),
            );
          }}
        >
          <ArrowRightLeft className="w-3.5 h-3.5 mr-1.5" />
          {t('importReview.markAsTransfer')}
        </Button>
      );
    }

    // Rule-hit rows without an explicit override → hydrate the decision so
    // the picker binds to a real value.
    const activeDecision = td?.enabled
      ? (derivedDirection && td.direction !== derivedDirection
          ? { ...td, direction: derivedDirection }
          : td)
      : buildDecision(row, currentTargetId, false, currentDirection);

    return (
      <div className={cn(
        'mt-2 space-y-2 rounded-lg border p-2',
        missingTarget || missingDirection ? 'border-destructive/60 bg-destructive/5' : 'border-primary/30 bg-primary/5',
      )}>
        {isTransferClass && (
          <Badge variant="secondary" className="text-[10px]">
            <ArrowRightLeft className="w-3 h-3 mr-1" />
            {isRuleHit
              ? t('importReview.badges.fromRule')
              : t('importReview.badges.recognizedTransfer')}
          </Badge>
        )}
        {autoFilled[row.index] && (
          <Badge
            variant="outline"
            className="text-[10px]"
            data-testid={`pattern-filled-${row.index}`}
          >
            {t('importReview.patternFill.badge')}
          </Badge>
        )}
        {derivedDirection ? (
          <div className="space-y-1">
            <p className="text-xs text-foreground flex items-center gap-1.5">
              <ArrowRightLeft className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              {t(`importReview.transferDirection.fromStatement.${derivedDirection}`)}
            </p>
            {directionConflict && (
              <p className="text-[11px] text-muted-foreground">
                {t('importReview.transferDirection.conflictNote')}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {t('importReview.transferDirection.label')}
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {(['in', 'out'] as const).map(dir => (
                <Button
                  key={dir}
                  type="button"
                  size="sm"
                  variant={currentDirection === dir ? 'default' : 'outline'}
                  className={cn('h-11 rounded-lg text-xs', missingDirection && 'border-destructive')}
                  onClick={() => {
                    markTouched(row.index);
                    updateTransfer(
                      row.index,
                      buildDecision(row, currentTargetId, activeDecision.rememberRule, dir),
                    );
                  }}
                >
                  {t(`importReview.transferDirection.${dir}`)}
                </Button>
              ))}
            </div>
            {missingDirection && (
              <p className="text-[11px] text-destructive flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {t('importReview.transferDirectionRequired')}
              </p>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground shrink-0">
            {currentDirection === 'in' ? t('importReview.transferFrom') : t('importReview.transferTo')}
          </Label>
          <Select
            value={currentTargetId || undefined}
            onValueChange={(v) => {
              markTouched(row.index);
              updateTransfer(row.index, buildDecision(row, v, activeDecision.rememberRule, currentDirection));
            }}
          >
            <SelectTrigger className={cn('h-9 rounded-lg text-sm', missingTarget && 'border-destructive')}>
              <SelectValue placeholder={t('importReview.pickWallet')} />
            </SelectTrigger>
            <SelectContent>
              {targets.map(o => (
                <SelectItem key={o.id} value={o.id}>
                  {(o.icon ? `${o.icon} ` : '') + o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {missingTarget && (
          <p className="text-[11px] text-destructive flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            {currentDirection === 'in'
              ? t('importReview.transferSourceRequired')
              : t('importReview.transferTargetRequired')}
          </p>
        )}

        {/* TREĆI ODGOVOR, RAVNOPRAVAN: novac je otišao izvan korisnikovih
            računa — odredišni novčanik ne postoji. Isti put kao ghost
            "Nije prijenos" (enabled:false), samo vidljiv. */}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-full min-h-11 rounded-lg text-xs"
          data-testid={`transfer-outside-${row.index}`}
          onClick={() => {
            if (isTransferClass) {
              updateTransfer(row.index, { ...activeDecision, enabled: false, rememberRule: false });
            } else {
              updateTransfer(row.index, null);
            }
          }}
        >
          <X className="w-3.5 h-3.5 mr-1.5" />
          {t('importReview.outsideAccounts.button')}
        </Button>



        {/* "Zapamti" — nudi se uvijek osim kad pravilo VEĆ postoji u bazi.
            Prepoznati (keyword) prijenosi nemaju pravilo, pa se bez ovoga
            aplikacija nikad ne bi ničemu naučila. */}
        {!isRuleHit && (
          <label htmlFor={`ir-t-rem-${row.index}`} className="flex items-center gap-2 min-h-9 cursor-pointer">
            <Checkbox
              id={`ir-t-rem-${row.index}`}
              checked={activeDecision.rememberRule}
              onCheckedChange={(v) =>
                updateTransfer(row.index, buildDecision(row, currentTargetId, v === true, currentDirection))
              }
            />
            <span className="text-xs">{t('importReview.rememberRule')}</span>
          </label>
        )}

        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 px-2 text-xs"
          onClick={() => {
            if (isTransferClass) {
              // "Poništi pravilo" — izvršava se kao običan prihod/rashod po
              // predznaku izvoda. Samo se transfer override gasi.
              updateTransfer(row.index, { ...activeDecision, enabled: false, rememberRule: false });
            } else {
              updateTransfer(row.index, null);
            }
          }}
        >
          <X className="w-3 h-3 mr-1" />
          {isTransferClass ? t('importReview.cancelRule') : t('importReview.cancelTransfer')}
        </Button>
      </div>
    );
  };

  return (
    <div className="min-h-dvh flex flex-col bg-background">
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border/60">
        <PageContainer noVerticalPadding className="flex items-center gap-2 py-3">
          <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" onClick={handleCancel} aria-label={t('common.back')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold truncate">{t('importReview.title')}</h1>
            <p className="text-xs text-muted-foreground truncate">
              {payload.sourceName} · {t('importReview.answeredCounter', { answered: summary.answeredQuestions, total: summary.totalQuestions })}
            </p>
          </div>
        </PageContainer>
      </header>

      <main className="flex-1 overflow-y-auto pb-32">
        <PageContainer className="space-y-6">

        {/* Auto-merge section */}
        {grouped.auto.length > 0 && (
          <section aria-labelledby="ir-auto">
            <h2 id="ir-auto" className="flex items-center gap-2 text-sm font-semibold mb-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              {t('importReview.sections.auto')}
              <span className="text-xs font-normal text-muted-foreground">({grouped.auto.length})</span>
            </h2>
            <ul className="space-y-2">
              {grouped.auto.map((row) => {
                const manual = row.classification.kind === 'auto_merge'
                  ? payload.manualCandidates[row.classification.manualId]
                  : undefined;
                const isIndistinguishable = row.classification.kind === 'auto_merge'
                  && row.classification.origin === 'indistinguishable';
                const checked = decisions.autoMerge[row.index] === true;
                const rowId = `ir-auto-${row.index}`;
                return (
                  <li key={row.index} className="rounded-xl border border-border/60 bg-card p-3">
                    <label htmlFor={rowId} className="flex items-start gap-3 min-h-11 cursor-pointer">
                      <Checkbox
                        id={rowId}
                        checked={checked}
                        onCheckedChange={(v) => updateAuto(row.index, v === true)}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">{fmtDate(row.date)}</span>
                          <span className="font-mono font-semibold text-sm">{formatAmount(row.amount)}</span>
                        </div>
                        <p className="text-sm">
                          <span className="text-muted-foreground">{t('importReview.bank')}: </span>
                          <span className="font-medium">{row.merchantName || '—'}</span>
                        </p>
                        {manual && (
                          <p className="text-xs text-muted-foreground">
                            <span>↔ {t('importReview.yours')}: </span>
                            <span>{manual.merchantName || manual.description || '—'}</span>
                          </p>
                        )}
                        {isIndistinguishable && (
                          <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                            {t('importReview.indistinguishable.badge')}
                          </span>
                        )}
                      </div>
                    </label>
                    {isIndistinguishable && (
                      <div className="mt-2 flex justify-end">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-11"
                          onClick={() => {
                            if (checked) {
                              updateAuto(row.index, false);
                              updateNew(row.index, true);
                            } else {
                              updateAuto(row.index, true);
                              updateNew(row.index, false);
                            }
                          }}
                        >
                          {checked
                            ? t('importReview.indistinguishable.split')
                            : t('importReview.indistinguishable.rejoin')}
                        </Button>
                      </div>
                    )}
                    {renderRawLine(row.index)}
                  </li>
                );
              })}

            </ul>
          </section>
        )}

        {/* Transfers section */}
        {grouped.transfers.length > 0 && (
          <section aria-labelledby="ir-transfers">
            <h2 id="ir-transfers" className="flex items-center gap-2 text-sm font-semibold mb-2">
              <ArrowRightLeft className="w-4 h-4 text-primary" />
              {t('importReview.sections.transfers')}
              <span className="text-xs font-normal text-muted-foreground">({grouped.transfers.length})</span>
            </h2>
            {autoFilledCount > 0 && (
              <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/40 p-2">
                <span className="text-xs text-muted-foreground">
                  {t('importReview.patternFill.notice', { count: autoFilledCount })}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2 text-xs shrink-0"
                  data-testid="pattern-fill-undo-all"
                  onClick={undoAllPatternFills}
                >
                  <X className="w-3 h-3 mr-1" />
                  {t('importReview.patternFill.undoAll')}
                </Button>
              </div>
            )}
            <ul className="space-y-2">
              {grouped.transfers.map((row) => (
                <li key={row.index} id={`ir-row-${row.index}`} className="rounded-xl border border-primary/40 bg-primary/5 p-3">
                  <div className="flex items-start gap-3 min-h-11">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">{fmtDate(row.date)}</span>
                        <span className="font-mono font-semibold text-sm">{formatAmount(row.amount)}</span>
                      </div>
                      <p className="text-sm">
                        <span className="text-muted-foreground">{t('importReview.bank')}: </span>
                        <span className="font-medium">{row.merchantName || '—'}</span>
                      </p>
                      <RowDescription description={row.description} />
                      {renderRawLine(row.index)}
                      {renderTransferControls(row)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Questions section */}
        {grouped.questions.length > 0 && (
          <section aria-labelledby="ir-q">
            <h2 id="ir-q" className="flex items-center gap-2 text-sm font-semibold mb-2">
              <HelpCircle className="w-4 h-4 text-amber-500" />
              {t('importReview.sections.questions')}
              <span className="text-xs font-normal text-muted-foreground">
                ({summary.answeredQuestions}/{summary.totalQuestions})
              </span>
            </h2>
            {autoFilledQuestionCount > 0 && (
              <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/40 p-2">
                <span className="text-xs text-muted-foreground">
                  {t('importReview.patternFill.notice', { count: autoFilledQuestionCount })}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2 text-xs shrink-0"
                  data-testid="question-pattern-fill-undo-all"
                  onClick={undoAllQuestionFills}
                >
                  <X className="w-3 h-3 mr-1" />
                  {t('importReview.patternFill.undoAll')}
                </Button>
              </div>
            )}
            <ul className="space-y-2">
              {grouped.questions.map((row) => {
                if (row.classification.kind !== 'question') return null;
                const answer = decisions.questions[row.index];
                const reasonKey = `importReview.reasons.${row.classification.reason}` as const;
                return (
                  <li key={row.index} id={`ir-row-${row.index}`} className={cn(
                    'rounded-xl border p-3 space-y-3',
                    answer ? 'border-border/60 bg-card' : 'border-amber-500/50 bg-amber-500/5',
                  )}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">{fmtDate(row.date)}</span>
                      <span className="font-mono font-semibold text-sm">{formatAmount(row.amount)}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px]">{t(reasonKey)}</Badge>
                      {autoFilledQuestions[row.index] && (
                        <Badge
                          variant="outline"
                          className="text-[10px]"
                          data-testid={`question-pattern-filled-${row.index}`}
                        >
                          {t('importReview.patternFill.badge')}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm">
                      <span className="text-muted-foreground">{t('importReview.bank')}: </span>
                      <span className="font-medium">{row.merchantName || '—'}</span>
                    </p>
                    <RadioGroup
                      value={answer ? (answer.choice === 'merge' ? `merge:${answer.manualId}` : 'new') : ''}
                      onValueChange={(v) => {
                        if (v === 'new') updateQuestion(row.index, { choice: 'new' });
                        else if (v.startsWith('merge:')) updateQuestion(row.index, { choice: 'merge', manualId: v.slice(6) });
                      }}
                      className="space-y-2"
                    >
                      {row.classification.candidateIds.map((cid) => {
                        const cand = payload.manualCandidates[cid];
                        if (!cand) return null;
                        const rid = `ir-q-${row.index}-${cid}`;
                        return (
                          <div key={cid} className="flex items-start gap-3 min-h-11 rounded-lg border border-border/40 p-2">
                            <RadioGroupItem id={rid} value={`merge:${cid}`} className="mt-1" />
                            <Label htmlFor={rid} className="flex-1 min-w-0 text-sm font-normal cursor-pointer">
                              <span className="text-xs text-muted-foreground block">{t('importReview.mergeWith')}</span>
                              <span className="block truncate">{cand.merchantName || cand.description || '—'}</span>
                              <span className="text-xs text-muted-foreground block">{fmtDate(cand.date)}</span>
                            </Label>
                          </div>
                        );
                      })}
                      <div className="flex items-start gap-3 min-h-11 rounded-lg border border-border/40 p-2">
                        <RadioGroupItem id={`ir-q-${row.index}-new`} value="new" className="mt-1" />
                        <Label htmlFor={`ir-q-${row.index}-new`} className="flex-1 text-sm font-normal cursor-pointer">
                          {t('importReview.keepAsNew')}
                        </Label>
                      </div>
                    </RadioGroup>
                    {renderRawLine(row.index)}
                    {answer?.choice === 'new' && renderNeedsExplanation(row.index)}
                    {renderTransferControls(row)}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* New rows section */}
        {grouped.news.length > 0 && (
          <section aria-labelledby="ir-new">
            <h2 id="ir-new" className="flex items-center gap-2 text-sm font-semibold mb-2">
              <Plus className="w-4 h-4 text-primary" />
              {t('importReview.sections.newRows')}
              <span className="text-xs font-normal text-muted-foreground">({grouped.news.length})</span>
            </h2>
            <ul className="space-y-2">
              {grouped.news.map((row) => {
                const locked = isNewRowLocked(row);
                const previouslyDeleted = isPreviouslyDeletedRow(row);
                const restore = isRestoreDeleted(decisions, row.index);
                const checked = previouslyDeleted ? restore : decisions.newRows[row.index] === true;
                const rowId = `ir-new-${row.index}`;
                return (
                  <li key={row.index} className={cn(
                    'rounded-xl border p-3',
                    locked ? 'border-amber-500/40 bg-amber-500/5' : 'border-border/60 bg-card',
                  )}>
                    <label htmlFor={rowId} className={cn('flex items-start gap-3 min-h-11', locked ? 'cursor-not-allowed' : 'cursor-pointer')}>
                      <Checkbox
                        id={rowId}
                        checked={checked}
                        disabled={locked || previouslyDeleted}
                        onCheckedChange={(v) => updateNew(row.index, v === true)}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">{fmtDate(row.date)}</span>
                          <span className="font-mono font-semibold text-sm">{formatAmount(row.amount)}</span>
                        </div>
                        <p className="text-sm truncate">
                          <span className="font-medium">{row.merchantName || '—'}</span>
                        </p>
                        <RowDescription description={row.description} />
                        {locked && (
                          <Badge variant="outline" className="text-[10px] mt-1 border-amber-500/60 text-amber-700 dark:text-amber-300">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            {t('importReview.badges.fingerprintExists')}
                          </Badge>
                        )}
                        {previouslyDeleted && (
                          <div className="space-y-1 mt-1">
                            <Badge variant="outline" className="text-[10px] border-muted-foreground/40 text-muted-foreground">
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              {t('importReview.badges.previouslyDeleted')}
                            </Badge>
                            {row.deletedTwinDate && (
                              <p className="text-[11px] text-muted-foreground">
                                {t('importReview.previouslyDeletedTwin', { date: fmtDate(row.deletedTwinDate) })}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </label>
                    {renderRawLine(row.index)}
                    {previouslyDeleted && (
                      <div className="mt-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={restore ? 'default' : 'outline'}
                          className="min-h-11"
                          onClick={() => updateRestoreDeleted(row.index, !restore)}
                        >
                          {restore
                            ? t('importReview.actions.restoreDeletedOn')
                            : t('importReview.actions.restoreDeleted')}
                        </Button>
                      </div>
                    )}
                    {!locked && !previouslyDeleted && renderNeedsExplanation(row.index)}
                    {!locked && !previouslyDeleted && renderLateMatchOffer(row)}
                    {!locked && !previouslyDeleted && renderTransferControls(row)}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        </PageContainer>
      </main>

      {/* Sticky CTA */}
      <footer className="fixed bottom-0 inset-x-0 z-20 border-t border-border/60 bg-background/95 backdrop-blur py-3 safe-area-pb">
        <PageContainer noVerticalPadding className="space-y-2">
          <p className="text-xs text-muted-foreground text-center">
            {t('importReview.plannedSummaryV2', {
              merges: summary.plannedMerges,
              news: summary.plannedNew,
              transfers: summary.plannedTransfers,
              skipped: summary.plannedSkipped,
            })}
          </p>
          {(payload.pendingReservations ?? 0) > 0 && (
            <p className="text-xs text-muted-foreground text-center" data-testid="pending-reservations">
              {t('importReview.pendingReservations', { count: payload.pendingReservations })}
            </p>
          )}
          {blockerMessages.length > 0 && !summary.canConfirm && (
            <div
              className="rounded-lg border border-destructive/60 bg-destructive/5 p-2 space-y-1"
              role="alert"
              data-testid="confirm-blockers"
            >
              {blockerMessages.map(msg => (
                <p key={msg} className="text-[11px] text-destructive flex items-start gap-1">
                  <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                  <span>{msg}</span>
                </p>
              ))}
            </div>
          )}
          <Button
            className="w-full min-h-12 rounded-xl"
            onClick={handleConfirm}
            disabled={confirming}
            aria-disabled={!summary.canConfirm}
          >
            {confirming ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {summary.canConfirm
              ? t('importReview.confirm')
              : t('importReview.confirmDisabled', { count: summary.unansweredQuestions })}
          </Button>
        </PageContainer>
      </footer>
    </div>
  );
};

export default ImportReview;

/**
 * Lookup imported_statements.id za dati batch i pushaj queue entries za sve
 * sourceove kojima treba reconciliation. Ime i ikona pull-ana iz payload
 * (primarni source) i availableTargets (transfer targeti).
 */
async function enqueueReconciliationForBatch(
  summaries: readonly ReconciliationSummaryEntry[],
  batchId: string,
  payload: ImportReviewPayload,
): Promise<void> {
  // History gate: povijesni izvodi (završavaju na dan sidra ili prije) ne
  // ulaze u queue — sidro se ne dira i korisnik ne dobiva pitanje.
  const needing = summaries.filter(s => s.needsReconciliation);
  if (needing.length === 0) return;

  let statementId: string | null = null;
  try {
    const { data } = await supabase
      .from('imported_statements')
      .select('id')
      .eq('import_batch_id', batchId)
      .maybeSingle();
    statementId = (data as any)?.id ?? null;
  } catch { /* noop — banner iz TUR 2 se neće znati vratiti, ali dijalog radi */ }

  const fallbackAsOfIso = new Date().toISOString();
  const nameFor = (sourceId: string): { name: string; icon?: string | null } => {
    if (sourceId === payload.sourceId) return { name: payload.sourceName };
    const t = payload.availableTargets.find(x => x.id === sourceId);
    return { name: t?.name ?? sourceId.slice(0, 8), icon: t?.icon ?? null };
  };

  const entries: ReconciliationQueueEntry[] = needing.map(summary => {
    const nm = nameFor(summary.sourceId);
    return {
      summary,
      sourceName: nm.name,
      sourceIcon: nm.icon,
      batchId,
      // Sidro dobiva datum zadnjeg retka uvezenog izvoda, ne trenutak klika.
      asOfIso: resolveAsOfIso(summary, fallbackAsOfIso),
      importedStatementId: statementId,
    };
  });


  // TUR 2: perzistiraj snapshot da banner može ponuditi "Nastavi" nakon
  // zatvaranja dijaloga. Non-fatal ako write padne — queue u memoriji radi.
  if (statementId) {
    const snapshot: ReconciliationPendingSnapshot = {
      batchId,
      asOfIso: fallbackAsOfIso,
      entries: entries.map(e => ({
        summary: e.summary,
        sourceName: e.sourceName,
        sourceIcon: e.sourceIcon ?? null,
      })),
    };
    try {
      await writePendingSnapshot(
        supabase as unknown as ReconciliationSupabaseClient,
        statementId,
        snapshot,
      );
    } catch { /* noop */ }
  }

  enqueueReconciliation(entries);
}
