// Shared WS-Security / mTLS plumbing for the FINA e-Racun B2B probes.
// Extracted verbatim from the K2 Echo probe — behaviour must not change.
import forge from "npm:node-forge@1.3.1";
import { serialize, digestBase64, bytesToBase64, type XmlNode } from "./c14n.ts";
import { FINA_CA_PEM } from "./finaCa.ts";

export const ENDPOINT =
  "https://webservisi.fina.hr/B2BFinaInvoiceWebService/services/B2BFinaInvoiceWebService";

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

export interface KeyMaterial {
  certPem: string;
  keyPem: string;
  certDerB64: string;
  subject: string;
  serial: string;
  issuer: string;
  pkcs8Der: Uint8Array;
}

export function loadP12(p12B64: string, password: string): KeyMaterial {
  const der = forge.util.decode64(p12B64);
  const asn1 = forge.asn1.fromDer(der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, password);

  const certBags =
    p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
  const keyBags =
    p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[
      forge.pki.oids.pkcs8ShroudedKeyBag
    ] ??
    p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ??
    [];

  const key = keyBags[0]?.key;
  if (!key) throw new Error("p12 contains no private key");

  const certs = certBags.map((b: any) => b.cert).filter(Boolean);
  const cert =
    certs.find((c: any) => c.publicKey?.n?.equals?.((key as any).n)) ?? certs[0];
  if (!cert) throw new Error("p12 contains no certificate");

  const certPem = forge.pki.certificateToPem(cert);
  const keyPem = forge.pki.privateKeyToPem(key);
  const certDerB64 = forge.util.encode64(
    forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes(),
  );
  const pkcs8Pem = forge.pki.privateKeyInfoToPem(
    forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(key)),
  );
  const pkcs8B64 = pkcs8Pem.replace(/-----[^-]+-----|\s+/g, "");
  const bin = atob(pkcs8B64);
  const pkcs8Der = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) pkcs8Der[i] = bin.charCodeAt(i);

  return {
    certPem,
    keyPem,
    certDerB64,
    subject: cert.subject.attributes
      .map((a: any) => `${a.shortName ?? a.name}=${a.value}`)
      .join(", "),
    issuer: cert.issuer.attributes
      .map((a: any) => `${a.shortName ?? a.name}=${a.value}`)
      .join(", "),
    serial: String(cert.serialNumber),
    pkcs8Der,
  };
}

export function loadFinaKey(): KeyMaterial {
  return loadP12(
    Deno.env.get("FINA_P12_B64")!.replace(/\s+/g, ""),
    Deno.env.get("FINA_P12_PASSWORD")!,
  );
}

/** mTLS client that trusts the Fina RDC chain. */
export function createFinaClient(key: KeyMaterial): unknown {
  return (Deno as any).createHttpClient({
    caCerts: [FINA_CA_PEM],
    cert: key.certPem,
    key: key.keyPem,
  });
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
