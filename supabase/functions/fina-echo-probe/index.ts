// TEMPORARY DIAGNOSTIC FUNCTION — gate K2 for the FINA e-Racun B2B reader.
// Sends a WS-Security signed SOAP Echo to the FINA production web service over mTLS
// and reports whether the call is accepted. No tables are written except a single
// summary row in app_diagnostics_logs. Delete after the FINA safe decision is made.
//
// Secrets read (never logged, never returned):
//   FINA_P12_B64, FINA_P12_PASSWORD, FINA_BUYER_OIB
// Caller must send header x-probe-key equal to PROBE_SERVICE_KEY (service role key).
import forge from "npm:node-forge@1.3.1";
import { createClient } from "npm:@supabase/supabase-js@2";
import { serialize, digestBase64, bytesToBase64, type XmlNode } from "./c14n.ts";
import {
  readWsdlEcho,
  readMessagePartElement,
  findSchemaLocation,
  readElementChildren,
} from "./wsdl.ts";
import { FINA_CA_PEM } from "./finaCa.ts";

const ENDPOINT =
  "https://webservisi.fina.hr/B2BFinaInvoiceWebService/services/B2BFinaInvoiceWebService";

const WSSE_NS =
  "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd";
const WSU_NS =
  "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd";
const BST_VALUE_TYPE =
  "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-x509-token-profile-1.0#X509v3";
const BST_ENCODING =
  "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary";
const DS_NS = "http://www.w3.org/2000/09/xmldsig#";
const EXC_C14N = "http://www.w3.org/2001/10/xml-exc-c14n#";
const SOAP_NS = "http://schemas.xmlsoap.org/soap/envelope/";
const COMPONENTS_NS = "http://fina.hr/eracun/b2b/invoicewebservicecomponents/v0.1";

/** Strip anything that could carry key material out of an error string. */
function safeMessage(e: unknown): string {
  const raw = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  return raw
    .replace(/-----BEGIN[\s\S]*?-----END[^-]*-----/g, "[pem]")
    .replace(/[A-Za-z0-9+/=]{60,}/g, "[b64]")
    .slice(0, 300);
}

function snippet(text: string, max: number): string {
  return text.replace(/[A-Za-z0-9+/=]{200,}/g, "[b64]").slice(0, max);
}

interface KeyMaterial {
  certPem: string;
  keyPem: string;
  certDerB64: string;
  subject: string;
  serial: string;
  issuer: string;
  pkcs8Der: Uint8Array;
}

