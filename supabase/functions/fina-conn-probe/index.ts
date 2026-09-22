// TEMPORARY DIAGNOSTIC FUNCTION — connectivity probe for the FINA B2B service.
// Splits the path to the service into steps (DNS, TCP, TLS, HTTPS without and
// with a client certificate) for production and demo, so it is visible where
// production stops answering. Writes nothing except one summary row in
// app_diagnostics_logs. No other FINA module is modified by this function.
//
// Secrets read (never logged, never returned):
//   FINA_P12_B64, FINA_P12_PASSWORD, and optionally FINA_P12_B64_ALT /
//   FINA_P12_PASSWORD_ALT. Caller must send x-probe-key = PROBE_SERVICE_KEY.
import { createClient } from "npm:@supabase/supabase-js@2";
import { FINA_CA_PEM, FINA_DEMO_CA_PEM } from "../_shared/fina/finaCa.ts";
import {
  buildFinaClientChain,
  checkProbeKey,
  fetchWithDeadline,
  loadP12,
  safeMessage,
  snippet,
  type KeyMaterial,
} from "../_shared/fina/soap.ts";
import { parseCertificate, sha256Fingerprint } from "../_shared/fina/certInfo.ts";

const HOSTS = [
  { name: "production", host: "webservisi.fina.hr" },
  { name: "demo", host: "prezdigitalneusluge.fina.hr" },
] as const;

const WSDL_PATH = "/B2BFinaInvoiceWebService/services/B2BFinaInvoiceWebService?wsdl";
const STEP_TIMEOUT_MS = 25_000;

type Step = Record<string, unknown>;

/** Run a step with a wall-clock deadline and always return a plain result. */
async function timed<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs = STEP_TIMEOUT_MS,
): Promise<Step> {
  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const value = await Promise.race([
      fn(controller.signal),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`no response after ${Math.round(timeoutMs / 1000)}s`)),
          timeoutMs,
        )
      ),
    ]);
    return { ok: true, duration_ms: Date.now() - t0, ...(value as Record<string, unknown>) };
  } catch (e) {
    return { ok: false, duration_ms: Date.now() - t0, error: safeMessage(e) };
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

function hexFingerprint(hex: string): string {
  return (hex.match(/../g) ?? []).join(":").toLowerCase();
}

async function sha1Fingerprint(der: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-1",
    new Uint8Array(der.buffer as ArrayBuffer, der.byteOffset, der.byteLength),
  );
  let hex = "";
  for (const b of new Uint8Array(digest)) hex += b.toString(16).padStart(2, "0");
  return hexFingerprint(hex);
}

/** Public identity of a loaded certificate — never key or password material. */
async function describeKey(key: KeyMaterial): Promise<Step> {
  const chain = buildFinaClientChain(key);
  const info = parseCertificate(key.certPem);
  return {
    subject: key.subject,
    issuer: key.issuer,
    serial: key.serial,
    sha1: await sha1Fingerprint(info.der),
    sha256: (await sha256Fingerprint(info.der)).toLowerCase(),
    chain_cns: chain.cns,
    p12_cert_count: key.certCount,
  };
}

async function httpGet(host: string, client: unknown | null): Promise<Step> {
  const init = (client ? { client } : {}) as RequestInit;
  const { res, text } = await fetchWithDeadline(
    `https://${host}${WSDL_PATH}`,
    init,
    { connect: "tls", read: "http" },
    STEP_TIMEOUT_MS,
  );
  return {
    http_status: res.status,
    server: res.headers.get("server"),
    body_head: snippet(text, 300),
  };
}

