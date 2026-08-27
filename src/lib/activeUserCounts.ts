/**
 * Pure counting logic for "real active users" in the Pulse dashboard.
 *
 * Source rows come from `public.user_login_logs`. Every user counts ONCE per
 * window, no matter how many logins they produced.
 */

export interface LoginLogRow {
  user_id: string | null;
  logged_in_at: string;
}

export interface ActiveUserCounts {
  active24h: number;
  active7d: number;
}

/** Distinct users with at least one login at or after `sinceIso`. */
export const countDistinctActiveUsers = (
  rows: readonly LoginLogRow[],
  sinceIso: string
): number => {
  const since = Date.parse(sinceIso);
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r?.user_id) continue;
    const at = Date.parse(r.logged_in_at);
    if (Number.isNaN(at) || at < since) continue;
    seen.add(r.user_id);
  }
  return seen.size;
};

/** Both Pulse windows computed from a single row set. */
export const computeActiveUserCounts = (
  rows: readonly LoginLogRow[],
  nowMs: number = Date.now()
): ActiveUserCounts => ({
  active24h: countDistinctActiveUsers(rows, new Date(nowMs - 24 * 60 * 60 * 1000).toISOString()),
  active7d: countDistinctActiveUsers(rows, new Date(nowMs - 7 * 24 * 60 * 60 * 1000).toISOString()),
});
