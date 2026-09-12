// TEMPORARY DIAGNOSTIC FUNCTION — gate K3 for the FINA e-Racun B2B reader.
// Read-only: GetB2BIncomingInvoiceList (9101) and GetB2BIncomingInvoice (9103).
// Never calls a write method (no ChangeStatus). Nothing from the invoices is
// stored: only a small summary row goes into app_diagnostics_logs.
//
// Secrets read (never logged, never returned):
//   FINA_P12_B64, FINA_P12_PASSWORD, FINA_BUYER_OIB
// Caller must send header x-probe-key equal to PROBE_SERVICE_KEY.
//
// Body flags:
//   {"inspect": true} — fetch WSDL + schemas only, describe the request elements,
//                       make no SOAP call at all.
//   {}                — run the read flow: list → get first invoice → list again.
import { createClient } from "npm:@supabase/supabase-js@2";
import type { XmlNode } from "../_shared/fina/c14n.ts";
import {
  readWsdlOperation,
  readMessagePartElement,
  allSchemaLocations,
  describeElement,
  type SchemaNode,
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
  type KeyMaterial,
  type SignOptions,
} from "../_shared/fina/soap.ts";

const V1: SignOptions = { hash: "SHA-256", signTimestamp: true, keyInfo: "bst" };

const LIST_OP = "getB2BIncomingInvoiceList";
const GET_OP = "getB2BIncomingInvoice";

interface OperationInfo {
  operation: string | null;
  soapAction: string | null;
  element: { localName: string; namespace: string } | null;
  schema: SchemaNode | null;
  error?: string;
}

function textOf(xml: string, path: string[]): string | null {
  let scope = xml;
  for (const name of path) {
    const m = scope.match(
      new RegExp(`<(?:[\\w.-]+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:[\\w.-]+:)?${name}>`),
    );
    if (!m) return null;
    scope = m[1];
  }
  return scope.replace(/<[^>]*>/g, "").trim() || null;
}

function blocks(xml: string, name: string): string[] {
  const out: string[] = [];
  const re = new RegExp(
    `<(?:[\\w.-]+:)?${name}\\b[^>]*>[\\s\\S]*?</(?:[\\w.-]+:)?${name}>`,
    "g",
  );
  for (const m of xml.matchAll(re)) out.push(m[0]);
  return out;
}

function firstText(xml: string, names: string[]): string | null {
  for (const n of names) {
    const v = textOf(xml, [n]);
    if (v) return v;
  }
  return null;
}

function header(oib: string, messageType: string): XmlNode {
  return {
    name: "v01:HeaderBuyer",
    children: [
      { name: "v01:MessageID", children: [crypto.randomUUID()] },
      { name: "v01:BuyerID", children: [`9934:${oib}`] },
      { name: "v01:MessageType", children: [messageType] },
    ],
  };
}

/** Find a node by (case-insensitive) name anywhere in the described schema tree. */
function findNode(node: SchemaNode | null, name: string): SchemaNode | null {
  if (!node) return null;
  if (node.name.toLowerCase() === name.toLowerCase()) return node;
  for (const c of node.children) {
    const hit = findNode(c, name);
    if (hit) return hit;
  }
  return null;
}

function formatDate(d: Date, type: string | null): string {
  const iso = d.toISOString();
  return type && /dateTime/i.test(type) ? iso.replace(/\.\d{3}Z$/, "Z") : iso.slice(0, 10);
}

