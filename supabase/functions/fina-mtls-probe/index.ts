// TEMPORARY DIAGNOSTIC FUNCTION — mTLS capability probe for Supabase Edge Runtime.
// No tables, no secrets, no state. Delete after the FINA safe decision is made.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// Throwaway self-signed test material. NOT a secret — generated only for this probe.
const TEST_CERT = `-----BEGIN CERTIFICATE-----
MIIDHzCCAgegAwIBAgIUZi6tz9UO839U809k67zHGxUbaCcwDQYJKoZIhvcNAQEL
BQAwHzEdMBsGA1UEAwwUZmluYS1tdGxzLXByb2JlLXRlc3QwHhcNMjYwODA5MTI1
MzEyWhcNMzYwODA2MTI1MzEyWjAfMR0wGwYDVQQDDBRmaW5hLW10bHMtcHJvYmUt
dGVzdDCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBALXUQT+lkapsk0xS
Gbp6yvrO10ci+GGxini7ejADHftZrxa5tu9JR5iHHaReJLePB8GIaolvH3qfcluM
UYfrhrA0OfaiYuXwojhF4NlKGwWGepIgFmHODlH4WMs6ga9cybM4OsBlao2n4+lC
5C6MrEB9cJpxbqmAmEifoXmoQitfFO5qerSzPxz/YVHRP4WkqmeqmIyoHdhgQGKN
AFtNih0hwU02CeHQuOR14WQebPshT8VL2yD5ojIua0b0lIx95JKaKmZEziaaEb/v
P61vt//ZxoM+Z5zDVQd5syZvCbmeXxrPSwSEiFf1TBs7822T1s7g7TlQN70oXlSI
QogtgVkCAwEAAaNTMFEwHQYDVR0OBBYEFPCiJy/4GrULjak+v2j//gSvGi7wMB8G
A1UdIwQYMBaAFPCiJy/4GrULjak+v2j//gSvGi7wMA8GA1UdEwEB/wQFMAMBAf8w
DQYJKoZIhvcNAQELBQADggEBACO+kSDAJFbC2jZ4ozPyWDec0H9u0lRPI6ooUTqC
0GR9u4fNWax4f82jT4QUhJ/T/HC5HQffUvbWEC5uPYjORPGgPbQa6pjxTi2onWSa
FTy/vH6AQCia97lq/lxNBgZ7Gdo4pieJ1H0jIhMAEwlT4E4v7CnQ/F5Y8dA3tzZB
Kwxn17+Q9SfgZdVrAnDjAD4Ziw+yvDHvUz3Ym+fj2XUiSAMTBiMDD0sFrWJiDQ8R
fa8pC+BOaE7iwb5cMrDOprz6TvfKTkGLVUFdbrZdZfiEOrb/7rtSwl8NwyIFcnWK
p/rzGZYAOsuyzw8FJ9L8efh4riLi6ZBtObxaX0TcOzr2Bxs=
-----END CERTIFICATE-----
`;

