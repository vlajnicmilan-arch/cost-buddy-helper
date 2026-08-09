/**
 * MAIL UVOZ — SLOJ DOPUNE IZ PAMĆENJA IZDAVATELJA I MJESTA.
 *
 * Čista funkcija (bez baze) — worker joj preda već pročitane retke
 * `mail_issuer_memory`. Zove se IZMEĐU jeftine klasifikacije i odluke o AI
 * pozivu: pogodak iz pamćenja popunjava rupe pa `needsAiEnrichment` često
 * ugasi AI poziv.
 *
 * TVRDA PRAVILA:
 *  - NIKAD ne gazi neprazno polje — determinizam i AI-prije-nas pobjeđuju.
 *  - DVIJE RAZINE: točan ključ (domena + OIB + šifra mjesta) daje OIB/naziv
 *    I oznaku mjesta; fallback (place_code = '') daje SAMO OIB/naziv.
 *    Oznaka mjesta na fallbacku NIKAD — brana Solin ≠ Split.
 *  - Nejednoznačno pamćenje (više različitih OIB-a među kandidatima) = ništa.
 *  - Pouzdanost se NE diže; stavka ostaje `na_pregledu`.
 */

export interface IssuerMemoryRow {
  from_domain: string;
  supplier_oib: string;
  place_code: string;
  supplier_name: string | null;
  place_label: string | null;
}

export interface MemoryFillInput {
  extraction: Record<string, unknown> | null;
  /** Šifra mjesta iz teksta ovog dokumenta (`''` kad je nema). */
  placeCode: string;
  /** Domena pošiljatelja; `''` kad je forwarder/vlastita domena (ključ pada na OIB). */
  fromDomain: string;
  rows: readonly IssuerMemoryRow[];
  /** UBL grana: sve je već deterministički poznato — smije se dobiti SAMO oznaka mjesta. */
  onlyPlaceLabel?: boolean;
}

export interface MemoryFillResult {
  extraction: Record<string, unknown>;
  applied: boolean;
  warnings: string[];
}

export const MEMORY_FILL_WARNING = 'dopunjeno_iz_zapamcenog';

const isBlank = (v: unknown): boolean => v === null || v === undefined || v === '';

export function memoryFill(input: MemoryFillInput): MemoryFillResult {
  const out: Record<string, unknown> = { ...(input.extraction ?? {}) };
  const placeCode = (input.placeCode ?? '').trim();
  // Šifra mjesta uvijek putuje uz stavku — `mail_item_confirm` je koristi kao
  // dio ključa pri učenju, neovisno o tome je li išta dopunjeno.
  if (placeCode) out.place_code = placeCode;

  const oib = String(out.supplier_oib ?? '').trim();
  const domain = (input.fromDomain ?? '').trim().toLowerCase();

  const candidates = input.rows.filter(
    (r) =>
      (domain !== '' && (r.from_domain ?? '').toLowerCase() === domain) ||
      (oib !== '' && r.supplier_oib === oib),
  );
  if (candidates.length === 0) return { extraction: out, applied: false, warnings: [] };

  const distinctOibs = new Set(candidates.map((r) => r.supplier_oib).filter((o) => o !== ''));
  if (distinctOibs.size > 1) return { extraction: out, applied: false, warnings: [] };

  const exact =
    placeCode === ''
      ? null
      : candidates.find((r) => r.place_code === placeCode) ?? null;

  let applied = false;

  if (!input.onlyPlaceLabel) {
    const identity = exact ?? candidates[0];
    if (isBlank(out.supplier_oib) && identity.supplier_oib) {
      out.supplier_oib = identity.supplier_oib;
      applied = true;
    }
    if (isBlank(out.supplier_name) && identity.supplier_name) {
      out.supplier_name = identity.supplier_name;
      applied = true;
    }
  }

  // Oznaka mjesta ISKLJUČIVO iz točnog ključa (domena/OIB + ista šifra mjesta).
  if (exact && exact.place_label && isBlank(out.place_label)) {
    out.place_label = exact.place_label;
    applied = true;
  }

  return { extraction: out, applied, warnings: applied ? [MEMORY_FILL_WARNING] : [] };
}

/**
 * FORWARDER BRANA. Kad korisnik račun PROSLIJEDI sa svoje adrese (gmail,
 * outlook, vlastita domena…), `from` više ne identificira IZDAVATELJA. Takvu
 * domenu ne smijemo koristiti kao ključ pamćenja — ključ pada na OIB.
 */
const FORWARDER_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com',
  'msn.com', 'yahoo.com', 'ymail.com', 'icloud.com', 'me.com', 'mac.com',
  'proton.me', 'protonmail.com', 'pm.me', 'tutanota.com', 'aol.com',
  'mail.com', 'gmx.com', 'gmx.net', 'zoho.com', 'yandex.com',
  'net.hr', 'inet.hr', 'vip.hr', 'tel.hr', 'email.t-com.hr',
]);

/** `"Ime <a@b.hr>"` → `b.hr`; prazno kad je forwarder ili vlastita domena. */
export function issuerKeyDomain(
  fromHeader: string | null | undefined,
  ownDomains: readonly string[] = [],
): string {
  const raw = String(fromHeader ?? '').replace(/^.*<|>.*$/g, '');
  const domain = (raw.split('@')[1] ?? '').trim().toLowerCase();
  if (!domain) return '';
  if (FORWARDER_DOMAINS.has(domain)) return '';
  if (ownDomains.some((d) => (d ?? '').trim().toLowerCase() === domain)) return '';
  return domain;
}