Deno.serve(async (req) => {
  const gate = checkProbeKey(req);
  if (gate) return gate;
  const missing = checkFinaSecrets();
  if (missing) return missing;

  let inspect = false;
  let raw = false;
  let filterMode: "date" | "none" | "status" = "date";
  let wantedInvoiceId: string | null = null;
  try {
    const parsed = await req.json();
    inspect = parsed?.inspect === true;
    raw = parsed?.raw === true;
    if (parsed?.filter === "none" || parsed?.filter === "status" || parsed?.filter === "date") {
      filterMode = parsed.filter;
    }
    if (typeof parsed?.invoiceId === "string" && parsed.invoiceId.trim()) {
      wantedInvoiceId = parsed.invoiceId.trim();
    }
  } catch {
    // no body
  }

  const report: Record<string, unknown> = {
    endpoint: ENDPOINT,
    mode: inspect ? "inspect" : raw ? "raw" : "read",
    filter: filterMode,
  };
  const steps: Record<string, unknown> = {};
  report.steps = steps;
  const httpStatuses: number[] = [];

  try {
    const key: KeyMaterial = loadFinaKey();
    const oib = Deno.env.get("FINA_BUYER_OIB")!.trim();
    report.certificate = { subject: key.subject, serial: key.serial };
    const client = createFinaClient(key);

    // ---- WSDL + schemas -------------------------------------------------
    const wsdlRes = await fetch(`${ENDPOINT}?wsdl`, { client } as RequestInit);
    const wsdlText = await wsdlRes.text();
    steps.wsdl = { http_status: wsdlRes.status };

    const schemas: string[] = [wsdlText];
    const schemaDocs: Array<{ url: string; http_status: number }> = [];
    for (const loc of allSchemaLocations(wsdlText)) {
      try {
        const url = new URL(loc.location, `${ENDPOINT}?wsdl`).toString();
        const res = await fetch(url, { client } as RequestInit);
        const text = await res.text();
        schemas.push(text);
        schemaDocs.push({ url, http_status: res.status });
        for (const nested of allSchemaLocations(text)) {
          const nurl = new URL(nested.location, url).toString();
          if (schemaDocs.some((d) => d.url === nurl)) continue;
          const nres = await fetch(nurl, { client } as RequestInit);
          schemas.push(await nres.text());
          schemaDocs.push({ url: nurl, http_status: nres.status });
        }
      } catch (e) {
        schemaDocs.push({ url: loc.location, http_status: -1, ...{ error: safeMessage(e) } } as any);
      }
    }
    steps.schemas = schemaDocs;
    if (dumpSchemas) {
      return new Response(
        JSON.stringify({ ...report, schema_docs: schemaDocs.map((d, i) => ({ url: d.url, text: schemas[i + 1] ?? "" })) }, null, 2),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const resolve = (opFragment: string): OperationInfo => {
      const op = readWsdlOperation(wsdlText, opFragment, true);
      if (!op.inputMessage) {
        return { operation: op.operation, soapAction: op.soapAction, element: null, schema: null, error: `no input message for ${opFragment}` };
      }
      const part = readMessagePartElement(wsdlText, op.inputMessage);
      if (part.usesType) {
        return { operation: op.operation, soapAction: op.soapAction, element: null, schema: null, error: `part uses type="${part.usesType}" — RPC style, stopping` };
      }
      if (!part.localName || !part.namespace) {
        return { operation: op.operation, soapAction: op.soapAction, element: null, schema: null, error: part.error ?? "element unresolved" };
      }
      return {
        operation: op.operation,
        soapAction: op.soapAction,
        element: { localName: part.localName, namespace: part.namespace },
        schema: describeElement(schemas, part.localName),
      };
    };

    const listOp = resolve(LIST_OP);
    const getOp = resolve(GET_OP);
    steps.operations = { list: listOp, get: getOp };

    if (inspect) {
      return new Response(JSON.stringify(report, null, 2), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (listOp.error || !listOp.element) {
      report.error = listOp.error ?? "list element unresolved";
      return new Response(JSON.stringify(report, null, 2), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    const cryptoKey = await importSigningKey(key, V1.hash);

    const call = async (label: string, payload: XmlNode, soapAction: string) => {
      const t0 = Date.now();
      const envelope = await buildSignedEnvelope(payload, V1, key, cryptoKey);
      const res = await fetch(ENDPOINT, {
        method: "POST",
        client,
        headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: `"${soapAction ?? ""}"` },
        body: envelope,
      } as RequestInit);
      const text = await res.text();
      httpStatuses.push(res.status);
      const fault = /<(?:[\w.-]+:)?Fault\b/.test(text);
      (steps as any)[label] = {
        http_status: res.status,
        duration_ms: Date.now() - t0,
        fault,
        ...(fault ? { response: snippet(text, 2000) } : {}),
      };
      return { text, fault, status: res.status };
    };

    // ---- request bodies -------------------------------------------------
    const listNs = listOp.element.namespace;
    const listRoot = listOp.element.localName;
    const dateNode =
      findNode(listOp.schema, "From") ??
      findNode(listOp.schema, "DateFrom") ??
      findNode(listOp.schema, "StartDate");
    const to = new Date();
    const from = new Date(to.getTime() - 60 * 24 * 3600 * 1000);
    const dateType = dateNode?.type ?? null;

    const filterChildren = (): XmlNode[] => {
      if (filterMode === "none") return [];
      if (filterMode === "status") {
        const statusNode =
          findNode(listOp.schema, "InvoiceStatus") ??
          findNode(listOp.schema, "StatusCode") ??
          findNode(listOp.schema, "Status");
        return [
          {
            name: "v01:Filter",
            children: [{ name: `v01:${statusNode?.name ?? "InvoiceStatus"}`, children: ["RECEIVED"] }],
          },
        ];
      }
      return [
        {
          name: "v01:Filter",
          children: [
            {
              name: "v01:DateRange",
              children: [
                { name: `v01:${dateNode?.name ?? "From"}`, children: [formatDate(from, dateType)] },
                {
                  name: `v01:${
                    findNode(listOp.schema, "To")?.name ??
                    findNode(listOp.schema, "DateTo")?.name ??
                    "To"
                  }`,
                  children: [formatDate(to, dateType)],
                },
              ],
            },
          ],
        },
      ];
    };

    const buildList = (): XmlNode => ({
      name: `m:${listRoot}`,
      attrs: { "xmlns:m": listNs, "xmlns:v01": COMPONENTS_NS },
      children: [
        header(oib, "9101"),
        {
          name: "m:Data",
          children: [
            {
              name: "m:B2BIncomingInvoiceList",
              children: filterChildren(),
            },
          ],
        },
      ],
    });

    // (a) list
    const listA = await call("list_before", buildList(), listOp.soapAction ?? "");
    report.raw_list_first_4000 = listA.text.slice(0, 4000);
    report.raw_list_body_first_4000 = (listA.text.match(
      /<(?:[\w.-]+:)?Body\b[^>]*>[\s\S]*?<\/(?:[\w.-]+:)?Body>/,
    )?.[0] ?? "").slice(0, 4000);
    report.invoice_id_occurrences = (listA.text.match(/InvoiceID/g) ?? []).length;
    if (listA.fault) {
      report.error = "list call returned a SOAP Fault — stopping";
      report.fault = snippet(listA.text, 2000);
      return new Response(JSON.stringify(report, null, 2), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    /**
     * Find the element that actually carries InvoiceID: for every tag name in
     * the response, take its blocks and keep the tightest set where each block
     * has exactly one InvoiceID. No hardcoded element name, no text filtering.
     */
    const invoiceItems = (xml: string): string[] => {
      const names = new Set<string>();
      for (const m of xml.matchAll(/<(?:[\w.-]+:)?([\w.-]+)[\s>]/g)) names.add(m[1]);
      let best: string[] | null = null;
      let bestLen = Infinity;
      for (const n of names) {
        if (/^InvoiceID$/i.test(n)) continue;
        const bs = blocks(xml, n).filter((b) => /<(?:[\w.-]+:)?InvoiceID\b/.test(b));
        if (!bs.length) continue;
        if (!bs.every((b) => (b.match(/<(?:[\w.-]+:)?InvoiceID\b/g) ?? []).length === 1)) continue;
        const len = bs.reduce((s, b) => s + b.length, 0);
        if (len < bestLen) {
          bestLen = len;
          best = bs;
        }
      }
      return best ?? [];
    };

    const parseList = (xml: string) =>
      invoiceItems(xml).map((b) => ({
        invoice_id: firstText(b, ["InvoiceID", "InvoiceId"]),
        invoice_number: firstText(b, ["InvoiceNumber", "InvoiceNo", "DocumentNumber"]),
        supplier: firstText(b, ["SupplierName", "SellerName", "SupplierID", "SellerID"]),
        amount: firstText(b, ["TotalAmount", "PayableAmount", "Amount"]),
        date: firstText(b, ["InvoiceDate", "IssueDate", "DateOfIssue"]),
        status: firstText(b, ["Status", "InvoiceStatus", "StatusCode"]),
      }));

    const before = parseList(listA.text);
    report.list_before = { count: before.length, invoices: before };

    if (raw) {
      return new Response(JSON.stringify(report, null, 2), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    const first = (wantedInvoiceId && before.find((i) => i.invoice_id === wantedInvoiceId)) || before[0];
    if (!first?.invoice_id) {
      report.note = "list returned no invoice with an InvoiceID — nothing to fetch";
      report.list_sample = snippet(listA.text, 2000);
    } else if (getOp.error || !getOp.element) {
      report.error = getOp.error ?? "get element unresolved";
    } else {
      // (b) fetch the first invoice
      const getNs = getOp.element.namespace;
      const getRoot = getOp.element.localName;
      const getPayload: XmlNode = {
        name: `m:${getRoot}`,
        attrs: { "xmlns:m": getNs, "xmlns:v01": COMPONENTS_NS },
        children: [
          header(oib, "9103"),
          {
            name: "m:Data",
            children: [
              {
                name: "m:B2BIncomingInvoice",
                children: [{ name: "m:InvoiceID", children: [first.invoice_id] }],
              },
            ],
          },
        ],
      };
      const got = await call("get_invoice", getPayload, getOp.soapAction ?? "");
      if (got.fault) {
        report.error = "get call returned a SOAP Fault — stopping";
        report.fault = snippet(got.text, 2000);
        return new Response(JSON.stringify(report, null, 2), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      // UBL payload description only — never stored.
      const ublMatch = got.text.match(
        /<(?:[\w.-]+:)?(Invoice|CreditNote)\b[^>]*>[\s\S]*?<\/(?:[\w.-]+:)?\1>/,
      );
      let ublXml = ublMatch?.[0] ?? null;
      if (!ublXml) {
        // UBL may arrive base64 encoded inside an <Invoice>/<Document> element.
        const b64 = firstText(got.text, ["InvoiceDocument", "Document", "XmlDocument"]);
        if (b64 && /^[A-Za-z0-9+/=\s]+$/.test(b64) && b64.length > 200) {
          try {
            ublXml = new TextDecoder().decode(
              Uint8Array.from(atob(b64.replace(/\s+/g, "")), (c) => c.charCodeAt(0)),
            );
          } catch {
            ublXml = null;
          }
        }
      }
      const rootTag = ublXml?.match(/<([\w.:-]+)([^>]*)>/);
      const rootName = rootTag?.[1]?.split(":").pop() ?? null;
      const rootNs =
        rootTag?.[2]?.match(/xmlns(?::[\w.-]+)?\s*=\s*"([^"]+)"/)?.[1] ?? null;
      const pdfB64 = firstText(got.text, ["PdfDocument", "PDFDocument", "Pdf"]);
      report.invoice = {
        invoice_id: first.invoice_id,
        ubl_root_element: rootName,
        ubl_namespace: rootNs,
        line_count: ublXml ? blocks(ublXml, "InvoiceLine").length || blocks(ublXml, "CreditNoteLine").length : 0,
        has_pdf: !!pdfB64,
        pdf_bytes: pdfB64 ? Math.floor((pdfB64.replace(/\s+/g, "").length * 3) / 4) : 0,
        ubl_head: ublXml ? ublXml.slice(0, 500) : snippet(got.text, 500),
      };

      // (c) list again, compare the status of that invoice
      const listB = await call("list_after", buildList(), listOp.soapAction ?? "");
      if (listB.fault) {
        report.error = "second list call returned a SOAP Fault";
        report.fault = snippet(listB.text, 2000);
      } else {
        const after = parseList(listB.text);
        const row = after.find((i) => i.invoice_id === first.invoice_id);
        report.list_after = { count: after.length, invoices: after };
        report.status_change = {
          invoice_id: first.invoice_id,
          status_before: first.status,
          status_after: row?.status ?? null,
          changed: (first.status ?? null) !== (row?.status ?? null),
        };
      }
    }
  } catch (e) {
    report.error = safeMessage(e);
  }

  // Summary only — no invoice content, no secrets.
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    await supabase.from("app_diagnostics_logs").insert({
      event: "fina_read_probe",
      session_id: "fina-read-probe",
      user_id: null,
      severity: report.error ? "error" : "info",
      details: {
        mode: report.mode,
        count: (report as any).list_before?.count ?? null,
        status_before: (report as any).status_change?.status_before ?? null,
        status_after: (report as any).status_change?.status_after ?? null,
        http_statuses: httpStatuses,
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
