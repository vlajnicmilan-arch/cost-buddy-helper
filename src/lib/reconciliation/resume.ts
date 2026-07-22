/**
 * Reconciliation resume — perzistira "pending snapshot" u
 * imported_statements.reconciliation_meta.pending i vraća ga banneru za
 * ponovno otvaranje ReconciliationDialoga nakon što je korisnik zatvorio
 * dijalog (X / back / navigacija).
 *
 * Pravila:
 *  - NE mijenjamo saldo niti expenses. Samo čitamo/pišemo imported_statements.
 *  - Sourceovi koji su već odlučeni (`meta.sources[sourceId]` != 'pending')
 *    isključeni iz resume liste — banner ih više ne nudi.
 *  - Odluka "Odbaci" iz banner-a rješava sve preostale pending sourceove
 *    kao 'user_override' preko postojećeg `keepMine` (idempotentno).
 */
import type { ReconciliationSummaryEntry } from '@/lib/importReview/executor';
import type { ReconciliationSupabaseClient, ReconciliationSourceState } from './actions';
import type { ReconciliationQueueEntry } from './queue';

/** Snapshot koji čuvamo u imported_statements.reconciliation_meta.pending. */
export interface ReconciliationPendingSnapshot {
  readonly batchId: string;
  readonly asOfIso: string;
  readonly entries: ReadonlyArray<{
    readonly summary: ReconciliationSummaryEntry;
    readonly sourceName: string;
    readonly sourceIcon?: string | null;
  }>;
}

export interface ResumableStatement {
  readonly statementId: string;
  readonly batchId: string;
  readonly asOfIso: string;
  /** Queue entries za sve sourceove koji su još 'pending' (nisu odlučeni). */
  readonly entries: ReadonlyArray<ReconciliationQueueEntry>;
}

interface ImportedStatementMeta {
  readonly pending?: ReconciliationPendingSnapshot;
  readonly sources?: Record<string, ReconciliationSourceState>;
}

/**
 * Upiše pending snapshot u imported_statements.reconciliation_meta.pending
 * i postavi reconciliation_state='pending'. Poziva se iz ImportReview nakon
 * commita, prije enqueue u in-memory queue.
 */
export async function writePendingSnapshot(
  supabase: ReconciliationSupabaseClient,
  statementId: string,
  snapshot: ReconciliationPendingSnapshot,
): Promise<void> {
  const sel = await supabase.from('imported_statements')
    .select('reconciliation_meta')
    .eq('id', statementId)
    .maybeSingle();
  const meta = (((sel as any)?.data)?.reconciliation_meta ?? {}) as ImportedStatementMeta;
  await supabase.from('imported_statements')
    .update({
      reconciliation_state: 'pending',
      reconciliation_meta: { ...meta, pending: snapshot },
    })
    .eq('id', statementId);
}

/**
 * Rekonstruira queue entries iz pohranjenog snapshota, izostavljajući
 * sourceove za koje već postoji odluka u meta.sources.
 */
export function reconstructResumableFromMeta(
  statementId: string,
  meta: ImportedStatementMeta | null | undefined,
): ResumableStatement | null {
  const snap = meta?.pending;
  if (!snap || !Array.isArray(snap.entries) || snap.entries.length === 0) return null;
  const decided = meta?.sources ?? {};
  const remaining = snap.entries.filter(e => {
    const st = decided[e.summary.sourceId];
    return st !== 'aligned' && st !== 'user_override';
  });
  if (remaining.length === 0) return null;
  const entries: ReconciliationQueueEntry[] = remaining.map(e => ({
    summary: e.summary,
    sourceName: e.sourceName,
    sourceIcon: e.sourceIcon ?? null,
    batchId: snap.batchId,
    asOfIso: snap.asOfIso,
    importedStatementId: statementId,
  }));
  return {
    statementId,
    batchId: snap.batchId,
    asOfIso: snap.asOfIso,
    entries,
  };
}

/**
 * Dohvat svih statementa u stanju 'pending' za trenutnog korisnika i
 * rekonstrukcija resumable entrija. RLS-om je filter po user_id implicitan.
 */
export async function fetchResumableReconciliations(
  supabase: ReconciliationSupabaseClient,
): Promise<ResumableStatement[]> {
  const res: any = await supabase.from('imported_statements')
    .select('id,reconciliation_meta')
    .eq('reconciliation_state', 'pending');
  if (res?.error) return [];
  const rows: Array<{ id: string; reconciliation_meta: ImportedStatementMeta | null }> =
    Array.isArray(res?.data) ? res.data : [];
  const out: ResumableStatement[] = [];
  for (const r of rows) {
    const rec = reconstructResumableFromMeta(r.id, r.reconciliation_meta);
    if (rec) out.push(rec);
  }
  return out;
}

/** Ukupan broj pending sourceova (za badge u banneru). */
export function countPendingSources(list: readonly ResumableStatement[]): number {
  return list.reduce((n, s) => n + s.entries.length, 0);
}