async function runHost(
  host: string,
  key: KeyMaterial | null,
  altKey: KeyMaterial | null,
  altSkipped: string | null,
): Promise<Record<string, Step>> {
  const steps: Record<string, Step> = {};

  steps.dns = await timed(async () => ({
    addresses: await Deno.resolveDns(host, "A"),
  }));

  steps.tcp = await timed(async () => {
    const conn = await Deno.connect({ hostname: host, port: 443 });
    conn.close();
    return { connected: true };
  });

  steps.tls_no_client_cert = await timed(async () => {
    const conn = await Deno.connectTls({
      hostname: host,
      port: 443,
      caCerts: [FINA_CA_PEM, FINA_DEMO_CA_PEM],
    });
    try {
      const info = await conn.handshake();
      return { handshake: true, alpn: info?.alpnProtocol ?? null };
    } finally {
      conn.close();
    }
  });

  steps.https_no_client_cert = await timed(async () => await httpGet(host, null));

  steps.https_with_client_cert = key
    ? await timed(async () =>
      await httpGet(
        host,
        (Deno as any).createHttpClient({
          caCerts: [FINA_CA_PEM, FINA_DEMO_CA_PEM],
          cert: buildFinaClientChain(key).pem,
          key: key.keyPem,
        }),
      )
    )
    : { ok: false, skipped: true, reason: "FINA_P12_B64 / FINA_P12_PASSWORD missing" };

  steps.https_with_alt_client_cert = altKey
    ? await timed(async () =>
      await httpGet(
        host,
        (Deno as any).createHttpClient({
          caCerts: [FINA_CA_PEM, FINA_DEMO_CA_PEM],
          cert: buildFinaClientChain(altKey).pem,
          key: altKey.keyPem,
        }),
      )
    )
    : { ok: false, skipped: true, reason: altSkipped ?? "FINA_P12_B64_ALT not set" };

  return steps;
}

Deno.serve(async (req) => {
  const gate = checkProbeKey(req);
  if (gate) return gate;

  const report: Record<string, unknown> = { hosts: {}, certificates: {} };
  const certificates = report.certificates as Record<string, unknown>;

  // Primary certificate.
  let key: KeyMaterial | null = null;
  const p12 = Deno.env.get("FINA_P12_B64");
  const pass = Deno.env.get("FINA_P12_PASSWORD");
  if (!p12 || !pass) {
    certificates.primary = { skipped: true, reason: "FINA_P12_B64 / FINA_P12_PASSWORD missing" };
  } else {
    try {
      key = await loadP12(p12.replace(/\s+/g, ""), pass);
      certificates.primary = await describeKey(key);
    } catch (e) {
      certificates.primary = { error: safeMessage(e) };
    }
  }

  // Optional alternate certificate — prepared so a second certificate can be
  // tried by adding a secret, without a code change.
  let altKey: KeyMaterial | null = null;
  let altSkipped: string | null = null;
  const altP12 = Deno.env.get("FINA_P12_B64_ALT");
  if (!altP12) {
    altSkipped = "FINA_P12_B64_ALT not set";
    certificates.alternate = { skipped: true, reason: altSkipped };
  } else {
    const altPass = Deno.env.get("FINA_P12_PASSWORD_ALT") ?? pass ?? "";
    try {
      altKey = await loadP12(altP12.replace(/\s+/g, ""), altPass);
      certificates.alternate = await describeKey(altKey);
    } catch (e) {
      altSkipped = "alternate p12 could not be opened";
      certificates.alternate = { error: safeMessage(e) };
    }
  }

  const hosts = report.hosts as Record<string, unknown>;
  for (const { name, host } of HOSTS) {
    hosts[name] = { host, steps: await runHost(host, key, altKey, altSkipped) };
  }

  // Outbound address of the function.
  report.egress_ip = await timed(async () => {
    const { res, text } = await fetchWithDeadline(
      "https://api.ipify.org?format=json",
      {} as RequestInit,
      { connect: "ipify", read: "ipify" },
      10_000,
    );
    return { http_status: res.status, body: snippet(text, 120) };
  }, 10_000);

  // Summary only — no response bodies, no key material.
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const summarise = (entry: any) => {
      const out: Record<string, unknown> = {};
      for (const [stepName, step] of Object.entries(entry.steps as Record<string, Step>)) {
        out[stepName] = {
          ok: step.ok ?? null,
          skipped: step.skipped ?? false,
          duration_ms: step.duration_ms ?? null,
          http_status: step.http_status ?? null,
          server: step.server ?? null,
          alpn: step.alpn ?? null,
          address_count: Array.isArray(step.addresses) ? step.addresses.length : null,
          error: step.error ?? null,
        };
      }
      return out;
    };
    await supabase.from("app_diagnostics_logs").insert({
      event: "fina_conn_probe",
      session_id: "fina-conn-probe",
      user_id: null,
      severity: "info",
      details: {
        production: summarise((hosts as any).production),
        demo: summarise((hosts as any).demo),
        primary_cert: {
          subject_cn: key?.subjectCn ?? null,
          issuer_cn: key?.issuerCn ?? null,
          serial: key?.serial ?? null,
        },
        alternate_cert_present: Boolean(altKey),
        egress_ok: (report.egress_ip as Step)?.ok ?? null,
      },
    });
  } catch {
    // Diagnostics must never break the probe result.
  }

  return new Response(JSON.stringify(report, null, 2), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
