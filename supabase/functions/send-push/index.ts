// FCM HTTP v1 API implementation with OAuth2 (RS256 JWT)
// Requires FCM_SERVICE_ACCOUNT secret containing the full service account JSON
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FCM_SERVICE_ACCOUNT = Deno.env.get("FCM_SERVICE_ACCOUNT");

// ---------- OAuth2 helpers (RS256 JWT -> access_token) ----------
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(b64);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  return buf.buffer;
}

function base64UrlEncode(input: string | Uint8Array): string {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : input;
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(serviceAccount: any): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput)
  );

  const jwt = `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;

  const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const tokenData = await tokenResp.json();
  if (!tokenData.access_token) {
    throw new Error(`OAuth2 failed: ${JSON.stringify(tokenData)}`);
  }

  cachedToken = {
    value: tokenData.access_token,
    expiresAt: Date.now() + tokenData.expires_in * 1000,
  };
  return cachedToken.value;
}

// ---------- Main handler ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { user_id, title, body, data } = await req.json();

    if (!user_id || !title || !body) {
      return new Response(
        JSON.stringify({ error: "user_id, title, and body are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!FCM_SERVICE_ACCOUNT) {
      return new Response(
        JSON.stringify({ error: "FCM_SERVICE_ACCOUNT not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let serviceAccount: any;
    try {
      serviceAccount = JSON.parse(FCM_SERVICE_ACCOUNT);
    } catch {
      return new Response(
        JSON.stringify({ error: "FCM_SERVICE_ACCOUNT is not valid JSON" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const projectId = serviceAccount.project_id;
    if (!projectId) {
      return new Response(
        JSON.stringify({ error: "Service account missing project_id" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: tokens, error } = await supabase
      .from("push_tokens")
      .select("token")
      .eq("user_id", user_id);

    if (error || !tokens?.length) {
      return new Response(
        JSON.stringify({ sent: 0, reason: "no tokens found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const accessToken = await getAccessToken(serviceAccount);
    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

    let sent = 0;
    const errors: string[] = [];

    for (const { token } of tokens) {
      try {
        const message = {
          message: {
            token,
            notification: { title, body },
            data: data
              ? Object.fromEntries(
                  Object.entries(data).map(([k, v]) => [k, String(v)])
                )
              : {},
            android: {
              priority: "HIGH",
              notification: { sound: "default" },
            },
          },
        };

        const resp = await fetch(fcmUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(message),
        });

        if (resp.ok) {
          sent++;
        } else {
          const errBody = await resp.json().catch(() => ({}));
          const errCode =
            errBody?.error?.details?.[0]?.errorCode ||
            errBody?.error?.status ||
            "UNKNOWN";
          errors.push(errCode);

          // Remove invalid/unregistered tokens
          if (
            errCode === "UNREGISTERED" ||
            errCode === "INVALID_ARGUMENT" ||
            resp.status === 404
          ) {
            await supabase.from("push_tokens").delete().eq("token", token);
          }
        }
      } catch (e) {
        console.error("[send-push] FCM error:", e);
        errors.push(String(e));
      }
    }

    return new Response(
      JSON.stringify({ sent, total: tokens.length, errors }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[send-push] Error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
