/**
 * Reconciliation dialog actions — čisti API iznad Supabase klijenta koji:
 *   - alignToBank: poziva align_source_to_bank RPC (novo sidro).
 *   - keepMine:   postavlja imported_statements.reconciliation_state='user_override'
 *                 i upisuje per-source odluku u reconciliation_meta.jsonb.
 *   - markPending / setSourceReviewed: manje operacije korištene iz banner-a (TUR 2).
 *
 * Zašto minimalni supabase interface: lakše mockati u testovima.
 */
import type { ReconciliationSummaryEntry } from '@/lib/importReview/executor';

export type ReconciliationSourceState = 'aligned' | 'user_override' | 'pending';

export interface ReconciliationSupabaseClient {
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }>;
  from(table: string): any;
}

export interface AlignInput {
  readonly supabase: ReconciliationSupabaseClient;
  readonly summary: ReconciliationSummaryEntry;
  readonly asOfIso: string;
  readonly importedStatementId?: string | null;
}

export interface AlignResult {
  readonly newBalance: number;
  readonly idempotentSkip: boolean;
}

export async function alignToBank(input: AlignInput): Promise<AlignResult> {
  const { supabase, summary, asOfIso, importedStatementId } = input;
  if (summary.bankBalance === null) {
    throw new Error('alignToBank: bankBalance missing');
  }
  const res = await supabase.rpc('align_source_to_bank', {
    p_source_id: summary.sourceId,
    p_bank_balance: summary.bankBalance,
    p_as_of: asOfIso,
  });
  if (res.error) throw new Error(res.error.message);
  const data = (res.data ?? {}) as { new_anchor_balance?: number; idempotent_skip?: boolean };

  if (importedStatementId) {
    await patchImportedStatement(supabase, importedStatementId, summary.sourceId, 'aligned');
  }

  return {
    newBalance: Number(data.new_anchor_balance ?? summary.bankBalance),
    idempotentSkip: data.idempotent_skip === true,
  };
}

export interface KeepMineInput {
  readonly supabase: ReconciliationSupabaseClient;
  readonly summary: ReconciliationSummaryEntry;
  readonly importedStatementId?: string | null;
}

export async function keepMine(input: KeepMineInput): Promise<void> {
  const { supabase, summary, importedStatementId } = input;
  if (!importedStatementId) return;
  await patchImportedStatement(supabase, importedStatementId, summary.sourceId, 'user_override');
}

export async function markSourceReviewed(
  supabase: ReconciliationSupabaseClient,
  importedStatementId: string,
  sourceId: string,
): Promise<void> {
  await patchImportedStatement(supabase, importedStatementId, sourceId, 'pending');
}

async function patchImportedStatement(
  supabase: ReconciliationSupabaseClient,
  statementId: string,
  sourceId: string,
  sourceState: ReconciliationSourceState,
): Promise<void> {
  // Read-modify-write reconciliation_meta.sources so multi-source batchevi
  // pravilno akumuliraju odluke po sourceId. Overall state agregiramo lokalno.
  const sel = await supabase.from('imported_statements')
    .select('reconciliation_meta,reconciliation_state')
    .eq('id', statementId)
    .maybeSingle();
  const meta = ((sel?.data as any)?.reconciliation_meta ?? {}) as { sources?: Record<string, ReconciliationSourceState> };
  const sources = { ...(meta.sources ?? {}), [sourceId]: sourceState };
  const overall = aggregateOverall(sources);

  await supabase.from('imported_statements')
    .update({
      reconciliation_state: overall,
      reconciliation_meta: { ...meta, sources },
    })
    .eq('id', statementId);
}

/** Overall = 'aligned' ako sve aligned, 'user_override' ako sve u {aligned,user_override} i ima override, inače 'pending'. */
export function aggregateOverall(sources: Record<string, ReconciliationSourceState>): ReconciliationSourceState {
  const vals = Object.values(sources);
  if (vals.length === 0) return 'pending';
  if (vals.some(v => v === 'pending')) return 'pending';
  if (vals.every(v => v === 'aligned')) return 'aligned';
  return 'user_override';
}
