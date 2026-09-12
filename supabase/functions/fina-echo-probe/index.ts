// TEMPORARY DIAGNOSTIC FUNCTION — gate K2 for the FINA e-Racun B2B reader.
// Sends a WS-Security signed SOAP Echo to the FINA production web service over mTLS
// and reports whether the call is accepted. No tables are written except a single
// summary row in app_diagnostics_logs. Delete after the FINA safe decision is made.
//
// Secrets read (never logged, never returned):
//   FINA_P12_B64, FINA_P12_PASSWORD, FINA_BUYER_OIB
// Caller must send header x-probe-key equal to PROBE_SERVICE_KEY (service role key).
import { createClient } from "npm:@supabase/supabase-js@2";
import type { XmlNode } from "../_shared/fina/c14n.ts";
import {
  readWsdlEcho,
  readMessagePartElement,
  findSchemaLocation,
  readElementChildren,
} from "../_shared/fina/wsdl.ts";
import {
  ENDPOINT,
  COMPONENTS_NS,
  buildSignedEnvelope,
  checkFinaSecrets,
  checkProbeKey,
  createFinaClient,
  importSigningKey,
  loadFinaKey,
  safeMessage,
  snippet,
  type SignOptions,
} from "../_shared/fina/soap.ts";

type Variant = "V1" | "V2" | "V3" | "V4";

const VARIANTS: Record<Variant, SignOptions> = {
  V1: { hash: "SHA-256", signTimestamp: true, keyInfo: "bst" },
  V2: { hash: "SHA-1", signTimestamp: true, keyInfo: "bst" },
  V3: { hash: "SHA-256", signTimestamp: false, keyInfo: "bst" },
  V4: { hash: "SHA-256", signTimestamp: true, keyInfo: "issuer-serial" },
};

function buildEchoPayload(oib: string, elementName: string, ns: string): XmlNode {
  return {
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
      // Schema EchoBuyerMsg.xsd: HeaderBuyer, then Data/EchoData/Echo (qualified).
      {
        name: "echo:Data",
        children: [
          {
            name: "echo:EchoData",
            children: [{ name: "echo:Echo", children: ["K2 probe"] }],
          },
        ],
      },
    ],
  };
}

Deno.serve(async (req) => {
  const gate = checkProbeKey(req);
  if (gate) return gate;
  const missing = checkFinaSecrets();
  if (missing) return missing;

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
    const key = loadFinaKey();
    const oib = Deno.env.get("FINA_BUYER_OIB")!.trim();
    report.certificate = { subject: key.subject, issuer: key.issuer, serial: key.serial };

    const client = createFinaClient(key);

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
    const variants = report.variants as Array<Record<string, unknown>>;
    for (const variant of ["V1"] as Variant[]) {
      const t0 = Date.now();
      try {
        const opts = VARIANTS[variant];
        const cryptoKey = await importSigningKey(key, opts.hash);
        const envelope = await buildSignedEnvelope(
          buildEchoPayload(oib, elementName, ns),
          opts,
          key,
          cryptoKey,
        );
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
