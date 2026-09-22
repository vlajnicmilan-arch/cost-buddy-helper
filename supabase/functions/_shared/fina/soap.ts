// Shared WS-Security / mTLS plumbing for the FINA e-Racun B2B probes.
// Extracted verbatim from the K2 Echo probe — behaviour must not change.
import forge from "npm:node-forge@1.3.1";
import { serialize, digestBase64, bytesToBase64, type XmlNode } from "./c14n.ts";
import { FINA_CA_PEM, FINA_DEMO_CA_PEM } from "./finaCa.ts";
import { resolveFinaEndpoint } from "./endpoint.ts";
import { buildClientChain, type ClientChain } from "./chain.ts";
import { splitPemCertificates } from "./certInfo.ts";


const RESOLVED_ENDPOINT = resolveFinaEndpoint(
  (globalThis as any).Deno?.env?.get?.("FINA_ENDPOINT") ?? null,
);

/** Service address: FINA_ENDPOINT when set and https, otherwise production. */
export const ENDPOINT = RESOLVED_ENDPOINT.endpoint;
export const ENDPOINT_SOURCE = RESOLVED_ENDPOINT.source;
export const ENDPOINT_ERROR = RESOLVED_ENDPOINT.error ?? null;

export const WSSE_NS =
  "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd";
export const WSU_NS =
  "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd";
export const BST_VALUE_TYPE =
  "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-x509-token-profile-1.0#X509v3";
export const BST_ENCODING =
  "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary";
export const DS_NS = "http://www.w3.org/2000/09/xmldsig#";
export const EXC_C14N = "http://www.w3.org/2001/10/xml-exc-c14n#";
export const SOAP_NS = "http://schemas.xmlsoap.org/soap/envelope/";
export const COMPONENTS_NS = "http://fina.hr/eracun/b2b/invoicewebservicecomponents/v0.1";

export const FINA_SECRETS = ["FINA_P12_B64", "FINA_P12_PASSWORD", "FINA_BUYER_OIB"] as const;

/** Strip anything that could carry key material out of an error string. */
export function safeMessage(e: unknown): string {
  const raw = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  return raw
    .replace(/-----BEGIN[\s\S]*?-----END[^-]*-----/g, "[pem]")
    .replace(/[A-Za-z0-9+/=]{60,}/g, "[b64]")
    .slice(0, 300);
}

export function snippet(text: string, max: number): string {
  return text.replace(/[A-Za-z0-9+/=]{200,}/g, "[b64]").slice(0, max);
}

