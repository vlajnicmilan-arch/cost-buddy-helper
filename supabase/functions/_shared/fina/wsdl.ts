export interface WsdlOperationInfo {
  targetNamespace: string | null;
  operation: string | null;
  soapAction: string | null;
  inputMessage: string | null;
  outputMessage: string | null;
}

/**
 * Pull one operation (matched by name fragment) with its SOAPAction, input and
 * output message names out of the FINA WSDL.
 *
 * When `exact` is true the name attribute must equal the fragment exactly
 * (useful when one operation name is a prefix of another, e.g.
 * getB2BIncomingInvoice vs getB2BIncomingInvoiceList).
 */
export function readWsdlOperation(
  wsdl: string,
  nameFragment: string,
  exact = false,
): WsdlOperationInfo {
  const targetNamespace = wsdl.match(/targetNamespace\s*=\s*"([^"]+)"/)?.[1] ?? null;
  const escaped = nameFragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const namePattern = exact
    ? `(?:\\w+:)?${escaped}`
    : `[^"]*${escaped}[^"]*`;
  const opBlock = wsdl.match(
    new RegExp(
      `<(?:\\w+:)?operation[^>]*name="(${namePattern})"[\\s\\S]{0,600}?<\\/(?:\\w+:)?operation>`,
    ),
  );
  const operation = opBlock?.[1] ?? null;
  const soapAction = opBlock?.[0].match(/soapAction\s*=\s*"([^"]*)"/)?.[1] ?? null;
  const inputMessage =
    opBlock?.[0].match(/<(?:\w+:)?input[^>]*message="(?:[\w.-]+:)?([^"]+)"/)?.[1] ?? null;
  const outputMessage =
    opBlock?.[0].match(/<(?:\w+:)?output[^>]*message="(?:[\w.-]+:)?([^"]+)"/)?.[1] ?? null;
  return { targetNamespace, operation, soapAction, inputMessage, outputMessage };
}

/** Pull the Echo operation name, SOAPAction and target namespace out of the FINA WSDL. */
export function readWsdlEcho(wsdl: string): {
  targetNamespace: string | null;
  operation: string | null;
  soapAction: string | null;
  inputMessage: string | null;
} {
  const info = readWsdlOperation(wsdl, "cho");
  return {
    targetNamespace: info.targetNamespace,
    operation: info.operation,
    soapAction: info.soapAction,
    inputMessage:
      info.inputMessage ??
      wsdl.match(/<(?:\w+:)?element\s+name="([^"]*[Ee]cho[^"]*)"/)?.[1] ??
      null,
  };
}

/** Collect every xmlns:prefix declaration in the document (first declaration wins). */
export function collectNamespaces(xml: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const m of xml.matchAll(/xmlns:([\w.-]+)\s*=\s*"([^"]+)"/g)) {
    if (!(m[1] in map)) map[m[1]] = m[2];
  }
  return map;
}

export interface MessagePartInfo {
  /** Local name of the body root element declared by the message part. */
  localName: string | null;
  /** Namespace the element belongs to. */
  namespace: string | null;
  /** Raw QName exactly as written in the WSDL. */
  qname: string | null;
  /** Set when the part uses type= instead of element= (RPC style). */
  usesType: string | null;
  error: string | null;
}

/**
 * Read wsdl:message name="<messageName>" → wsdl:part and resolve its element QName
 * against the namespace declarations of the WSDL.
 */
