/**
 * SKEN RAČUNA — USMJERAVANJE PREMA POSLOVNOM PROFILU.
 *
 * Račun nosi podatke KUPCA. Ako je kupac jedna od korisnikovih tvrtki, trošak
 * pripada toj tvrtki, a ne osobnom profilu.
 *
 * Pravila (namjerno asimetrična — smjer ide SAMO prema poslovnom):
 *  - OIB kupca == OIB vlastite tvrtke  → 'auto'  (pravna činjenica, automatika ima pokriće)
 *  - nema OIB-a, ime kupca == naziv tvrtke (normalizirano) → 'offer' (korisnik presuđuje)
 *  - OIB postoji ali nije naš → 'none' (B2B račun tuđe firme; ni automatika ni ponuda)
 *  - korisnik je već u tom poslovnom profilu → 'none' (ništa se ne mijenja)
 *  - nikad se ne predlaže prelazak IZ poslovnog U osobno
 */

export interface RoutableBusinessProfile {
  id: string;
  name: string;
  oib?: string | null;
}

export type ReceiptRouting =
  | { kind: 'none' }
  | { kind: 'auto'; profileId: string; profileName: string }
  | { kind: 'offer'; profileId: string; profileName: string };

/** Samo znamenke; OIB je 11 znamenki, prefiks "HR" se odbacuje. */
export const normalizeOibDigits = (value: string | null | undefined): string | null => {
  const digits = (value ?? '').replace(/[^0-9]/g, '');
  return digits.length === 11 ? digits : null;
};

const LEGAL_SUFFIXES = [
  'j.d.o.o.', 'd.o.o.', 'd.d.', 'jdoo', 'doo', 'dd',
  'obrt', 'k.d.', 'kd', 'gmbh', 'ltd', 'llc', 'inc',
];

/** Normalizacija naziva: bez dijakritike, interpunkcije i pravnog oblika. */
export const normalizeCompanyName = (value: string | null | undefined): string => {
  let s = (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .trim();
  if (!s) return '';
  for (const suffix of LEGAL_SUFFIXES) {
    const idx = s.indexOf(suffix);
    if (idx > 0) s = s.slice(0, idx);
  }
  s = s.replace(/[^a-z0-9]+/g, ' ').trim();
  return s;
};

export const resolveReceiptBusinessRouting = (params: {
  recipientOib?: string | null;
  recipientName?: string | null;
  profiles: readonly RoutableBusinessProfile[];
  /** Profil u kojem korisnik trenutno radi (null = osobni). */
  activeBusinessProfileId?: string | null;
}): ReceiptRouting => {
  const { profiles, activeBusinessProfileId } = params;
  if (!profiles || profiles.length === 0) return { kind: 'none' };

  const oib = normalizeOibDigits(params.recipientOib);
  if (oib) {
    const hit = profiles.find((p) => normalizeOibDigits(p.oib) === oib);
    if (!hit) return { kind: 'none' };
    if (hit.id === activeBusinessProfileId) return { kind: 'none' };
    return { kind: 'auto', profileId: hit.id, profileName: hit.name };
  }

  const name = normalizeCompanyName(params.recipientName);
  if (!name) return { kind: 'none' };
  const matches = profiles.filter((p) => normalizeCompanyName(p.name) === name);
  if (matches.length !== 1) return { kind: 'none' };
  if (matches[0].id === activeBusinessProfileId) return { kind: 'none' };
  return { kind: 'offer', profileId: matches[0].id, profileName: matches[0].name };
};

/** Je li odabrani izvor plaćanja osoban u odnosu na ciljani poslovni profil. */
export const isPersonalSourceForProfile = (params: {
  customPaymentSourceId: string | null | undefined;
  sources: readonly { id: string; business_profile_id?: string | null }[];
  targetBusinessProfileId: string | null | undefined;
}): boolean => {
  const { customPaymentSourceId, sources, targetBusinessProfileId } = params;
  if (!targetBusinessProfileId || !customPaymentSourceId) return false;
  const found = sources.find((s) => s.id === customPaymentSourceId);
  if (!found) return false;
  return (found.business_profile_id ?? null) !== targetBusinessProfileId;
};

export type OwnerFundingChoice = 'owner_loan' | 'material' | 'personal';
