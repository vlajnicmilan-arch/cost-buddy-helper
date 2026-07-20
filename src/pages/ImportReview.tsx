import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, CheckCircle2, HelpCircle, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useAuth } from '@/hooks/useAuth';
import { useAppState } from '@/contexts/AppStateContext';
import { supabase } from '@/integrations/supabase/client';
import { logDiagnostic } from '@/lib/diagnosticLogger';
import { cn } from '@/lib/utils';
import {
  clearDraft,
  clearPayload,
  loadDraft,
  loadPayload,
  saveDraft,
} from '@/lib/importReview/draft';
import {
  answerQuestion,
  buildInitialDecisions,
  isNewRowLocked,
  setAutoMerge,
  setNewRow,
  summarize,
} from '@/lib/importReview/state';
import { executeDecisions, type ExecutorResult } from '@/lib/importReview/executor';
import type {
  ImportReviewDecisions,
  ImportReviewPayload,
  ImportReviewRow,
  QuestionAnswer,
} from '@/lib/importReview/types';

const SAVE_DEBOUNCE_MS = 300;

const ImportReview = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { formatAmount } = useCurrency();

  const [payload, setPayload] = useState<ImportReviewPayload | null>(null);
  const [decisions, setDecisions] = useState<ImportReviewDecisions | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Load payload + optional draft on mount.
  useEffect(() => {
    const p = loadPayload();
    if (!p) {
      // No payload — redirect back to app.
      navigate('/app', { replace: true });
      return;
    }
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

  const grouped = useMemo(() => {
    if (!payload) return { auto: [], questions: [], news: [] };
    const auto: ImportReviewRow[] = [];
    const questions: ImportReviewRow[] = [];
    const news: ImportReviewRow[] = [];
    for (const r of payload.rows) {
      if (r.classification.kind === 'auto_merge') auto.push(r);
      else if (r.classification.kind === 'question') questions.push(r);
      else news.push(r);
    }
    return { auto, questions, news };
  }, [payload]);

  const handleCancel = useCallback(() => {
    // Draft stays for the resume banner; only payload cleared if user truly cancels.
    // Milan constraint: never lose decisions to a stray back-tap. Keep draft.
    navigate('/app');
  }, [navigate]);

  const { user } = useAuth();
  const { activeBusinessProfileId } = useAppState();

  const handleConfirm = useCallback(async () => {
    if (!payload || !decisions || !summary?.canConfirm) return;
    if (!user) {
      toast.error(t('common.notAuthenticated'));
      return;
    }
    setConfirming(true);
    // Save draft up-front so a mid-flight failure keeps decisions intact
    // and the same batchId is reused on retry (idempotent).
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
          skipped_by_user: result.skippedByUser,
          skipped_fingerprint: result.skippedFingerprint,
          skipped_merged: result.skippedMerged,
          skipped_duplicate: result.skippedDuplicate,
          duration_ms: result.durationMs,
          errors: result.errors.length,
        });
      } catch { /* noop */ }

      if (result.errors.length > 0) {
        toast.error(t('importReview.confirmedWithErrors', {
          merged: result.merged,
          inserted: result.inserted,
          errors: result.errors.length,
        }));
        // Draft retained → user can "Nastavi pregled uvoza" and retry.
        return;
      }

      clearDraft();
      clearPayload();
      toast.success(t('importReview.confirmedSummary', {
        merged: result.merged,
        inserted: result.inserted,
        skipped: result.skippedByUser + result.skippedFingerprint + result.skippedMerged + result.skippedDuplicate,
      }));
      navigate('/app');
    } catch (e) {
      try {
        logDiagnostic('import_execute_failed', {
          job_id: payload.jobId,
          message: e instanceof Error ? e.message : String(e),
        });
      } catch { /* noop */ }
      toast.error(t('importReview.confirmFailed'));
    } finally {
      setConfirming(false);
    }
  }, [payload, decisions, summary, navigate, t, user, activeBusinessProfileId]);

  const updateAuto = useCallback((idx: number, value: boolean) => {
    setDecisions(prev => (prev ? setAutoMerge(prev, idx, value) : prev));
  }, []);
  const updateNew = useCallback((idx: number, value: boolean) => {
    setDecisions(prev => (prev ? setNewRow(prev, idx, value) : prev));
  }, []);
  const updateQuestion = useCallback((idx: number, answer: QuestionAnswer) => {
    setDecisions(prev => (prev ? answerQuestion(prev, idx, answer) : prev));
  }, []);

  if (!payload || !decisions || !summary) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const fmtDate = (iso: string) => {
    try { return new Date(iso).toLocaleDateString(); } catch { return iso; }
  };

  return (
    <div className="min-h-dvh flex flex-col bg-background">
      {/* Sticky header */}
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border/60">
        <div className="flex items-center gap-2 p-3">
          <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" onClick={handleCancel} aria-label={t('common.back')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold truncate">{t('importReview.title')}</h1>
            <p className="text-xs text-muted-foreground truncate">
              {payload.sourceName} · {t('importReview.answeredCounter', { answered: summary.answeredQuestions, total: summary.totalQuestions })}
            </p>
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="flex-1 overflow-y-auto p-3 pb-32 space-y-6">
        {IMPORT_FROZEN && (
          <div className="p-3 rounded-xl border border-amber-500/40 bg-amber-500/10 text-xs text-amber-800 dark:text-amber-200 flex gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <p>{t('importReview.frozenNotice')}</p>
          </div>
        )}

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
                      </div>
                    </label>
                  </li>
                );
              })}
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
            <ul className="space-y-2">
              {grouped.questions.map((row) => {
                if (row.classification.kind !== 'question') return null;
                const answer = decisions.questions[row.index];
                const reasonKey = `importReview.reasons.${row.classification.reason}` as const;
                return (
                  <li key={row.index} className={cn(
                    'rounded-xl border p-3 space-y-3',
                    answer ? 'border-border/60 bg-card' : 'border-amber-500/50 bg-amber-500/5',
                  )}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">{fmtDate(row.date)}</span>
                      <span className="font-mono font-semibold text-sm">{formatAmount(row.amount)}</span>
                    </div>
                    <Badge variant="outline" className="text-[10px]">{t(reasonKey)}</Badge>
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
                const checked = decisions.newRows[row.index] === true;
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
                        disabled={locked}
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
                        {row.description && (
                          <p className="text-xs text-muted-foreground truncate">{row.description}</p>
                        )}
                        {locked && (
                          <Badge variant="outline" className="text-[10px] mt-1 border-amber-500/60 text-amber-700 dark:text-amber-300">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            {t('importReview.badges.fingerprintExists')}
                          </Badge>
                        )}
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </main>

      {/* Sticky CTA */}
      <footer className="fixed bottom-0 inset-x-0 z-20 border-t border-border/60 bg-background/95 backdrop-blur p-3 safe-area-pb">
        <div className="max-w-lg mx-auto space-y-2">
          <p className="text-xs text-muted-foreground text-center">
            {t('importReview.plannedSummary', {
              merges: summary.plannedMerges,
              news: summary.plannedNew,
              skipped: summary.plannedSkipped,
            })}
          </p>
          <Button
            className="w-full min-h-12 rounded-xl"
            onClick={handleConfirm}
            disabled={!summary.canConfirm || confirming}
          >
            {confirming ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {summary.canConfirm
              ? t('importReview.confirm')
              : t('importReview.confirmDisabled', { count: summary.unansweredQuestions })}
          </Button>
        </div>
      </footer>
    </div>
  );
};

export default ImportReview;