export function readMessagePartElement(wsdl: string, messageName: string): MessagePartInfo {
  const empty: MessagePartInfo = {
    localName: null,
    namespace: null,
    qname: null,
    usesType: null,
    error: null,
  };
  const escaped = messageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = wsdl.match(
    new RegExp(
      `<(?:[\\w.-]+:)?message[^>]*name="${escaped}"[\\s\\S]*?<\\/(?:[\\w.-]+:)?message>`,
    ),
  )?.[0] ??
    // Self-closing message with an inline part is not valid, but tolerate a short window.
    wsdl.match(new RegExp(`<(?:[\\w.-]+:)?message[^>]*name="${escaped}"[\\s\\S]{0,400}`))?.[0];
  if (!block) return { ...empty, error: `message ${messageName} not found in WSDL` };

  const part = block.match(/<(?:[\w.-]+:)?part\b[^>]*>/)?.[0];
  if (!part) return { ...empty, error: `message ${messageName} has no part` };

  const typeAttr = part.match(/\btype\s*=\s*"([^"]+)"/)?.[1] ?? null;
  const elementAttr = part.match(/\belement\s*=\s*"([^"]+)"/)?.[1] ?? null;
  if (!elementAttr) {
    return {
      ...empty,
      usesType: typeAttr,
      error: typeAttr
        ? `message part uses type="${typeAttr}" instead of element=`
        : "message part declares neither element nor type",
    };
  }

  const [prefix, local] = elementAttr.includes(":")
    ? elementAttr.split(":")
    : [null, elementAttr];
  const ns = prefix ? collectNamespaces(wsdl)[prefix] ?? null : null;
  return {
    localName: local,
    namespace: ns,
    qname: elementAttr,
    usesType: null,
    error: ns ? null : `prefix ${prefix} of ${elementAttr} not declared in WSDL`,
  };
}

/** Find the xsd:import/xsd:include schemaLocation for a namespace, if present. */
export function findSchemaLocation(xml: string, namespace: string): string | null {
  for (const m of xml.matchAll(/<(?:[\w.-]+:)?(?:import|include)\b[^>]*>/g)) {
    const tag = m[0];
    const ns = tag.match(/\bnamespace\s*=\s*"([^"]+)"/)?.[1];
    const loc = tag.match(/\bschemaLocation\s*=\s*"([^"]+)"/)?.[1];
    if (loc && (!ns || ns === namespace)) {
      if (!ns || ns === namespace) return loc;
    }
  }
  return null;
}

/** Local names of the direct children of a global element declaration in a schema. */
export function readElementChildren(schema: string, localName: string): string[] {
  const escaped = localName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = schema.match(
    new RegExp(
      `<(?:[\\w.-]+:)?element[^>]*name="${escaped}"[\\s\\S]*?<\\/(?:[\\w.-]+:)?element>`,
    ),
  )?.[0];
  if (!block) return [];
  const kids: string[] = [];
  for (const m of block.matchAll(/<(?:[\w.-]+:)?element\b[^>]*>/g)) {
    const name = m[0].match(/\b(?:name|ref)\s*=\s*"([^"]+)"/)?.[1];
    if (name && name.split(":").pop() !== localName) kids.push(name);
  }
  return kids;
}

export interface SchemaNode {
  name: string;
  type: string | null;
  minOccurs: string | null;
  maxOccurs: string | null;
  children: SchemaNode[];
}

function attr(tag: string, name: string): string | null {
  return tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]+)"`))?.[1] ?? null;
}

/** Extract the full text of the first <element|complexType name="X"> block. */
function findDecl(schema: string, kind: "element" | "complexType", name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const open = new RegExp(`<(?:[\\w.-]+:)?${kind}\\b[^>]*name="${escaped}"[^>]*>`);
  const m = schema.match(open);
  if (!m) {
    const selfClosing = schema.match(
      new RegExp(`<(?:[\\w.-]+:)?${kind}\\b[^>]*name="${escaped}"[^>]*/>`),
    );
    return selfClosing?.[0] ?? null;
  }
  if (m[0].endsWith("/>")) return m[0];
  const start = m.index!;
  const localName = m[0].match(/^<([\w.:-]+)/)![1];
  const tagRe = new RegExp(`<${localName}\\b|</${localName}>`, "g");
  tagRe.lastIndex = start;
  let depth = 0;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(schema))) {
    if (match[0].startsWith("</")) {
      depth--;
      if (depth === 0) return schema.slice(start, match.index + match[0].length);
    } else {
      depth++;
    }
  }
  return null;
}

/** Direct <element> children declared inside a block (skipping nested levels). */
function directElements(block: string): string[] {
  const tags: string[] = [];
  let depth = 0;
  const re = /<(?:[\w.-]+:)?element\b[^>]*?(\/?)>|<\/(?:[\w.-]+:)?element>/g;
  let m: RegExpExecArray | null;
  let first = true;
  while ((m = re.exec(block))) {
    const isClose = m[0].startsWith("</");
    if (isClose) {
      depth--;
      continue;
    }
    const selfClosing = m[1] === "/";
    if (first) {
      first = false;
      if (!selfClosing) depth++;
      continue; // the declaration itself
    }
    if (depth === 1) tags.push(m[0]);
    if (!selfClosing) depth++;
  }
  return tags;
}

