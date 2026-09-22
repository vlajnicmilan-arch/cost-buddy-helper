// Opening the FINA p12 without blowing the edge CPU budget.
//
// node-forge does PBKDF2 and symmetric decryption in pure JS. For a modern p12
// (PBKDF2-HMAC-SHA256 with many iterations + AES-256-CBC) that exceeds the edge
// worker limit. Here the p12 STRUCTURE is still parsed with forge, but the heavy
// part — key derivation and bag decryption — runs on WebCrypto.
//
// Old p12 files (pbeWithSHAAnd3-KeyTripleDES-CBC / RC2) have no WebCrypto
// equivalent, so those fall back to the original forge path unchanged.
import forge from "npm:node-forge@1.3.1";
import {
  OID,
  classifyEncryptionAlgorithm,
  prfToHash,
  aesKeyBytes,
  LegacyAlgorithmError,
} from "./p12Algorithms.ts";

const asn1 = forge.asn1;
type Asn1 = any;

export interface KeyMaterial {
  certPem: string;
  keyPem: string;
  certDerB64: string;
  subject: string;
  serial: string;
  issuer: string;
  /** CN only — safe to put in diagnostics. */
  subjectCn: string | null;
  issuerCn: string | null;
  /** Other certificates found in the p12 (possible issuer chain), PEM. */
  chainPems: string[];
  /** How many certificates the p12 contained in total. */
  certCount: number;
  pkcs8Der: Uint8Array;
  /** false when the p12 was opened on the WebCrypto path (MAC not checked). */
  macVerified: boolean;
  unlockPath: "webcrypto" | "forge";
}


// ---------------------------------------------------------------- ASN.1 utils

function oidOf(node: Asn1): string {
  return asn1.derToOid(node.value);
}

/** Raw content octets of a node, flattening BER-constructed OCTET STRINGs. */
function rawBytes(node: Asn1): string {
  if (typeof node.value === "string") return node.value;
  if (!Array.isArray(node.value)) return "";
  return node.value
    .map((child: Asn1) =>
      child.type === asn1.Type.OCTETSTRING ? rawBytes(child) : asn1.toDer(child).getBytes()
    )
    .join("");
}

function intOf(node: Asn1): number {
  const hex = forge.util.createBuffer(node.value).toHex();
  return hex ? parseInt(hex, 16) : 0;
}

function binToBytes(bin: string): Uint8Array {
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xff;
  return out;
}

function bytesToBin(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

// ------------------------------------------------------------ PBES2 on WebCrypto

/**
 * Decrypt a PBES2 (PBKDF2 -> AES-CBC) blob using WebCrypto.
 * Throws LegacyAlgorithmError for anything WebCrypto cannot do.
 */
async function decryptPbes2(
  encrypted: string,
  algId: Asn1,
  password: string,
): Promise<Uint8Array> {
  const algOid = oidOf(algId.value[0]);
  if (classifyEncryptionAlgorithm(algOid) !== "pbes2") throw new LegacyAlgorithmError(algOid);

  const params = algId.value[1];
  const kdf = params.value[0];
  const kdfOid = oidOf(kdf.value[0]);
  if (kdfOid !== OID.pbkdf2) throw new LegacyAlgorithmError(kdfOid);

  const kdfParams = kdf.value[1];
  const salt = binToBytes(rawBytes(kdfParams.value[0]));
  const iterations = intOf(kdfParams.value[1]);

  let prfOid: string | null = null;
  for (const extra of kdfParams.value.slice(2)) {
    if (extra.type === asn1.Type.SEQUENCE) prfOid = oidOf(extra.value[0]);
  }
  const hash = prfToHash(prfOid);
  if (!hash) throw new LegacyAlgorithmError(prfOid ?? "unknown-prf");

  const scheme = params.value[1];
  const schemeOid = oidOf(scheme.value[0]);
  const keyBytes = aesKeyBytes(schemeOid);
  if (!keyBytes) throw new LegacyAlgorithmError(schemeOid);
  const iv = binToBytes(rawBytes(scheme.value[1]));

  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash },
    baseKey,
    keyBytes * 8,
  );
  const aesKey = await crypto.subtle.importKey("raw", bits, { name: "AES-CBC" }, false, [
    "decrypt",
  ]);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-CBC", iv },
    aesKey,
    binToBytes(encrypted),
  );
  return new Uint8Array(plain);
}

