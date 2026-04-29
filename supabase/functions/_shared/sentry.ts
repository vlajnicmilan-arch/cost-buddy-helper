/**
 * Lightweight Sentry client for Supabase Edge Functions (Deno).
 *
 * Sends events directly to Sentry's Store API via HTTP — no SDK, no npm/esm
 * dependencies, no risk of breaking deno.lock.
 *
 * Usage:
 *   import { captureEdgeError } from "../_shared/sentry.ts";
 *
 *   try {
 *     // ... function logic
 *   } catch (error) {
 *     captureEdgeError(error, {
 *       functionName: "parse-receipt",
 *       userId,
 *       context: { method: req.method },
 *     });
 *     return new Response(...); // existing error response untouched
 *   }
 *
 * IMPORTANT: This is fire-and-forget. Sentry MUST NEVER block or crash the
 * edge function. Every public function swallows its own errors.
 */

const SENTRY_DSN =
  "https://e71c65a2c4b6da7f654257df9b5fa8f0@o4511302417973248.ingest.de.sentry.io/4511302422167632";

// Parse DSN once.
// Format: https://<publicKey>@<host>/<projectId>
const DSN_MATCH = SENTRY_DSN.match(/^https:\/\/([^@]+)@([^/]+)\/(\d+)$/);
const PUBLIC_KEY = DSN_MATCH?.[1] ?? "";
const HOST = DSN_MATCH?.[2] ?? "";
const PROJECT_ID = DSN_MATCH?.[3] ?? "";
const STORE_ENDPOINT = PUBLIC_KEY
  ? `https://${HOST}/api/${PROJECT_ID}/store/`
  : "";

/** Errors we explicitly don't want in Sentry — expected client/auth issues. */
const NOISE_PATTERNS: string[] = [
  "User not authenticated",
  "not authenticated",
  "Authorization header",
  "Invalid JWT",
  "JWT expired",
  "Price ID is required",
  "email not available",
];

const isNoise = (msg: string | undefined): boolean => {
  if (!msg) return false;
  if (msg.startsWith("Validation:")) return true;
  return NOISE_PATTERNS.some((p) => msg.includes(p));
};

const uuidNoDashes = (): string => {
  // crypto.randomUUID is available in Deno
  return crypto.randomUUID().replace(/-/g, "");
};

const buildStackFrames = (stack: string | undefined) => {
  if (!stack) return undefined;
  const lines = stack.split("\n").slice(1, 21); // cap at 20 frames
  const frames = lines
    .map((raw) => {
      // Match: "    at fnName (file:line:col)" or "    at file:line:col"
      const m =
        raw.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/) ||
        raw.match(/at\s+(.+?):(\d+):(\d+)/);
      if (!m) return null;
      if (m.length === 5) {
        return {
          function: m[1],
          filename: m[2],
          lineno: Number(m[3]),
          colno: Number(m[4]),
          in_app: !m[2].includes("deno.land") && !m[2].includes("esm.sh"),
        };
      }
      return {
        filename: m[1],
        lineno: Number(m[2]),
        colno: Number(m[3]),
        in_app: !m[1].includes("deno.land") && !m[1].includes("esm.sh"),
      };
    })
    .filter(Boolean);
  // Sentry expects frames in reverse order (oldest first)
  return frames.reverse();
};

export interface CaptureContext {
  functionName: string;
  userId?: string;
  context?: Record<string, unknown>;
}

export const captureEdgeError = (
  error: unknown,
  ctx: CaptureContext,
): void => {
  try {
    if (!STORE_ENDPOINT) return;

    const err = error as Error;
    const message =
      (err && typeof err.message === "string" && err.message) ||
      (typeof error === "string" ? error : "Unknown edge error");

    if (isNoise(message)) return;

    const event = {
      event_id: uuidNoDashes(),
      timestamp: new Date().toISOString(),
      platform: "javascript",
      level: "error",
      logger: "edge",
      server_name: ctx.functionName,
      release: "vmbalance-edge",
      environment: "edge",
      tags: {
        function_name: ctx.functionName,
        runtime: "deno",
      },
      user: ctx.userId ? { id: ctx.userId } : undefined,
      extra: ctx.context ?? {},
      exception: {
        values: [
          {
            type: err?.name || "Error",
            value: message,
            stacktrace: err?.stack
              ? { frames: buildStackFrames(err.stack) }
              : undefined,
          },
        ],
      },
    };

    const auth =
      `Sentry sentry_version=7,sentry_client=vmbalance-edge/1.0,` +
      `sentry_key=${PUBLIC_KEY}`;

    // Fire-and-forget. Never await, never throw.
    fetch(STORE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sentry-Auth": auth,
      },
      body: JSON.stringify(event),
    })
      .then((r) => {
        // Drain the body to avoid resource leaks in Deno
        r.text().catch(() => {});
      })
      .catch(() => {
        /* ignore */
      });
  } catch {
    /* never break the caller */
  }
};
