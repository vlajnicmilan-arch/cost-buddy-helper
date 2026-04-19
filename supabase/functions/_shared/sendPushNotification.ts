// Shared helper to dispatch a push notification via the `send-push` edge function.
// Push delivery is "best-effort" — failures must NEVER break in-app notification flows.
// Always wrap caller `await sendPushNotification(...)` in normal flow; this helper itself
// catches and logs any errors instead of throwing.

interface SendPushArgs {
  user_id: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export async function sendPushNotification(args: SendPushArgs): Promise<void> {
  if (!args.user_id || !args.title || !args.body) {
    console.warn("[sendPushNotification] Missing required fields, skipping");
    return;
  }

  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        user_id: args.user_id,
        title: args.title,
        body: args.body,
        data: args.data ?? {},
      }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      console.warn(
        `[sendPushNotification] send-push returned ${resp.status} for user ${args.user_id}: ${text}`
      );
      return;
    }

    // Drain body to avoid Deno resource leaks
    await resp.json().catch(() => null);
  } catch (err) {
    console.warn(
      `[sendPushNotification] Failed to dispatch push for user ${args.user_id}:`,
      err
    );
  }
}

// Helper for fanning out to multiple recipients
export async function sendPushNotificationToMany(
  user_ids: string[],
  payload: Omit<SendPushArgs, "user_id">
): Promise<void> {
  await Promise.all(
    user_ids.map((user_id) =>
      sendPushNotification({ user_id, ...payload })
    )
  );
}