function loadP12(p12B64: string, password: string): KeyMaterial {
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

  // Pick the leaf certificate that matches the private key modulus.
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

type Variant = "V1" | "V2" | "V3" | "V4";

interface SignOptions {
  hash: "SHA-256" | "SHA-1";
  signTimestamp: boolean;
  keyInfo: "bst" | "issuer-serial";
}

const VARIANTS: Record<Variant, SignOptions> = {
  V1: { hash: "SHA-256", signTimestamp: true, keyInfo: "bst" },
  V2: { hash: "SHA-1", signTimestamp: true, keyInfo: "bst" },
  V3: { hash: "SHA-256", signTimestamp: false, keyInfo: "bst" },
  V4: { hash: "SHA-256", signTimestamp: true, keyInfo: "issuer-serial" },
};

const DIGEST_ALG = {
  "SHA-256": "http://www.w3.org/2001/04/xmlenc#sha256",
  "SHA-1": "http://www.w3.org/2000/09/xmldsig#sha1",
} as const;

const SIG_ALG = {
  "SHA-256": "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
  "SHA-1": "http://www.w3.org/2000/09/xmldsig#rsa-sha1",
} as const;

function isoNow(offsetMs = 0): string {
  return new Date(Date.now() + offsetMs).toISOString().replace(/\.\d{3}Z$/, "Z");
}

function buildEchoBody(oib: string, elementName: string, ns: string): XmlNode {
  return {
    name: "soapenv:Body",
    attrs: {
      "xmlns:soapenv": SOAP_NS,
      "xmlns:wsu": WSU_NS,
      "wsu:Id": "id-body",
    },
    children: [
      {
        name: `echo:${elementName}`,
        attrs: { "xmlns:echo": ns, "xmlns:v01": COMPONENTS_NS },
        children: [
          {
            name: "v01:HeaderBuyer",
            children: [
              { name: "v01:MessageID", children: [crypto.randomUUID()] },
              { name: "v01:BuyerID", children: [`9934:${oib}`] },
              { name: "v01:MessageType", children: ["9999"] },
            ],
          },
        ],
      },
    ],
  };
}

async function buildEnvelope(
  variant: Variant,
  key: KeyMaterial,
  cryptoKey: CryptoKey,
  oib: string,
  messageName: string,
  ns: string,
): Promise<string> {
  const opts = VARIANTS[variant];

  const body = buildEchoBody(oib, messageName, ns);
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
                    { name: "ds:X509SerialNumber", children: [BigInt(`0x${key.serial}`).toString()] },
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

Deno.serve(async (req) => {
  const expected =
    Deno.env.get("PROBE_SERVICE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const provided = req.headers.get("x-probe-key") ?? "";
  if (!expected || provided !== expected) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  for (const name of ["FINA_P12_B64", "FINA_P12_PASSWORD", "FINA_BUYER_OIB"]) {
    if (!Deno.env.get(name)) {
      return new Response(JSON.stringify({ error: `missing secret ${name}` }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // Optional request flag: return the signed envelopes for offline signature review.
  // The envelope carries only the public certificate and the signature value.
  let dump = false;
  try {
    const parsed = await req.json();
    dump = parsed?.dump === true;
  } catch {
    // No body / invalid JSON — dump stays off.
  }

  const report: Record<string, unknown> = { endpoint: ENDPOINT, steps: {}, variants: [] };
  const steps = report.steps as Record<string, unknown>;
  const envelopes: Record<string, string> = {};
  if (dump) report.envelopes = envelopes;


  try {
    const key = loadP12(
      Deno.env.get("FINA_P12_B64")!.replace(/\s+/g, ""),
      Deno.env.get("FINA_P12_PASSWORD")!,
    );
    const oib = Deno.env.get("FINA_BUYER_OIB")!.trim();
    report.certificate = { subject: key.subject, issuer: key.issuer, serial: key.serial };

    const client = (Deno as any).createHttpClient({
      caCerts: [FINA_CA_PEM],
      cert: key.certPem,
      key: key.keyPem,
    });

    // Step 1 — WSDL over mTLS.
    let wsdlInfo = {
      targetNamespace: null as string | null,
      operation: null as string | null,
      soapAction: null as string | null,
      inputMessage: null as string | null,
    };
    let wsdlText = "";
    try {
      const t0 = Date.now();
      const res = await fetch(`${ENDPOINT}?wsdl`, { client } as RequestInit);
      wsdlText = await res.text();
      wsdlInfo = readWsdlEcho(wsdlText);
      steps.wsdl = {
        http_status: res.status,
        duration_ms: Date.now() - t0,
        ...wsdlInfo,
        wsdl_head: wsdlText.slice(0, 3000),
      };
    } catch (e) {
      steps.wsdl = { error: safeMessage(e) };
    }

    // Step 1b — resolve the body root element from wsdl:message → wsdl:part element=.
    const part = wsdlInfo.inputMessage
      ? readMessagePartElement(wsdlText, wsdlInfo.inputMessage)
      : null;
    steps.messagePart = part ?? { error: "no input message name from WSDL" };

    if (part?.usesType) {
      report.error = `message part uses type="${part.usesType}" — RPC style, stopping`;
      return new Response(JSON.stringify(report, null, 2), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (!part || !part.localName || !part.namespace) {
      report.error = part?.error ?? "could not resolve Echo body element from WSDL";
      return new Response(JSON.stringify(report, null, 2), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Step 1c — if the element lives in an imported schema, fetch it and list its children.
    try {
      const loc = findSchemaLocation(wsdlText, part.namespace);
      if (loc) {
        const url = new URL(loc, `${ENDPOINT}?wsdl`).toString();
        const res = await fetch(url, { client } as RequestInit);
        const schema = await res.text();
        steps.schema = {
          url,
          http_status: res.status,
          element: `{${part.namespace}}${part.localName}`,
          children: readElementChildren(schema, part.localName),
          head: schema.slice(0, 2000),
        };
      } else {
        steps.schema = {
          inline: true,
          element: `{${part.namespace}}${part.localName}`,
          children: readElementChildren(wsdlText, part.localName),
        };
      }
    } catch (e) {
      steps.schema = { error: safeMessage(e) };
    }

    const elementName = part.localName;
    const ns = part.namespace;
    const soapAction = wsdlInfo.soapAction ?? "";

    // Step 2 — signed Echo, variant by variant until one is accepted.
    const cryptoKeyFor = async (hash: "SHA-256" | "SHA-1") =>
      await crypto.subtle.importKey(
        "pkcs8",
        key.pkcs8Der,
        { name: "RSASSA-PKCS1-v1_5", hash },
        false,
        ["sign"],
      );

    const variants = report.variants as Array<Record<string, unknown>>;
    for (const variant of ["V1"] as Variant[]) {
      const t0 = Date.now();
      try {
        const cryptoKey = await cryptoKeyFor(VARIANTS[variant].hash);
        const envelope = await buildEnvelope(variant, key, cryptoKey, oib, messageName, ns);
        if (dump && (variant === "V1" || variant === "V2")) envelopes[variant] = envelope;
        const res = await fetch(ENDPOINT, {
          method: "POST",
          client,
          headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: `"${soapAction}"` },
          body: envelope,
        } as RequestInit);
        const text = await res.text();
        const rejected = res.status >= 400 || /Fault/i.test(text);
        variants.push({
          variant,
          http_status: res.status,
          duration_ms: Date.now() - t0,
          response: snippet(text, 2000),
          conclusion: rejected ? "rejected" : "accepted",
        });
        if (!rejected) break;
      } catch (e) {
        variants.push({
          variant,
          duration_ms: Date.now() - t0,
          error: safeMessage(e),
          conclusion: "rejected",
        });
      }
    }
  } catch (e) {
    report.error = safeMessage(e);
  }

  // Summary only — no key, password or token material.
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const variants = report.variants as Array<Record<string, unknown>>;
    const accepted = variants.find((v) => v.conclusion === "accepted");
    await supabase.from("app_diagnostics_logs").insert({
      event: "fina_echo_probe",
      session_id: "fina-echo-probe",
      user_id: null,
      severity: accepted ? "info" : "error",
      details: {
        accepted_variant: accepted?.variant ?? null,
        wsdl_status: (report.steps as any)?.wsdl?.http_status ?? null,
        soap_action: (report.steps as any)?.wsdl?.soapAction ?? null,
        results: variants.map((v) => ({
          variant: v.variant,
          http_status: v.http_status ?? null,
          conclusion: v.conclusion,
          duration_ms: v.duration_ms ?? null,
        })),
        error: report.error ?? null,
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
