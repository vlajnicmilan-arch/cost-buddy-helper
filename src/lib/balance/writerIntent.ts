/**
 * Val 2 — Writer intent helper.
 *
 * Centralizes the rule for which precision-related fields a write path is
 * allowed to send to `expenses`. Without this gate, ad-hoc writers could
 * accidentally:
 *   - set `event_at` to a degraded (00:00:00) timestamp on what should be a
 *     precise row, or
 *   - clear/lower `time_confidence` on a precise row, or
 *   - silently mark a row as user-edited.
 *
 * Three intents are supported:
 *
 *   'default'             → ordinary write (manual add, project tx, recurring,
 *                           imports). Strip precision fields entirely; the
 *                           Val 1 trigger (`expenses_event_at_sync`) derives
 *                           `event_at` from `date` with C3 confidence.
 *
 *   'explicit_time_edit'  → user explicitly picked a time in the UI.
 *                           Pass `event_at` through, force
 *                           `user_edited_event_at = true`.
 *                           (No UI consumer in Val 2 — reserved for Val 3.)
 *
 *   'system_precise'      → the system itself observed the exact moment
 *                           (e.g. balance correction). Pass `event_at` and
 *                           `time_confidence` through, force
 *                           `user_edited_event_at = false`.
 */

export type WriterIntent = 'default' | 'explicit_time_edit' | 'system_precise';

/** Fields this helper is concerned with — others pass through untouched. */
type PrecisionFields = Partial<{
  event_at: string | null;
  time_confidence: 'C1' | 'C2' | 'C3' | 'C4' | null;
  user_edited_event_at: boolean;
}>;

export type ExpenseWritePayload = Record<string, unknown> & PrecisionFields;

/**
 * Normalize the precision-related fields of an expense payload according to
 * the writer's declared intent. Returns a NEW object — never mutates input.
 */
export function normalizeExpensePayload<T extends ExpenseWritePayload>(
  payload: T,
  intent: WriterIntent,
): T & PrecisionFields {
  // Strip the three precision fields from a copy; we'll re-attach per intent.
  const {
    event_at: _ea,
    time_confidence: _tc,
    user_edited_event_at: _ue,
    ...rest
  } = payload;

  switch (intent) {
    case 'default': {
      // No precision fields sent — Val 1 trigger derives event_at from `date`.
      return rest as T & PrecisionFields;
    }

    case 'explicit_time_edit': {
      // Pass event_at through (may be null — caller's responsibility).
      // Force user_edited_event_at=true so future merges respect this row.
      return {
        ...rest,
        event_at: payload.event_at ?? null,
        user_edited_event_at: true,
      } as T & PrecisionFields;
    }

    case 'system_precise': {
      // System observed a precise moment. Pass through event_at and
      // time_confidence verbatim. Never marks as user-edited.
      return {
        ...rest,
        event_at: payload.event_at ?? null,
        time_confidence: payload.time_confidence ?? null,
        user_edited_event_at: false,
      } as T & PrecisionFields;
    }
  }
}