const TEST_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC11EE/pZGqbJNM
Uhm6esr6ztdHIvhhsYp4u3owAx37Wa8WubbvSUeYhx2kXiS3jwfBiGqJbx96n3Jb
jFGH64awNDn2omLl8KI4ReDZShsFhnqSIBZhzg5R+FjLOoGvXMmzODrAZWqNp+Pp
QuQujKxAfXCacW6pgJhIn6F5qEIrXxTuanq0sz8c/2FR0T+FpKpnqpiMqB3YYEBi
jQBbTYodIcFNNgnh0LjkdeFkHmz7IU/FS9sg+aIyLmtG9JSMfeSSmipmRM4mmhG/
7z+tb7f/2caDPmecw1UHebMmbwm5nl8az0sEhIhX9UwbO/Ntk9bO4O05UDe9KF5U
iEKILYFZAgMBAAECggEAFrdV8AFLv6SJKfyrU3N2Equ+9DeTm6PqQm9com0vRJjF
obORvdcUO2NtAf0Tff2/6K817SXdg0yyhSq0gGQ9y1t4/t22eJbts1VSlB74nYH5
o/IfjbhILHg4AqrUax/O4KW2nFUHQPuPwxN87a5cMkHhrJ/dhQ5oaBFOY4QwgRmt
OzhleA9uqM1gCGefenX5E8OvACwLJkhbLADrVlTClnuttE93V+O0T7TKy08Qudeo
b3jUHeuqU578gJzKD+v5O7PTIlh7Osn1nVrOVmukDRDq2Bme7bkXZmBIkbldNqQm
nBTTQ7QWTBbRRynAMD6nzy5eFy6cpZfBHkDfl9v0kQKBgQD7O2B1f7rQkRK/u+CM
qGiLG/c5bGkTL3AVupRVg+F8T0G/CS5H5/1OLH8nIiocHyltAg2s037HoU0EINOt
PIXJbK80zaEnMWe116VrEQEcfifBC7UkM4C86FIrfjg8X16Lciq5+Bg7Ra6LrQG9
yiqn096sFdBKEYhTFgKE8QqH0QKBgQC5R65SJ9ZtI9sggw3eyZHStVS6ENWUqzJu
FE/ABVCMsUb317GU9tOgI/uq7gz3840J7o79o9Vm98j30h4Vh5ls9rIKHxUb3gSt
buvfOhJVHmqzby5mwledAxU5l3sMLsv4z91zDxfahTSMATcTZcQA9wZLhIWSz5C/
dxmLBlzLCQKBgQDbBvkhdyo3i0L9RZ6PAoOiQ89VkN5Ki6D8UJ3hsAh1h+OZ2Tcw
GWENNl3kkDSGL+S91Hx3oCt3f3jVkIj7DzjUUpytPFizAq+YKVld7oU5ggLGmp5h
4UTrbN+2a2Q7vil/CRmW6GS3yBhUTZCnFgn6JwyKmrns2Twws4+et0anAQKBgQCT
BsTYQPCxbvCmXhkVn9Lt6CMx+8Xg0fGU1N1sPUtsOgldB3bOBQhuXd+KBpmX8VcM
eJhTwjzIFv0NW1mwMAiaJTGnQn8XvBjuH8VhQM3nadm2RhYGSVYJLLcdGo30XvZR
nXHXqjR9nZLTPuubovfk5CHEr4bnt3rf1P0aC5R7MQKBgGIxc2S585M+B0gkWmj8
WZNBgPawJxo1adJlCJtXeKXpXnN9L3EOoS8myocSTg4pMCdyKJ22sxb53XGooBUe
NJpMa3RvsDlPFhsecHGEnqBZeUbokaS9P8xmoApiZYEbLYBRJPf0qUvoLUD7Kp/R
qfwAYkANP7q1XoaxcW1jjWF8
-----END PRIVATE KEY-----
`;

function errInfo(e: unknown) {
  if (e instanceof Error) return { name: e.name, message: e.message };
  return { name: "unknown", message: String(e) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const result: Record<string, unknown> = {
    deno_version: (globalThis as any).Deno?.version ?? null,
    api_exists: false,
    client_created: false,
    fetch_ok: false,
    mtls_handshake: "not_attempted",
    steps: {} as Record<string, unknown>,
  };
  const steps = result.steps as Record<string, unknown>;

  // GATE A — does Deno.createHttpClient exist and accept cert/key?
  const createHttpClient = (Deno as any).createHttpClient;
  result.api_exists = typeof createHttpClient === "function";
  steps.gate_a = result.api_exists
    ? { status: "api_present" }
    : { status: "api_missing", note: "Deno.createHttpClient is not defined in this runtime (unstable API not enabled)." };

  let client: unknown = null;
  if (result.api_exists) {
    try {
      client = createHttpClient({ cert: TEST_CERT, key: TEST_KEY });
      result.client_created = true;
      steps.gate_a = { status: "client_created_with_cert_key" };
    } catch (e) {
      steps.gate_a = { status: "cert_key_rejected", error: errInfo(e) };
      // Retry without cert/key to distinguish "API broken" vs "cert options rejected".
      try {
        client = createHttpClient({});
        steps.gate_a_fallback = { status: "client_created_without_cert_key" };
      } catch (e2) {
        steps.gate_a_fallback = { status: "client_creation_failed", error: errInfo(e2) };
      }
    }
  }

  // GATE B — can the client be used in fetch at all?
  if (client) {
    try {
      const res = await fetch("https://example.com", { client } as RequestInit);
      await res.text();
      result.fetch_ok = res.ok;
      steps.gate_b = { status: "fetch_completed", http_status: res.status };
    } catch (e) {
      steps.gate_b = { status: "fetch_failed", error: errInfo(e) };
    }
  } else {
    steps.gate_b = { status: "skipped_no_client" };
  }

  // GATE C — real mTLS handshake attempt against a public mTLS endpoint.
  if (result.client_created) {
    try {
      const res = await fetch("https://client.badssl.com/", { client } as RequestInit);
      const body = await res.text();
      // 200 => server accepted (unlikely with our self-signed); 400/403 => handshake happened,
      // server rejected the client certificate at the application layer.
      result.mtls_handshake = "performed";
      steps.gate_c = {
        status: "handshake_performed",
        http_status: res.status,
        body_snippet: body.slice(0, 200),
        note: "A non-TLS-level HTTP response proves the client certificate was offered during the TLS handshake.",
      };
    } catch (e) {
      const info = errInfo(e);
      const msg = info.message.toLowerCase();
      const tlsLevel = msg.includes("certificate") || msg.includes("handshake") || msg.includes("tls") || msg.includes("alert");
      result.mtls_handshake = tlsLevel ? "performed_rejected_at_tls" : "impossible";
      steps.gate_c = {
        status: tlsLevel ? "tls_level_rejection" : "request_failed",
        error: info,
        note: tlsLevel
          ? "TLS-level alert means a handshake with a client certificate was attempted — mTLS path is reachable."
          : "Failure not clearly TLS related; treat as inconclusive/impossible.",
      };
    }
  } else {
    steps.gate_c = { status: "skipped_no_mtls_client" };
  }

  return new Response(JSON.stringify(result, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
});
