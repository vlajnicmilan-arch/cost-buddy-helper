/**
 * Pure TS port of the Postgres BEFORE INSERT/UPDATE trigger
 * `expenses_event_at_sync` introduced in Val 1 (M2).
 *
 * The actual trigger lives in the migration and runs in the database.
 * This port exists ONLY so the trigger's contract can be regression-tested
 * deterministically in vitest without spinning up a Postgres instance.
 *
 * If you change the SQL trigger, you MUST keep this file in sync.
 *
 * Rule summary (locked for Val 1):
 *  - INSERT: if writer omits event_at, derive it from `date`
 *    as noon Europe/Zagreb on that calendar day. Default confidence = 'C3'.
 *  - UPDATE: if writer explicitly changed event_at, honor writer.
 *  - UPDATE: else if `date` changed AND row is still 'C3', re-derive event_at.
 *  - UPDATE: if confidence is 'C1' or 'C2', never auto-overwrite event_at.
 */

export type TimeConfidence = "C1" | "C2" | "C3" | "C4";

export interface ExpenseRowShape {
  date: string; // ISO timestamptz
  event_at: string | null;
  time_confidence: TimeConfidence | null;
}

/**
 * Derive C3 synthetic event_at = noon Europe/Zagreb on the calendar day
 * of `dateIso`. Europe/Zagreb is UTC+1 (CET) or UTC+2 (CEST).
 *
 * We compute the Zagreb local calendar day from `dateIso`, then build a
 * timestamp at 12:00 local time and convert back to UTC ISO.
 */
export function deriveC3EventAt(dateIso: string): string {
  const d = new Date(dateIso);
  // Extract Y-M-D as seen in Europe/Zagreb.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zagreb",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const day = parts.find((p) => p.type === "day")!.value;

  // Build noon local time and figure out the matching UTC instant.
  // We probe two candidate offsets and pick the one whose Zagreb-local
  // rendering equals "<y>-<m>-<day> 12:00".
  const target = `${y}-${m}-${day} 12:00`;
  for (const offsetHours of [1, 2]) {
    const utcGuess = new Date(`${y}-${m}-${day}T12:00:00.000Z`);
    utcGuess.setUTCHours(12 - offsetHours);
    const rendered = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Zagreb",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(utcGuess);
    // rendered looks like "2026-06-28, 12:00"
    const normalized = rendered.replace(",", "").trim();
    if (normalized === target) return utcGuess.toISOString();
  }
  // Fallback: trust the +1 guess.
  const fallback = new Date(`${y}-${m}-${day}T11:00:00.000Z`);
  return fallback.toISOString();
}

export function applyInsertTrigger(
  newRow: Partial<ExpenseRowShape> & Pick<ExpenseRowShape, "date">,
): ExpenseRowShape {
  const out: ExpenseRowShape = {
    date: newRow.date,
    event_at: newRow.event_at ?? null,
    time_confidence: newRow.time_confidence ?? null,
  };
  if (out.time_confidence == null) out.time_confidence = "C3";
  if (out.event_at == null) {
    out.event_at = deriveC3EventAt(out.date);
  }
  return out;
}

export function applyUpdateTrigger(
  oldRow: ExpenseRowShape,
  patch: Partial<ExpenseRowShape>,
): ExpenseRowShape {
  const newRow: ExpenseRowShape = {
    date: patch.date ?? oldRow.date,
    event_at: patch.event_at !== undefined ? patch.event_at : oldRow.event_at,
    time_confidence:
      patch.time_confidence !== undefined
        ? patch.time_confidence
        : oldRow.time_confidence,
  };
  if (newRow.time_confidence == null) newRow.time_confidence = "C3";

  const writerChangedEventAt =
    patch.event_at !== undefined && patch.event_at !== oldRow.event_at;
  if (writerChangedEventAt) {
    // Honor writer.
    if (newRow.event_at == null) {
      newRow.event_at = oldRow.event_at ?? deriveC3EventAt(newRow.date);
    }
    return newRow;
  }

  const dateChanged = newRow.date !== oldRow.date;
  if (dateChanged && newRow.time_confidence === "C3") {
    newRow.event_at = deriveC3EventAt(newRow.date);
  }

  if (newRow.event_at == null) {
    newRow.event_at = oldRow.event_at ?? deriveC3EventAt(newRow.date);
  }
  return newRow;
}
