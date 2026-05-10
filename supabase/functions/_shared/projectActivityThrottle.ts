// Throttle helper for project-activity push notifications.
// Ensures at most ONE push per (user_id, project_id, activity_bucket) within a 5 minute window.
// In-app notifications are ALWAYS inserted by the caller; this helper only governs push delivery.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!_supabase) _supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  return _supabase;
}

export type ActivityBucket = "work_log" | "milestone" | "transaction" | "note";

const WINDOW_MINUTES = 5;

export interface ThrottleDecision {
  /** Whether the caller should send the push right now. */
  shouldSendPush: boolean;
  /** Number of additional events suppressed inside the current window (>=0). */
  pendingCount: number;
}

/**
 * Atomically decide if a push should be sent for the given (user, project, bucket).
 * - First call within window → shouldSendPush = true, pendingCount = 0
 * - Subsequent calls within window → shouldSendPush = false, pendingCount increments
 * - When user is notified (shouldSendPush=true) the row's pendingCount is reset to 0
 *   and last_sent_at is bumped to now().
 */
export async function decidePushThrottle(
  userId: string,
  projectId: string,
  bucket: ActivityBucket,
): Promise<ThrottleDecision> {
  const supabase = getSupabase();

  // Read current row
  const { data: existing, error: readErr } = await supabase
    .from("project_activity_push_throttle")
    .select("last_sent_at, pending_count")
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .eq("activity_bucket", bucket)
    .maybeSingle();

  if (readErr) {
    console.error("[throttle] read error", readErr);
    // Fail-open: send the push so user is not silently dropped.
    return { shouldSendPush: true, pendingCount: 0 };
  }

  const now = Date.now();
  const lastSent = existing?.last_sent_at ? new Date(existing.last_sent_at).getTime() : 0;
  const withinWindow = lastSent > 0 && now - lastSent < WINDOW_MINUTES * 60 * 1000;

  if (withinWindow) {
    // Suppress push, increment pending counter
    const newCount = (existing?.pending_count ?? 0) + 1;
    const { error: upErr } = await supabase
      .from("project_activity_push_throttle")
      .update({ pending_count: newCount, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("project_id", projectId)
      .eq("activity_bucket", bucket);
    if (upErr) console.error("[throttle] suppress update error", upErr);
    return { shouldSendPush: false, pendingCount: newCount };
  }

  // Outside window → send and reset. Capture pending count from previous suppressed events.
  const carriedOver = existing?.pending_count ?? 0;

  const { error: upsertErr } = await supabase
    .from("project_activity_push_throttle")
    .upsert(
      {
        user_id: userId,
        project_id: projectId,
        activity_bucket: bucket,
        last_sent_at: new Date().toISOString(),
        pending_count: 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,project_id,activity_bucket" },
    );
  if (upsertErr) console.error("[throttle] upsert error", upsertErr);

  return { shouldSendPush: true, pendingCount: carriedOver };
}
