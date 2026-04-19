/**
 * notifyHelper — pouzdano slanje "fire-and-forget" poziva na notify-* edge funkcije.
 *
 * Razlozi zašto NE koristimo `supabase.functions.invoke()`:
 *  - U Capacitor Android WebView nekad tiho fail-a (poziv ne stigne do Supabasea, nema log)
 *  - Promise se može prekinuti ako se komponenta unmounta prije završetka
 *  - Nemamo kontrolu nad headerima i timeoutom
 *
 * Ova helper funkcija:
 *  - Koristi direktan `fetch()` s `keepalive: true` (zahtjev preživi navigaciju/unmount)
 *  - Eksplicitno postavlja `Authorization` i `apikey` header
 *  - Uvijek upiše trag u `app_diagnostics_logs` (uspjeh ili greška) — tako da
 *    imamo dokaz da je frontend pokušao pozvati funkciju, čak i kad sve ostalo zakaže.
 */

import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

interface InvokeOptions {
  functionName: string;
  body: Record<string, unknown>;
}

let cachedSessionId: string | null = null;
function getSessionId(): string {
  if (!cachedSessionId) {
    cachedSessionId =
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `sess-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  }
  return cachedSessionId;
}

async function writeFrontendDiagnostic(
  event: string,
  details: Record<string, unknown>,
  userId: string | null,
): Promise<void> {
  try {
    await supabase.from("app_diagnostics_logs").insert({
      session_id: getSessionId(),
      event,
      route: typeof window !== "undefined" ? window.location.pathname : null,
      user_id: userId,
      app_version: (import.meta as any).env?.VITE_APP_VERSION ?? "unknown",
      device_info: {
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
        platform: typeof navigator !== "undefined" ? navigator.platform : null,
      },
      details,
    });
  } catch {
    // Best-effort. Ne smije ništa srušiti.
  }
}

/**
 * Pozovi notify-* funkciju pouzdano (fire-and-forget).
 * Vraća Promise koji se NIKAD ne odbija — sve greške su tiho zapisane u dijagnostiku.
 */
export async function invokeNotifyFunction(opts: InvokeOptions): Promise<void> {
  const { functionName, body } = opts;
  const startedAt = Date.now();

  // 1) Dohvati svjež access token za korisnika (potreban verify_jwt funkcijama).
  let accessToken: string | null = null;
  let userId: string | null = null;
  try {
    const { data } = await supabase.auth.getSession();
    accessToken = data.session?.access_token ?? null;
    userId = data.session?.user?.id ?? null;
  } catch (e) {
    await writeFrontendDiagnostic(
      `notify_invoke_no_session`,
      { functionName, error: e instanceof Error ? e.message : String(e), body },
      null,
    );
    return;
  }

  if (!accessToken) {
    await writeFrontendDiagnostic(
      `notify_invoke_no_token`,
      { functionName, body },
      userId,
    );
    return;
  }

  // 2) Zapisuj POKUŠAJ poziva PRIJE fetch-a — tako imamo trag i ako fetch tiho fail-a.
  await writeFrontendDiagnostic(
    `notify_invoke_started`,
    { functionName, body },
    userId,
  );

  // 3) Direktan fetch s keepalive — preživi unmount komponente.
  try {
    const url = `${SUPABASE_URL}/functions/v1/${functionName}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(body),
      keepalive: true,
    });

    let responseText: string | null = null;
    try {
      responseText = await resp.text();
    } catch {
      responseText = null;
    }

    await writeFrontendDiagnostic(
      resp.ok ? `notify_invoke_ok` : `notify_invoke_http_error`,
      {
        functionName,
        status: resp.status,
        duration_ms: Date.now() - startedAt,
        response_preview: responseText?.slice(0, 500) ?? null,
      },
      userId,
    );
  } catch (e) {
    await writeFrontendDiagnostic(
      `notify_invoke_network_error`,
      {
        functionName,
        error: e instanceof Error ? e.message : String(e),
        duration_ms: Date.now() - startedAt,
        body,
      },
      userId,
    );
  }
}