// ------------------------------------------------------------------ p12 walk

interface RawBags {
  certDers: string[];
  pkcs8Bin: string | null;
}

interface P12OpenDetails {
  unlock_path: "webcrypto" | "forge";
  keybag_alg_oid: string | null;
  kdf_oid: string | null;
  prf_oid: string | null;
  scheme_oid: string | null;
  key_iterations: number | null;
}

function inspectP12Open(derBin: string): P12OpenDetails {
  const pfx = asn1.fromDer(derBin, { parseAllBytes: false });
  const authSafeCI = pfx.value[1];
  const authSafe = asn1.fromDer(rawBytes(authSafeCI.value[1].value[0]));

  for (const ci of authSafe.value) {
    if (oidOf(ci.value[0]) !== OID.data) continue;
    const safeBags = asn1.fromDer(rawBytes(ci.value[1].value[0])).value;
    for (const bag of safeBags) {
      if (oidOf(bag.value[0]) !== OID.pkcs8ShroudedKeyBag) continue;
      const algId = bag.value[1].value[0].value[0];
      const keybagAlgOid = oidOf(algId.value[0]);
      if (classifyEncryptionAlgorithm(keybagAlgOid) !== "pbes2") {
        return {
          unlock_path: "forge",
          keybag_alg_oid: keybagAlgOid,
          kdf_oid: null,
          prf_oid: null,
          scheme_oid: null,
          key_iterations: null,
        };
      }

      const params = algId.value[1];
      const kdf = params.value[0];
      const kdfParams = kdf.value[1];
      let prfOid: string | null = null;
      for (const extra of kdfParams.value.slice(2)) {
        if (extra.type === asn1.Type.SEQUENCE) prfOid = oidOf(extra.value[0]);
      }
      return {
        unlock_path: "webcrypto",
        keybag_alg_oid: keybagAlgOid,
        kdf_oid: oidOf(kdf.value[0]),
        prf_oid: prfOid,
        scheme_oid: oidOf(params.value[1].value[0]),
        key_iterations: intOf(kdfParams.value[1]),
      };
    }
  }

  return {
    unlock_path: "forge",
    keybag_alg_oid: null,
    kdf_oid: null,
    prf_oid: null,
    scheme_oid: null,
    key_iterations: null,
  };
}

async function recordP12Open(details: P12OpenDetails): Promise<void> {
  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!url || !serviceKey) return;
    const response = await fetch(`${url}/rest/v1/app_diagnostics_logs`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        event: "fina_p12_open",
        session_id: "fina-p12-open",
        user_id: null,
        severity: "info",
        details,
      }),
    });
    await response.arrayBuffer();
  } catch {
    // Diagnostics must never alter certificate opening behaviour.
  }
}

/**
 * Walk the PKCS#12 structure and return the certificate DERs and the
 * (decrypted) PrivateKeyInfo. MAC is NOT verified on this path — the file
 * comes from our own secret store, never from the network.
 */
async function collectBagsWithWebCrypto(derBin: string, password: string): Promise<RawBags> {
  const pfx = asn1.fromDer(derBin, { parseAllBytes: false });
  const authSafeCI = pfx.value[1];
  const authSafeOid = oidOf(authSafeCI.value[0]);
  if (authSafeOid !== OID.data) throw new LegacyAlgorithmError(authSafeOid);

  const authSafe = asn1.fromDer(rawBytes(authSafeCI.value[1].value[0]));
  const bags: Asn1[] = [];

  for (const ci of authSafe.value) {
    const oid = oidOf(ci.value[0]);
    if (oid === OID.data) {
      bags.push(...asn1.fromDer(rawBytes(ci.value[1].value[0])).value);
    } else if (oid === OID.encryptedData) {
      const encryptedData = ci.value[1].value[0];
      const eci = encryptedData.value[1];
      const plain = await decryptPbes2(rawBytes(eci.value[2]), eci.value[1], password);
      bags.push(...asn1.fromDer(bytesToBin(plain)).value);
    } else {
      throw new LegacyAlgorithmError(oid);
    }
  }

  const out: RawBags = { certDers: [], pkcs8Bin: null };
  for (const bag of bags) {
    const bagId = oidOf(bag.value[0]);
    const bagValue = bag.value[1].value[0];
    if (bagId === OID.certBag) {
      if (oidOf(bagValue.value[0]) !== OID.x509Certificate) continue;
      out.certDers.push(rawBytes(bagValue.value[1].value[0]));
    } else if (bagId === OID.pkcs8ShroudedKeyBag) {
      const plain = await decryptPbes2(rawBytes(bagValue.value[1]), bagValue.value[0], password);
      out.pkcs8Bin = bytesToBin(plain);
    } else if (bagId === OID.keyBag && !out.pkcs8Bin) {
      out.pkcs8Bin = asn1.toDer(bagValue).getBytes();
    }
  }
  return out;
}

