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
 */
export function readWsdlOperation(wsdl: string, nameFragment: string): WsdlOperationInfo {
  const targetNamespace = wsdl.match(/targetNamespace\s*=\s*"([^"]+)"/)?.[1] ?? null;
  const escaped = nameFragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const opBlock = wsdl.match(
    new RegExp(
      `<(?:\\w+:)?operation[^>]*name="([^"]*${escaped}[^"]*)"[\\s\\S]{0,600}?<\\/(?:\\w+:)?operation>`,
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