/**
 * Walk a schema (optionally across several schema documents) and describe the
 * structure of a global element declaration: child names, types and occurrence.
 */
export function describeElement(
  schemas: string[],
  name: string,
  depth = 4,
  seen: Set<string> = new Set(),
): SchemaNode | null {
  const local = name.split(":").pop()!;
  if (seen.has(local) || depth < 0) return { name: local, type: null, minOccurs: null, maxOccurs: null, children: [] };
  seen.add(local);

  let block: string | null = null;
  for (const s of schemas) {
    block = findDecl(s, "element", local);
    if (block) break;
  }
  if (!block) return null;

  const openTag = block.match(/^<[^>]*>/)![0];
  const typeAttr = attr(openTag, "type");
  const node: SchemaNode = {
    name: local,
    type: typeAttr,
    minOccurs: attr(openTag, "minOccurs"),
    maxOccurs: attr(openTag, "maxOccurs"),
    children: [],
  };

  let body = block;
  if (typeAttr) {
    const typeLocal = typeAttr.split(":").pop()!;
    let typeBlock: string | null = null;
    for (const s of schemas) {
      typeBlock = findDecl(s, "complexType", typeLocal);
      if (typeBlock) break;
    }
    if (!typeBlock) return node; // simple type leaf
    body = typeBlock;
  }

  for (const tag of directElements(body)) {
    const ref = attr(tag, "ref");
    const childName = ref ?? attr(tag, "name");
    if (!childName) continue;
    if (ref) {
      const resolved = describeElement(schemas, ref, depth - 1, new Set(seen));
      node.children.push(
        resolved ?? {
          name: ref.split(":").pop()!,
          type: null,
          minOccurs: attr(tag, "minOccurs"),
          maxOccurs: attr(tag, "maxOccurs"),
          children: [],
        },
      );
      continue;
    }
    const childType = attr(tag, "type");
    const child: SchemaNode = {
      name: childName,
      type: childType,
      minOccurs: attr(tag, "minOccurs"),
      maxOccurs: attr(tag, "maxOccurs"),
      children: [],
    };
    if (childType) {
      const typeLocal = childType.split(":").pop()!;
      let typeBlock: string | null = null;
      for (const s of schemas) {
        typeBlock = findDecl(s, "complexType", typeLocal);
        if (typeBlock) break;
      }
      if (typeBlock && depth > 0) {
        for (const t of directElements(`<x>${typeBlock}`)) {
          const n = attr(t, "ref") ?? attr(t, "name");
          if (!n) continue;
          child.children.push({
            name: n.split(":").pop()!,
            type: attr(t, "type"),
            minOccurs: attr(t, "minOccurs"),
            maxOccurs: attr(t, "maxOccurs"),
            children: [],
          });
        }
      }
    } else if (depth > 0) {
      // inline complexType
      for (const t of directElements(tag === block ? block : `<x>${blockOf(body, childName)}`)) {
        const n = attr(t, "ref") ?? attr(t, "name");
        if (n) child.children.push({ name: n.split(":").pop()!, type: attr(t, "type"), minOccurs: attr(t, "minOccurs"), maxOccurs: attr(t, "maxOccurs"), children: [] });
      }
    }
    node.children.push(child);
  }
  return node;
}

function blockOf(schema: string, name: string): string {
  return findDecl(schema, "element", name) ?? "";
}

/** All xsd:import/include schemaLocations in a document. */
export function allSchemaLocations(xml: string): Array<{ namespace: string | null; location: string }> {
  const out: Array<{ namespace: string | null; location: string }> = [];
  for (const m of xml.matchAll(/<(?:[\w.-]+:)?(?:import|include)\b[^>]*>/g)) {
    const loc = m[0].match(/\bschemaLocation\s*=\s*"([^"]+)"/)?.[1];
    if (loc) out.push({ namespace: m[0].match(/\bnamespace\s*=\s*"([^"]+)"/)?.[1] ?? null, location: loc });
  }
  return out;
}
