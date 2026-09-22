// Minimal X.509 reading for the FINA probes.
//
// Dependency-free on purpose: the same code must run inside the edge function
// (Deno) and inside the unit tests (vitest), and it must be possible to verify
// a certificate fingerprint without trusting any parser we cannot inspect.
// Only what the chain builder and the diagnostics need is parsed.

export interface Tlv {
  tag: number;
  headerLength: number;
  length: number;
  start: number; // offset of the tag byte
  contentStart: number;
  end: number; // exclusive
}

export function readTlv(bytes: Uint8Array, offset: number): Tlv {
  const tag = bytes[offset];
  let i = offset + 1;
  let length = bytes[i++];
  if (length & 0x80) {
    const n = length & 0x7f;
    length = 0;
    for (let k = 0; k < n; k++) length = length * 256 + bytes[i++];
  }
  return {
    tag,
    headerLength: i - offset,
    length,
    start: offset,
    contentStart: i,
    end: i + length,
  };
}

export function tlvChildren(bytes: Uint8Array, node: Tlv): Tlv[] {
  const out: Tlv[] = [];
  let i = node.contentStart;
  while (i < node.end) {
    const child = readTlv(bytes, i);
    out.push(child);
    i = child.end;
  }
  return out;
}

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

function oidToString(bytes: Uint8Array): string {
  const parts: number[] = [Math.floor(bytes[0] / 40), bytes[0] % 40];
  let value = 0;
  for (let i = 1; i < bytes.length; i++) {
    value = value * 128 + (bytes[i] & 0x7f);
    if (!(bytes[i] & 0x80)) {
      parts.push(value);
      value = 0;
    }
  }
  return parts.join(".");
}

const OID_CN = "2.5.4.3";
const OID_O = "2.5.4.10";
const OID_C = "2.5.4.6";
const OID_SKI = "2.5.29.14";
const OID_AKI = "2.5.29.35";

const SHORT_NAME: Record<string, string> = { [OID_CN]: "CN", [OID_O]: "O", [OID_C]: "C" };

interface Rdn {
  oid: string;
  value: string;
}

function readName(bytes: Uint8Array, name: Tlv): Rdn[] {
  const out: Rdn[] = [];
  for (const rdnSet of tlvChildren(bytes, name)) {
    for (const pair of tlvChildren(bytes, rdnSet)) {
      const [oidNode, valueNode] = tlvChildren(bytes, pair);
      if (!oidNode || !valueNode) continue;
      out.push({
        oid: oidToString(bytes.subarray(oidNode.contentStart, oidNode.end)),
        value: new TextDecoder().decode(bytes.subarray(valueNode.contentStart, valueNode.end)),
      });
    }
  }
  return out;
}

function formatName(rdns: Rdn[]): string {
  return rdns.map((r) => `${SHORT_NAME[r.oid] ?? r.oid}=${r.value}`).join(", ");
}

function cnOf(rdns: Rdn[]): string | null {
  return rdns.find((r) => r.oid === OID_CN)?.value ?? null;
}

export interface CertificateInfo {
  pem: string;
  der: Uint8Array;
  subject: string;
  issuer: string;
  subjectCn: string | null;
  issuerCn: string | null;
  /** DER bytes of the name, hex — used for exact issuer/subject matching. */
  subjectDerHex: string;
  issuerDerHex: string;
  /** Subject Key Identifier / Authority Key Identifier, hex, when present. */
  ski: string | null;
  aki: string | null;
  selfSigned: boolean;
}

export function pemToDer(pem: string): Uint8Array {
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function derToPem(der: Uint8Array): string {
  let bin = "";
  for (const b of der) bin += String.fromCharCode(b);
  const b64 = btoa(bin).replace(/(.{64})/g, "$1\n").trim();
  return `-----BEGIN CERTIFICATE-----\n${b64}\n-----END CERTIFICATE-----`;
}

export function splitPemCertificates(pem: string): string[] {
  const matches = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
  return matches ? matches.map((m) => m.trim()) : [];
}

export function parseCertificate(pem: string): CertificateInfo {
  const der = pemToDer(pem);
  const cert = readTlv(der, 0);
  const [tbs] = tlvChildren(der, cert);
  const tbsChildren = tlvChildren(der, tbs);

  // Optional [0] EXPLICIT version shifts every following field by one.
  const base = tbsChildren[0].tag === 0xa0 ? 1 : 0;
  const issuerNode = tbsChildren[base + 2];
  const subjectNode = tbsChildren[base + 4];

  let ski: string | null = null;
  let aki: string | null = null;
  const extsNode = tbsChildren.find((c) => c.tag === 0xa3);
  if (extsNode) {
    const [extSeq] = tlvChildren(der, extsNode);
    for (const ext of tlvChildren(der, extSeq)) {
      const parts = tlvChildren(der, ext);
      const oid = oidToString(der.subarray(parts[0].contentStart, parts[0].end));
      const valueNode = parts[parts.length - 1];
      if (oid === OID_SKI) {
        const inner = readTlv(der, valueNode.contentStart);
        ski = toHex(der.subarray(inner.contentStart, inner.end));
      } else if (oid === OID_AKI) {
        const seq = readTlv(der, valueNode.contentStart);
        for (const field of tlvChildren(der, seq)) {
          if (field.tag === 0x80) aki = toHex(der.subarray(field.contentStart, field.end));
        }
      }
    }
  }

  const subjectRdns = readName(der, subjectNode);
  const issuerRdns = readName(der, issuerNode);
  const subjectDerHex = toHex(der.subarray(subjectNode.start, subjectNode.end));
  const issuerDerHex = toHex(der.subarray(issuerNode.start, issuerNode.end));

  return {
    pem: pem.trim(),
    der,
    subject: formatName(subjectRdns),
    issuer: formatName(issuerRdns),
    subjectCn: cnOf(subjectRdns),
    issuerCn: cnOf(issuerRdns),
    subjectDerHex,
    issuerDerHex,
    ski,
    aki,
    selfSigned: subjectDerHex === issuerDerHex,
  };
}

export async function sha256Fingerprint(der: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", der as unknown as ArrayBuffer);
  return toHex(new Uint8Array(digest))
    .match(/.{2}/g)!
    .join(":");
}