/** Constant-time-ish probe gate. Returns null when authorised. */
export function checkProbeKey(req: Request): Response | null {
  const expected =
    Deno.env.get("PROBE_SERVICE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const provided = req.headers.get("x-probe-key") ?? "";
  if (!expected || provided !== expected) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}

/** Returns a 400 response for the first missing FINA secret, or null. */
export function checkFinaSecrets(): Response | null {
  for (const name of FINA_SECRETS) {
    if (!Deno.env.get(name)) {
      return new Response(JSON.stringify({ error: `missing secret ${name}` }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
  }
  return null;
}

import type { KeyMaterial } from "./p12.ts";
export type { KeyMaterial } from "./p12.ts";
export { loadP12, loadFinaKey } from "./p12.ts";



/**
 * Client certificate chain for the TLS handshake: our leaf plus the CA that
 * issued it (from the p12 when present, otherwise from the bundled FINA CAs).
 * The root is deliberately left out — the server already has it.
 * The WS-Security BinarySecurityToken stays the leaf only.
 */
export function buildFinaClientChain(key: KeyMaterial): ClientChain {
  return buildClientChain(key.certPem, key.chainPems, [
    ...splitPemCertificates(FINA_CA_PEM),
    ...splitPemCertificates(FINA_DEMO_CA_PEM),
  ]);
}

/** Subject CNs of the certificates actually sent, leaf first. */
export function describeClientChain(key: KeyMaterial): {
  chain_cns: string[];
  chain_length: number;
  issuer_source: ClientChain["issuerSource"];
  p12_cert_count: number;
  subject_cn: string | null;
  issuer_cn: string | null;
} {
  const chain = buildFinaClientChain(key);
  return {
    chain_cns: chain.cns,
    chain_length: chain.cns.length,
    issuer_source: chain.issuerSource,
    p12_cert_count: key.certCount,
    subject_cn: key.subjectCn,
    issuer_cn: key.issuerCn,
  };
}

/** mTLS client that trusts the Fina RDC chain and the Fina DEMO chain. */
export function createFinaClient(key: KeyMaterial): unknown {
  return (Deno as any).createHttpClient({
    caCerts: [FINA_CA_PEM, FINA_DEMO_CA_PEM],
    cert: buildFinaClientChain(key).pem,
    key: key.keyPem,
  });
}

export const FINA_TIMEOUT_MS = 25_000;

/** Raised when FINA does not answer inside the internal deadline. */
export class FinaTimeoutError extends Error {
  constructor(public readonly phase: string) {
    super(`no response after ${Math.round(FINA_TIMEOUT_MS / 1000)}s (phase: ${phase})`);
    this.name = "FinaTimeoutError";
  }
}

/**
 * fetch with an internal deadline, so a probe returns a clean answer instead of
 * hanging until the platform kills it. `connect` names the phase while waiting
 * for response headers, `read` the phase while reading the body.
 */
export async function fetchWithDeadline(
  url: string,
  init: RequestInit,
  phases: { connect: string; read: string },
  timeoutMs: number = FINA_TIMEOUT_MS,
): Promise<{ res: Response; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let phase = phases.connect;
  try {
    const res = await fetch(url, { ...init, signal: controller.signal } as RequestInit);
    phase = phases.read;
    const text = await res.text();
    return { res, text };
  } catch (e) {
    if (controller.signal.aborted) throw new FinaTimeoutError(phase);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}


export async function importSigningKey(
  key: KeyMaterial,
  hash: "SHA-256" | "SHA-1",
): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "pkcs8",
    key.pkcs8Der,
    { name: "RSASSA-PKCS1-v1_5", hash },
    false,
    ["sign"],
  );
}

export interface SignOptions {
  hash: "SHA-256" | "SHA-1";
  signTimestamp: boolean;
  keyInfo: "bst" | "issuer-serial";
}

export const DIGEST_ALG = {
  "SHA-256": "http://www.w3.org/2001/04/xmlenc#sha256",
  "SHA-1": "http://www.w3.org/2000/09/xmldsig#sha1",
} as const;

export const SIG_ALG = {
  "SHA-256": "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
  "SHA-1": "http://www.w3.org/2000/09/xmldsig#rsa-sha1",
} as const;

export function isoNow(offsetMs = 0): string {
  return new Date(Date.now() + offsetMs).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Wrap a payload element into a signed SOAP envelope (body carries wsu:Id="id-body"). */
export async function buildSignedEnvelope(
  payload: XmlNode,
  opts: SignOptions,
  key: KeyMaterial,
  cryptoKey: CryptoKey,
): Promise<string> {
  const body: XmlNode = {
    name: "soapenv:Body",
    attrs: {
      "xmlns:soapenv": SOAP_NS,
      "xmlns:wsu": WSU_NS,
      "wsu:Id": "id-body",
    },
    children: [payload],
  };

  const timestamp: XmlNode = {
    name: "wsu:Timestamp",
    attrs: { "xmlns:wsu": WSU_NS, "wsu:Id": "id-ts" },
    children: [
      { name: "wsu:Created", children: [isoNow()] },
      { name: "wsu:Expires", children: [isoNow(5 * 60 * 1000)] },
    ],
  };

  const refs: Array<{ uri: string; digest: string }> = [
    { uri: "#id-body", digest: await digestBase64(opts.hash, serialize(body)) },
  ];
  if (opts.signTimestamp) {
    refs.push({ uri: "#id-ts", digest: await digestBase64(opts.hash, serialize(timestamp)) });
  }

  const signedInfo: XmlNode = {
    name: "ds:SignedInfo",
    attrs: { "xmlns:ds": DS_NS },
    children: [
      { name: "ds:CanonicalizationMethod", attrs: { Algorithm: EXC_C14N }, children: [] },
      { name: "ds:SignatureMethod", attrs: { Algorithm: SIG_ALG[opts.hash] }, children: [] },
      ...refs.map((r) => ({
        name: "ds:Reference",
        attrs: { URI: r.uri },
        children: [
          {
            name: "ds:Transforms",
            children: [
              { name: "ds:Transform", attrs: { Algorithm: EXC_C14N }, children: [] },
            ],
          },
          { name: "ds:DigestMethod", attrs: { Algorithm: DIGEST_ALG[opts.hash] }, children: [] },
          { name: "ds:DigestValue", children: [r.digest] },
        ],
      })),
    ],
  };

  const signedInfoXml = serialize(signedInfo);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signedInfoXml),
  );

  const keyInfo: XmlNode =
    opts.keyInfo === "bst"
      ? {
          name: "ds:KeyInfo",
          children: [
            {
              name: "wsse:SecurityTokenReference",
              attrs: { "xmlns:wsse": WSSE_NS },
              children: [
                {
                  name: "wsse:Reference",
                  attrs: { URI: "#id-bst", ValueType: BST_VALUE_TYPE },
                  children: [],
                },
              ],
            },
          ],
        }
      : {
          name: "ds:KeyInfo",
          children: [
            {
              name: "ds:X509Data",
              children: [
                {
                  name: "ds:X509IssuerSerial",
                  children: [
                    { name: "ds:X509IssuerName", children: [key.issuer] },
                    {
                      name: "ds:X509SerialNumber",
                      children: [BigInt(`0x${key.serial}`).toString()],
                    },
                  ],
                },
              ],
            },
          ],
        };

  const securityChildren: XmlNode[] = [timestamp];
  if (opts.keyInfo === "bst") {
    securityChildren.push({
      name: "wsse:BinarySecurityToken",
      attrs: {
        "xmlns:wsu": WSU_NS,
        EncodingType: BST_ENCODING,
        ValueType: BST_VALUE_TYPE,
        "wsu:Id": "id-bst",
      },
      children: [key.certDerB64],
    });
  }
  securityChildren.push({
    name: "ds:Signature",
    attrs: { "xmlns:ds": DS_NS },
    children: [
      signedInfo,
      { name: "ds:SignatureValue", children: [bytesToBase64(new Uint8Array(signature))] },
      keyInfo,
    ],
  });

  const envelope: XmlNode = {
    name: "soapenv:Envelope",
    attrs: { "xmlns:soapenv": SOAP_NS },
    children: [
      {
        name: "soapenv:Header",
        children: [
          {
            name: "wsse:Security",
            attrs: {
              "xmlns:wsse": WSSE_NS,
              "xmlns:wsu": WSU_NS,
              "soapenv:mustUnderstand": "1",
            },
            children: securityChildren,
          },
        ],
      },
      body,
    ],
  };

  return `<?xml version="1.0" encoding="UTF-8"?>${serialize(envelope)}`;
}
