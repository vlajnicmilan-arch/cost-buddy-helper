// Building the client certificate chain sent during the TLS handshake.
//
// FINA production issues application certificates under "Fina RDC 2025". A TLS
// client that sends only the leaf leaves the server without the issuer, which
// is what a production handshake that never answers looks like. So: leaf plus
// the certificate that issued it. The root is never sent — the server has it.

import { parseCertificate, splitPemCertificates, type CertificateInfo } from "./certInfo.ts";

export interface ClientChain {
  /** leaf [+ issuer ...] concatenated as one PEM, in that order. */
  pem: string;
  /** CN of every certificate actually sent, leaf first. */
  cns: string[];
  /** Where the issuer came from — useful in diagnostics. */
  issuerSource: "p12" | "ca_bundle" | "none";
}

function isIssuerOf(candidate: CertificateInfo, child: CertificateInfo): boolean {
  if (candidate.subjectDerHex !== child.issuerDerHex) return false;
  if (child.aki && candidate.ski) return child.aki === candidate.ski;
  return true;
}

/**
 * @param leafPem      our own certificate from the p12
 * @param p12ChainPems any other certificates found inside the p12
 * @param caPems       public CA certificates we ship (may include roots)
 */
export function buildClientChain(
  leafPem: string,
  p12ChainPems: string[],
  caPems: string[],
): ClientChain {
  const leaf = parseCertificate(leafPem);
  const fromP12 = p12ChainPems
    .map(parseCertificate)
    .filter((c) => c.subjectDerHex !== leaf.subjectDerHex);
  const fromCa = caPems.map(parseCertificate);

  const chain: CertificateInfo[] = [leaf];
  let issuerSource: ClientChain["issuerSource"] = "none";
  let current = leaf;

  // Two intermediates is already more than FINA uses; the bound stops loops.
  for (let depth = 0; depth < 2; depth++) {
    if (current.selfSigned) break;
    const inP12 = fromP12.find((c) => isIssuerOf(c, current) && !c.selfSigned);
    const found = inP12 ?? fromCa.find((c) => isIssuerOf(c, current) && !c.selfSigned);
    if (!found) break;
    if (chain.some((c) => c.subjectDerHex === found.subjectDerHex)) break;
    if (depth === 0) issuerSource = inP12 ? "p12" : "ca_bundle";
    chain.push(found);
    current = found;
  }

  return {
    pem: chain.map((c) => c.pem).join("\n") + "\n",
    cns: chain.map((c) => c.subjectCn ?? c.subject),
    issuerSource,
  };
}

export function chainCns(pem: string): string[] {
  return splitPemCertificates(pem).map((p) => {
    const info = parseCertificate(p);
    return info.subjectCn ?? info.subject;
  });
}
