/**
 * Pure helpers for "Poništi ovaj uvoz" (undo import batch).
 * All UI-independent logic lives here so it can be unit-tested without React.
 *
 * Contract mirrors DB RPC public.undo_import_batch(uuid) returning:
 *   { deleted:int, unmerged:int, transfers:int, already_undone:bool,
 *     had_bank_anchor:bool, freed_fingerprint:bool, source_ids?:uuid[] }
 *
 * Rule A (Iron rule): confirmed (merged) rows are UNMERGED, never deleted.
 *   User's edits (merchant, category, description, amount) MUST survive undo.
 */

export interface UndoBatchRow {
  id: string;
  type: "income" | "expense" | "transfer";
  amount: number;
  bank_match_status?: string | null;
  created_at?: string | Date | null;
  date: Date;
}

export interface UndoBatchBreakdown {
  /** bank_only rows that are NOT transfers (regular expense/income deletions). */
  newCount: number;
  /** confirmed rows — will be unmerged (user data preserved). */
  mergedCount: number;
  /** type='transfer' rows in the batch (each row IS the pair; both sides on one row). */
  transferCount: number;
  /** Total rows in the batch (newCount + mergedCount + transferCount). */
  totalCount: number;
  /** Sum of absolute amounts across the whole batch (informational). */
  totalGross: number;
  /** Age in whole days between earliest created_at (fallback: earliest date) and referenceDate. */
  ageDays: number;
  /** True when ageDays > 7. */
  isOld: boolean;
}

export function computeBreakdown(
  rows: UndoBatchRow[],
  referenceDate: Date = new Date(),
): UndoBatchBreakdown {
  let newCount = 0;
  let mergedCount = 0;
  let transferCount = 0;
  let totalGross = 0;
  let earliest: Date | null = null;

  for (const r of rows) {
    totalGross += Math.abs(r.amount);
    if (r.bank_match_status === "confirmed") {
      mergedCount += 1;
    } else if (r.type === "transfer") {
      transferCount += 1;
    } else {
      newCount += 1;
    }
    const created = r.created_at ? new Date(r.created_at) : r.date;
    if (!earliest || created < earliest) earliest = created;
  }

  const anchorDate = earliest ?? referenceDate;
  const ageMs = Math.max(0, referenceDate.getTime() - anchorDate.getTime());
  const ageDays = Math.floor(ageMs / 86_400_000);

  return {
    newCount,
    mergedCount,
    transferCount,
    totalCount: rows.length,
    totalGross,
    ageDays,
    isOld: ageDays > 7,
  };
}

export interface UndoRpcResult {
  deleted?: number | null;
  unmerged?: number | null;
  transfers?: number | null;
  already_undone?: boolean | null;
  had_bank_anchor?: boolean | null;
  freed_fingerprint?: boolean | null;
  source_ids?: string[] | null;
}

export type UndoToastKind = "already_undone" | "success" | "success_with_anchor";

export interface UndoToastPayload {
  kind: UndoToastKind;
  deleted: number;
  unmerged: number;
  transfers: number;
  hadBankAnchor: boolean;
  sourceIds: string[];
}

/**
 * Normalises the RPC response into a small shape for the UI toast/banner layer.
 * Handles nulls/missing fields defensively — server contract is authoritative
 * but we never crash on shape drift.
 */
export function mapUndoResult(res: UndoRpcResult | null | undefined): UndoToastPayload {
  const deleted = Number(res?.deleted ?? 0) || 0;
  const unmerged = Number(res?.unmerged ?? 0) || 0;
  const transfers = Number(res?.transfers ?? 0) || 0;
  const hadBankAnchor = Boolean(res?.had_bank_anchor);
  const alreadyUndone = Boolean(res?.already_undone);
  const sourceIds = Array.isArray(res?.source_ids) ? res!.source_ids! : [];

  let kind: UndoToastKind;
  if (alreadyUndone) kind = "already_undone";
  else if (hadBankAnchor) kind = "success_with_anchor";
  else kind = "success";

  return { kind, deleted, unmerged, transfers, hadBankAnchor, sourceIds };
}
