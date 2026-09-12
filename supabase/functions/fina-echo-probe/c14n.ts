/**
 * Minimal exclusive XML canonicalisation (exc-c14n) for the FINA Echo probe.
 *
 * The probe builds every XML node itself, so the input subset is deliberately
 * narrow: elements, attributes, text. No comments, no CDATA, no processing
 * instructions, no entities beyond the five predefined ones.
 *
 * Pure module — no Deno/Node globals except WebCrypto (available in both).
 */

export interface XmlNode {
  name: string;
  attrs?: Record<string, string>;
  children?: Array<XmlNode | string>;
}

const ESC_TEXT: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\r": "&#xD;",
};

const ESC_ATTR: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  '"': "&quot;",
  "\t": "&#x9;",
  "\n": "&#xA;",
  "\r": "&#xD;",
};

export function escapeText(value: string): string {
  return value.replace(/[&<>\r]/g, (c) => ESC_TEXT[c]);
}

export function escapeAttr(value: string): string {
  return value.replace(/[&<"\t\n\r]/g, (c) => ESC_ATTR[c]);
}

/** Namespace declarations first (default xmlns, then prefixed, alphabetical), then plain attributes. */
export function sortAttrNames(names: string[]): string[] {
  const ns = names.filter((n) => n === "xmlns" || n.startsWith("xmlns:")).sort();
  const rest = names.filter((n) => n !== "xmlns" && !n.startsWith("xmlns:")).sort();
  return [...ns, ...rest];
}

/** Serialise a node tree into canonical form. */
export function serialize(node: XmlNode | string): string {
  if (typeof node === "string") return escapeText(node);
  const attrs = node.attrs ?? {};
  const names = sortAttrNames(Object.keys(attrs));
  const attrStr = names.map((n) => ` ${n}="${escapeAttr(attrs[n])}"`).join("");
  const children = node.children ?? [];
  if (children.length === 0) {
    // exc-c14n never emits self-closing tags.
    return `<${node.name}${attrStr}></${node.name}>`;
  }
  return `<${node.name}${attrStr}>${children.map(serialize).join("")}</${node.name}>`;
}

interface ParseResult {
  node: XmlNode;
  next: number;
}

function parseElement(xml: string, start: number): ParseResult {
  if (xml[start] !== "<") throw new Error("c14n: expected element start");
  let i = start + 1;
  const nameEnd = (() => {
    let j = i;
    while (j < xml.length && !/[\s/>]/.test(xml[j])) j++;
    return j;
  })();
  const name = xml.slice(i, nameEnd);
  if (!name) throw new Error("c14n: empty element name");
  i = nameEnd;

  const attrs: Record<string, string> = {};
  for (;;) {
    while (i < xml.length && /\s/.test(xml[i])) i++;
    if (xml[i] === "/" && xml[i + 1] === ">") {
      return { node: { name, attrs, children: [] }, next: i + 2 };
    }
    if (xml[i] === ">") {
      i++;
      break;
    }
    let j = i;
    while (j < xml.length && xml[j] !== "=" && !/\s/.test(xml[j])) j++;
    const attrName = xml.slice(i, j);
    while (j < xml.length && /\s/.test(xml[j])) j++;
    if (xml[j] !== "=") throw new Error(`c14n: malformed attribute ${attrName}`);
    j++;
    while (j < xml.length && /\s/.test(xml[j])) j++;
    const quote = xml[j];
    if (quote !== '"' && quote !== "'") throw new Error("c14n: unquoted attribute value");
    const valueEnd = xml.indexOf(quote, j + 1);
    if (valueEnd < 0) throw new Error("c14n: unterminated attribute value");
    attrs[attrName] = unescapeXml(xml.slice(j + 1, valueEnd));
    i = valueEnd + 1;
  }

  const children: Array<XmlNode | string> = [];
  for (;;) {
    if (i >= xml.length) throw new Error(`c14n: unterminated element ${name}`);
    if (xml[i] === "<") {
      if (xml[i + 1] === "/") {
        const close = xml.indexOf(">", i);
        if (close < 0) throw new Error("c14n: unterminated close tag");
        const closeName = xml.slice(i + 2, close).trim();
        if (closeName !== name) throw new Error(`c14n: mismatched close tag ${closeName}`);
        return { node: { name, attrs, children }, next: close + 1 };
      }
      const child = parseElement(xml, i);
      children.push(child.node);
      i = child.next;
      continue;
    }
    const textEnd = xml.indexOf("<", i);
    const raw = xml.slice(i, textEnd < 0 ? xml.length : textEnd);
    if (raw.length > 0) children.push(unescapeXml(raw));
    i = textEnd < 0 ? xml.length : textEnd;
  }
}

function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#xD;/gi, "\r")
    .replace(/&#xA;/gi, "\n")
    .replace(/&#x9;/gi, "\t")
    .replace(/&amp;/g, "&");
}

/** Parse a serialised fragment back into the node model. */
export function parse(xml: string): XmlNode {
  const trimmed = xml.trim();
  const { node } = parseElement(trimmed, 0);
  return node;
}

/** Canonicalise a serialised XML fragment. Idempotent by construction. */
export function canonicalize(xml: string): string {
  return serialize(parse(xml));
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export async function digestBase64(
  algorithm: "SHA-256" | "SHA-1",
  data: string,
): Promise<string> {
  const buf = await crypto.subtle.digest(algorithm, new TextEncoder().encode(data));
  return bytesToBase64(new Uint8Array(buf));
}