// ------------------------------------------------------------------ assembly

/** Build the KeyMaterial from forge cert/key objects — shared by both paths. */
function toKeyMaterial(
  cert: any,
  key: any,
  macVerified: boolean,
  unlockPath: "webcrypto" | "forge",
  allCerts: any[] = [cert],
): KeyMaterial {
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

  const cnOf = (attrs: any[]): string | null =>
    attrs.find((a: any) => (a.shortName ?? a.name) === "CN")?.value ?? null;

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
    subjectCn: cnOf(cert.subject.attributes),
    issuerCn: cnOf(cert.issuer.attributes),
    chainPems: allCerts
      .filter((c: any) => c !== cert)
      .map((c: any) => forge.pki.certificateToPem(c)),
    certCount: allCerts.length,
    serial: String(cert.serialNumber),
    pkcs8Der,
    macVerified,
    unlockPath,
  };
}


function pickCert(certs: any[], key: any): any {
  const match = certs.find((c: any) => c.publicKey?.n?.equals?.((key as any).n));
  return match ?? certs[0];
}

/** Original forge path — kept for pbeWithSHAAnd3-KeyTripleDES / RC2 files. */
function loadP12WithForge(derBin: string, password: string): KeyMaterial {
  const parsed = asn1.fromDer(derBin, { parseAllBytes: false });
  const p12 = forge.pkcs12.pkcs12FromAsn1(parsed, password);

  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
  const keyBags =
    p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[
      forge.pki.oids.pkcs8ShroudedKeyBag
    ] ??
    p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ??
    [];

  const key = keyBags[0]?.key;
  if (!key) throw new Error("p12 contains no private key");
  const certs = certBags.map((b: any) => b.cert).filter(Boolean);
  if (certs.length === 0) throw new Error("p12 contains no certificate");

  return toKeyMaterial(pickCert(certs, key), key, true, "forge", certs);
}

export async function loadP12(p12B64: string, password: string): Promise<KeyMaterial> {
  const derBin = forge.util.decode64(p12B64);
  const algDetails = inspectP12Open(derBin);

  let material: KeyMaterial;
  let bags: RawBags | null = null;
  try {
    bags = await collectBagsWithWebCrypto(derBin, password);
  } catch (e) {
    if (!(e instanceof LegacyAlgorithmError)) throw e;
  }

  if (!bags) {
    material = loadP12WithForge(derBin, password);
  } else {
    if (!bags.pkcs8Bin) throw new Error("p12 contains no private key");
    if (bags.certDers.length === 0) throw new Error("p12 contains no certificate");
    const key = forge.pki.privateKeyFromAsn1(asn1.fromDer(bags.pkcs8Bin));
    const certs = bags.certDers.map((d) => forge.pki.certificateFromAsn1(asn1.fromDer(d)));
    material = toKeyMaterial(pickCert(certs, key), key, false, "webcrypto", certs);
  }

  // Identity only — never the key, the password or any p12 content.
  await recordP12Open({
    ...algDetails,
    unlock_path: material.unlockPath,
    subject_cn: material.subjectCn,
    issuer_cn: material.issuerCn,
    cert_count: material.certCount,
    chain_cns: describeChain(material).chain_cns,
  });

  return material;
}


export async function loadFinaKey(): Promise<KeyMaterial> {
  return await loadP12(
    Deno.env.get("FINA_P12_B64")!.replace(/\s+/g, ""),
    Deno.env.get("FINA_P12_PASSWORD")!,
  );
}
