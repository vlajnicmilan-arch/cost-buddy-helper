/**
 * RED „NA PREGLED" (Temelj 4a) — nejasni retci sinkronizacije ne postaju
 * novi redak u knjigama, nego čekaju odluku vlasnika u
 * `bank_sync_review_queue`.
 *
 * Samo za TROŠAK/PRIHOD. Samo-prijenos (`pickMergeTarget`) i sve ostale grane
 * ostaju točno kao prije — ovaj modul ih ne vidi.
 * Bez iznosa i opisa u dijagnostici; payload nosi samo ono što odluka treba
 * za upis istim oblikom kao sync.
 */
import type { SameExpenseAutoResult } from './sameExpenseRule.ts';
import type { SyncManualRuleRow, SyncMergeChoice } from './bankSyncSameExpense.ts';

export type ReviewReason =
  | 'ambiguous'
  | 'uncertain'
  | 'rule_match_and_transfer_candidate'
  | 'candidate_already_used_in_run';

export interface ReviewPlan {
  readonly reason: ReviewReason;
  readonly candidateIds: readonly string[];
}

const unique = (ids: readonly (string | null | undefined)[]): string[] =>
  [...new Set(ids.filter((v): v is string => typeof v === 'string' && v.length > 0))];

/**
 * Ide li redak u red, s kojim razlogom i kandidatima. `null` = stari put
 * (spajanje, ili novi redak kad nitko nije kandidat).
 */
export function reviewPlanFor(
  rule: SameExpenseAutoResult<SyncManualRuleRow> | undefined,
  choice: SyncMergeChoice,
  transferTargetId: string | null,
  plainCandidateIds: readonly string[],
): ReviewPlan | null {
  if (choice.kind !== 'none') return null;
  if (choice.reason === 'candidate_already_used_in_run' || choice.reason === 'rule_match_and_transfer_candidate') {
    return {
      reason: choice.reason,
      candidateIds: unique([rule?.candidate?.id, transferTargetId]),
    };
  }
  if (rule && (rule.outcome === 'ambiguous' || rule.outcome === 'uncertain')) {
    const passing = rule.passing.map((c) => c.id);
    return {
      reason: rule.outcome,
      candidateIds: unique(passing.length > 0 ? passing : plainCandidateIds),
    };
  }
  return null;
}

export interface ReviewPayloadInput {
  readonly amount: number;
  readonly dateIso: string;
  readonly type: 'expense' | 'income';
  readonly description: string | null;
  readonly currency: string;
  readonly paymentSource: string;
  readonly walletId: string;
  readonly paymentSourceCardId: string | null;
  readonly businessProfileId: string | null;
  readonly bankRawLine: string;
}

/** Isti stupci koje sync upisuje za novi redak — ništa više. */
export function buildReviewPayload(i: ReviewPayloadInput): Record<string, unknown> {
  return {
    amount: i.amount,
    date: i.dateIso,
    type: i.type,
    description: i.description,
    currency: i.currency,
    payment_source: i.paymentSource,
    wallet_id: i.walletId,
    payment_source_card_id: i.paymentSourceCardId,
    business_profile_id: i.businessProfileId,
    bank_raw_line: i.bankRawLine,
  };
}

export interface ReviewQueueRow {
  readonly user_id: string;
  readonly bank_account_id: string;
  readonly stable_id: string;
  readonly payload: Record<string, unknown>;
  readonly reason: ReviewReason;
  readonly candidate_ids: readonly string[];
}

interface InsertClient {
  from(table: string): {
    insert(row: unknown): PromiseLike<{ error: { code?: string; message?: string } | null }>;
  };
}

export type EnqueueResult =
  | { readonly kind: 'queued'; readonly already: boolean }
  | { readonly kind: 'fallback'; readonly code: string | null; readonly message: string };

/**
 * Upis u red. Isti bankovni redak već u redu (23505) = već čeka, ne duplikat.
 * Svaka druga greška → `fallback`: pozivatelj radi kao prije (novi redak),
 * da se ništa ne izgubi.
 */
export async function enqueueReviewRow(client: InsertClient, row: ReviewQueueRow): Promise<EnqueueResult> {
  try {
    const { error } = await client.from('bank_sync_review_queue').insert(row);
    if (!error) return { kind: 'queued', already: false };
    if (error.code === '23505') return { kind: 'queued', already: true };
    return { kind: 'fallback', code: error.code ?? null, message: String(error.message ?? 'unknown') };
  } catch (err) {
    const e = err as { code?: string; message?: string } | null;
    return { kind: 'fallback', code: e?.code ?? null, message: String(e?.message ?? err) };
  }
}

interface SelectClient {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: string): PromiseLike<{
        data: { stable_id: string }[] | null;
        error: { code?: string; message?: string } | null;
      }>;
    };
  };
}

/**
 * Svi bankovni retci ovog računa koji su ikad ušli u red (čekaju, odlučeni
 * ili preskočeni). Takav redak sync više ne obrađuje: odluka je vlasnikova.
 */
export async function loadQueuedStableIds(
  client: SelectClient,
  bankAccountId: string,
): Promise<{ ids: Set<string>; error: { code: string | null; message: string } | null }> {
  try {
    const { data, error } = await client
      .from('bank_sync_review_queue')
      .select('stable_id')
      .eq('bank_account_id', bankAccountId);
    if (error) return { ids: new Set(), error: { code: error.code ?? null, message: String(error.message) } };
    return { ids: new Set((data ?? []).map((r) => r.stable_id)), error: null };
  } catch (err) {
    const e = err as { code?: string; message?: string } | null;
    return { ids: new Set(), error: { code: e?.code ?? null, message: String(e?.message ?? err) } };
  }
}
