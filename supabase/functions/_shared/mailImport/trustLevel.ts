/**
 * MAIL UVOZ — razina povjerenja u poruku (T1–T4).
 *
 * DMARC logika: dovoljno je da DKIM ILI SPF prođe I da domena koja je prošla
 * bude USKLAĐENA s domenom iz `From`. Prolaz bez usklađenosti nije T1 —
 * napadač lako pošalje poruku koja prolazi SPF za svoju domenu.
 *
 * ARC se prihvaća samo od sealera s popisa pouzdanih, i to samo uz uredan
 * izvorni `Authentication-Results`. Popis je konfigurabilan.
 */

export type TrustLevel = 'T1' | 'T2' | 'T3' | 'T4';

export const DEFAULT_TRUSTED_ARC_SEALERS: readonly string[] = [
  'google.com',
  'microsoft.com',
  'yahoo.com',
];

export interface AuthResults {
  spf?: string | null;
  dkim?: string | null;
  arc?: string | null;
  dmarc?: string | null;
  fromHeader?: string | null;
  /** Sirovi `Authentication-Results` iz originalne poruke, ako postoji. */
  originalAuthResults?: string | null;
}

export interface TrustVerdict {
  level: TrustLevel;
  /** Pouzdanost izvlačenja se tvrdo obara na T4. */
  forcedConfidence: 'niska' | null;
  /** T4 se ne smije uključiti u grupne radnje. */
  excludedFromBulk: boolean;
  warnings: string[];
  reasons: string[];
}

export function domainOfAddress(value: string | null | undefined): string {
  const m = (value ?? '').toLowerCase().match(/([^\s<>,;]+)@([^\s<>,;]+)/);
  return m ? m[2].replace(/[>.,;]+$/, '') : '';
}

/** Organizacijska usklađenost (relaxed): jednaka domena ili poddomena. */
export function domainsAligned(a: string, b: string): boolean {
  if (!a || !b) return false;
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x === y || x.endsWith(`.${y}`) || y.endsWith(`.${x}`);
}

const passed = (value: string | null | undefined): boolean =>
  /\bpass\b/i.test(value ?? '') && !/\bfail\b/i.test(value ?? '');

/** Iz "pass (domain=example.com)" ili "pass header.d=example.com" vadi domenu. */
export function resultDomain(value: string | null | undefined): string {
  const v = value ?? '';
  const m =
    v.match(/(?:header\.d|domain|d)\s*=\s*([A-Za-z0-9._-]+)/i) ??
    v.match(/@([A-Za-z0-9._-]+)/);
  return m ? m[1].toLowerCase().replace(/[>.,;]+$/, '') : '';
}

export function evaluateTrust(
  auth: AuthResults,
  trustedSealers: readonly string[] = DEFAULT_TRUSTED_ARC_SEALERS,
): TrustVerdict {
  const fromDomain = domainOfAddress(auth.fromHeader);
  const warnings: string[] = [];
  const reasons: string[] = [];

  const dkimPass = passed(auth.dkim);
  const spfPass = passed(auth.spf);
  const dkimDomain = resultDomain(auth.dkim);
  const spfDomain = resultDomain(auth.spf) || domainOfAddress(auth.spf);

  const dkimAligned = dkimPass && domainsAligned(dkimDomain || fromDomain, fromDomain);
  const spfAligned = spfPass && domainsAligned(spfDomain || fromDomain, fromDomain);

  if (dkimAligned) reasons.push('dkim_usklađen');
  if (spfAligned) reasons.push('spf_usklađen');

  if (dkimAligned || spfAligned) {
    return { level: 'T1', forcedConfidence: null, excludedFromBulk: false, warnings, reasons };
  }

  // T2 — ARC od pouzdanog sealera uz uredan izvorni Authentication-Results.
  const arcPass = passed(auth.arc);
  const sealer = resultDomain(auth.arc);
  const sealerTrusted = arcPass && trustedSealers.some((s) => domainsAligned(sealer, s));
  const originalOk =
    /\b(dkim|spf)\s*=\s*pass\b/i.test(auth.originalAuthResults ?? '') ||
    /\bdmarc\s*=\s*pass\b/i.test(auth.originalAuthResults ?? '');

  if (sealerTrusted && originalOk) {
    reasons.push('arc_pouzdani_sealer');
    return { level: 'T2', forcedConfidence: null, excludedFromBulk: false, warnings, reasons };
  }

  // T3 — postoji barem neki signal, ali bez usklađenosti.
  const anySignal = dkimPass || spfPass || arcPass || passed(auth.dmarc);
  if (anySignal) {
    if (sealerTrusted && !originalOk) warnings.push('arc_bez_urednog_izvornika');
    warnings.push('posiljatelj_djelomicno_provjeren');
    reasons.push('djelomicni_signali');
    return { level: 'T3', forcedConfidence: null, excludedFromBulk: false, warnings, reasons };
  }

  warnings.push('posiljatelj_neprovjeren');
  reasons.push('bez_signala');
  return { level: 'T4', forcedConfidence: 'niska', excludedFromBulk: true, warnings, reasons };
}

/** Je li poruka kriptografski potvrđena kao Googleova (za Gmail verifikaciju). */
export function isAuthenticatedGoogle(auth: AuthResults): boolean {
  const verdict = evaluateTrust({ ...auth });
  if (verdict.level !== 'T1') return false;
  return domainsAligned(domainOfAddress(auth.fromHeader), 'google.com');
}
