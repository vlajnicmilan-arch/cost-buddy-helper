/**
 * Val 4 — Deterministic scan tier decision.
 *
 * Single source of truth for whether a scan-produced expense is allowed to
 * write `time_confidence='C1'` with a precise `event_at`, or must fall back
 * to the default C3 path (where the Val 1 trigger derives event_at from
 * `date`).
 *
 * The model is NEVER allowed to decide the tier. The model only returns
 * structured signals. This pure function turns those signals into a verdict.
 *
 * Rules (locked):
 *   1. Any manual edit of date/time before save → C3.
 *   2. No fiscal marker (JIR/ZKI) → C3.
 *   3. No explicit "vrijeme izdavanja" label next to the time → C3.
 *   4. `issued_at_iso` not a valid ISO datetime with time component → C3.
 *   5. `issued_at_raw` doesn't contain the HH:MM from `issued_at_iso` → C3
 *      (guards against model hallucinating a time it didn't read).
 *   6. `issued_at_iso` outside the sanity range (>1h in the future, or
 *      >7 days in the past from `now`) → C3.
 *   7. Otherwise → C1, `eventAt = issued_at_iso`.
 *
 * No partial credit. No "almost C1". Any uncertainty → C3.
 */

export type ScanSignals = {
  issued_at_iso: string | null;
  issued_at_raw: string | null;
  issued_at_label_present: boolean;
  fiscal_marker_present: boolean;
};

export type DecideScanTierInput = ScanSignals & {
  userEditedDateOrTime: boolean;
  now: Date;
};

export type ScanTierDecision = {
  tier: 'C1' | 'C3';
  eventAt: string | null;
  reason:
    | 'c1_ok'
    | 'user_edited'
    | 'no_fiscal_marker'
    | 'no_time_label'
    | 'iso_invalid'
    | 'raw_iso_mismatch'
    | 'out_of_range';
};

// Strict ISO 8601 datetime with at least HH:MM (date-only forms rejected).
// Examples accepted: "2025-01-20T15:30:00+01:00", "2025-01-20T15:30:00Z".
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/;

const ONE_HOUR_MS = 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function fallback(reason: ScanTierDecision['reason']): ScanTierDecision {
  return { tier: 'C3', eventAt: null, reason };
}

export function decideScanTier(input: DecideScanTierInput): ScanTierDecision {
  if (input.userEditedDateOrTime) return fallback('user_edited');
  if (input.fiscal_marker_present !== true) return fallback('no_fiscal_marker');
  if (input.issued_at_label_present !== true) return fallback('no_time_label');

  const iso = input.issued_at_iso;
  if (typeof iso !== 'string' || !ISO_DATETIME_RE.test(iso)) {
    return fallback('iso_invalid');
  }

  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return fallback('iso_invalid');

  // raw must contain the HH and MM from iso (substring is sufficient — we
  // only need a weak anti-hallucination check, not exact format equality).
  const raw = input.issued_at_raw;
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return fallback('raw_iso_mismatch');
  }
  const hh = iso.slice(11, 13);
  const mm = iso.slice(14, 16);
  // Look for "HH:MM" or "HH.MM" or "HHhMM" in raw.
  const needle = new RegExp(`${hh}[:.h ]${mm}`);
  if (!needle.test(raw)) return fallback('raw_iso_mismatch');

  const nowMs = input.now.getTime();
  const isoMs = parsed.getTime();
  if (isoMs > nowMs + ONE_HOUR_MS) return fallback('out_of_range');
  if (isoMs < nowMs - SEVEN_DAYS_MS) return fallback('out_of_range');

  return { tier: 'C1', eventAt: iso, reason: 'c1_ok' };
}
