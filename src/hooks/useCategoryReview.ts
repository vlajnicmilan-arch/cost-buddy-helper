/**
 * Pregled kategorija: dohvat podataka + potvrda/poništavanje kroz RPC.
 * Pisanje ide ISKLJUČIVO kroz category_review_apply / category_review_revert.
 */
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import i18n from '@/i18n';
import { useAuth } from '@/hooks/useAuth';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { logDiagnostic } from '@/lib/diagnosticLogger';
import { getBuildStamp } from '@/lib/buildStamp';
import {
  buildCategoryReview,
  categoryReviewErrorKey,
  resolveCategoryReviewErrorCode,
  toApplyItems,
  type ReviewCorrection,
  type ReviewProposal,
  type ReviewRow,
} from '@/lib/categoryReviewSuggestions';

const PAGE = 1000;
const CHUNK = 500;

export interface ReviewHistoryEntry extends ReviewCorrection {
  id: string;
  expense_id: string | null;
  original_category: string;
  original_movement_kind: string | null;
  original_tags: string[] | null;
  corrected_tags: string[] | null;
  client_request_id: string | null;
}

interface ReviewData {
  rows: ReviewRow[];
  customCategories: { id: string; name: string; icon: string | null; color: string | null; group_key: string | null }[];
  corrections: ReviewHistoryEntry[];
  ownSourceNames: string[];
  ownCompanyNames: string[];
  workerNames: string[];
  selfNames: string[];
}

async function fetchAllPersonalRows(userId: string): Promise<ReviewRow[]> {
  const out: ReviewRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('expenses')
      .select('id,type,amount,date,category,description,merchant_name,movement_kind,tags,expense_nature,deleted_at')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .is('project_id', null)
      .is('business_profile_id', null)
      .order('date', { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...((data ?? []) as ReviewRow[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export const categoryReviewQueryKey = (uid: string | undefined) => ['categoryReview', uid] as const;

export function useCategoryReviewData(enabled = true) {
  const { user } = useAuth();
  const uid = user?.id;
  const query = useQuery({
    queryKey: categoryReviewQueryKey(uid),
    enabled: enabled && !!uid,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ReviewData> => {
      const [rows, cats, corr, sources, companies, workers, profile] = await Promise.all([
        fetchAllPersonalRows(uid!),
        supabase.from('custom_categories').select('id,name,icon,color,group_key').eq('user_id', uid!),
        supabase
          .from('category_corrections')
          .select('id,expense_id,original_category,corrected_category,original_movement_kind,corrected_movement_kind,original_tags,corrected_tags,merchant_name,description,created_at,reverted_at,client_request_id,original_origin')
          .eq('user_id', uid!)
          .order('created_at', { ascending: false })
          .limit(2000),
        supabase.from('custom_payment_sources').select('name').eq('user_id', uid!),
        supabase.from('business_profiles').select('company_name').eq('user_id', uid!),
        supabase.from('workers').select('first_name,last_name').eq('user_id', uid!),
        supabase.from('profiles').select('display_name').eq('user_id', uid!).maybeSingle(),
      ]);
      for (const r of [cats, corr, sources, companies, workers]) if (r.error) throw r.error;
      const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
      const selfNames = [meta.full_name, meta.name, profile.data?.display_name]
        .filter((v): v is string => typeof v === 'string' && v.trim().includes(' '));
      return {
        rows,
        customCategories: (cats.data ?? []) as ReviewData['customCategories'],
        corrections: (corr.data ?? []) as unknown as ReviewHistoryEntry[],
        ownSourceNames: (sources.data ?? []).map((s) => s.name).filter(Boolean),
        ownCompanyNames: (companies.data ?? []).map((c) => c.company_name).filter((n): n is string => !!n),
        workerNames: (workers.data ?? []).map((w) => `${w.first_name ?? ''} ${w.last_name ?? ''}`.trim()).filter(Boolean),
        selfNames,
      };
    },
  });

  const review = useMemo(() => {
    const d = query.data;
    if (!d) return null;
    return buildCategoryReview(d.rows, {
      customCategories: d.customCategories,
      corrections: d.corrections,
      ownSourceNames: d.ownSourceNames,
      ownCompanyNames: d.ownCompanyNames,
      workerNames: d.workerNames,
      selfNames: d.selfNames,
    });
  }, [query.data]);

  const history = useMemo(
    () => (query.data?.corrections ?? []).filter((c) => (c as { original_origin?: string }).original_origin === 'category_review'),
    [query.data],
  );

  return { ...query, review, history, customCategories: query.data?.customCategories ?? [] };
}

function logReviewError(err: unknown, rpc: string, itemCount: number) {
  const e = err as { code?: string; message?: string } | null;
  logDiagnostic({
    event: 'category_review_error',
    severity: 'error',
    details: {
      rpc,
      item_count: itemCount,
      db_code: e?.code ?? null,
      db_message: String(e?.message ?? err),
      resolved_code: resolveCategoryReviewErrorCode(e),
      build: getBuildStamp(),
    },
  });
  showError(i18n.t(categoryReviewErrorKey(resolveCategoryReviewErrorCode(e))));
}

function useInvalidate() {
  const qc = useQueryClient();
  return async () => {
    await Promise.allSettled([
      qc.invalidateQueries({ queryKey: ['categoryReview'] }),
      qc.invalidateQueries({ queryKey: ['expenses'] }),
    ]);
    window.dispatchEvent(new CustomEvent('expenses-changed'));
  };
}

export interface ApplyVars {
  rows: { id: string }[];
  proposal: ReviewProposal;
  clientRequestId: string;
}

export function useCategoryReviewApply() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ rows, proposal, clientRequestId }: ApplyVars) => {
      const items = toApplyItems(rows, proposal);
      let changed = 0;
      for (let i = 0; i < items.length; i += CHUNK) {
        const { data, error } = await supabase.rpc('category_review_apply', {
          _items: items.slice(i, i + CHUNK),
          _client_request_id: clientRequestId,
        });
        if (error) throw Object.assign(error, { __count: items.length });
        changed += Number((data as { changed?: number } | null)?.changed ?? 0);
      }
      return changed;
    },
    onSuccess: async (changed) => {
      await invalidate();
      showSuccess(i18n.t('categoryReview.applied', { count: changed }));
    },
    onError: (err, vars) => logReviewError(err, 'category_review_apply', vars.rows.length),
  });
}

export function useCategoryReviewRevert() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { data, error } = await supabase.rpc('category_review_revert', { _correction_ids: ids });
      if (error) throw error;
      return data as { reverted: number; skipped: { id: string; reason: string }[] };
    },
    onSuccess: async (res) => {
      await invalidate();
      if (res.skipped?.length) showError(i18n.t('categoryReview.revertSkipped', { count: res.skipped.length }));
      else showSuccess(i18n.t('categoryReview.reverted', { count: res.reverted }));
    },
    onError: (err, ids) => logReviewError(err, 'category_review_revert', ids.length),
  });
}
