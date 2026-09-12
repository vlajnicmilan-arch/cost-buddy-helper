/** Pull the Echo operation name, SOAPAction and target namespace out of the FINA WSDL. */
export function readWsdlEcho(wsdl: string): {
  targetNamespace: string | null;
  operation: string | null;
  soapAction: string | null;
  inputMessage: string | null;
} {
  const targetNamespace = wsdl.match(/targetNamespace\s*=\s*"([^"]+)"/)?.[1] ?? null;
  const opBlock = wsdl.match(
    /<(?:\w+:)?operation[^>]*name="([^"]*[Ee]cho[^"]*)"[\s\S]{0,600}?<\/(?:\w+:)?operation>/,
  );
  const operation = opBlock?.[1] ?? null;
  const soapAction = opBlock?.[0].match(/soapAction\s*=\s*"([^"]*)"/)?.[1] ?? null;
  const inputMessage =
    opBlock?.[0].match(/<(?:\w+:)?input[^>]*message="(?:[\w.-]+:)?([^"]+)"/)?.[1] ??
    wsdl.match(/<(?:\w+:)?element\s+name="([^"]*[Ee]cho[^"]*)"/)?.[1] ??
    null;
  return { targetNamespace, operation, soapAction, inputMessage };
}
