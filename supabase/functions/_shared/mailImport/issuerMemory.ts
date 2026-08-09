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
 *  - RAZRJEŠENJE VIŠE KANDIDATA: kad je heuristika našla više OIB kandidata u
 *    tekstu, presijeca ih se sa zapamćenim OIB-ima. Točno jedan u presjeku ⇒
 *    uzima se. Sigurno po konstrukciji: kandidat doslovno postoji u dokumentu.
 */

import { isPublicMailDomain } from './publicMailDomains.ts';

export interface IssuerMemoryRow {
  from_domain: string;
  supplier_oib: string;
  place_code: string;
  supplier_name: string | null;
  place_label: string | null;
  /** Koliko je puta korisnik potvrdio ovog izdavatelja (za oznaku „Poznat"). */
  confirmed_count?: number | null;
  /** Dosad viđeni IBAN-i TOG izdavatelja (anti-spoofing). */
  known_ibans?: string[] | null;
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
  /** Valjani OIB kandidati iz dokumenta kad heuristika nije mogla odlučiti. */
  oibCandidates?: readonly string[];
}

export interface MemoryFillResult {
  extraction: Record<string, unknown>;
  applied: boolean;
  warnings: string[];
  /** >0 kad je izdavatelj prepoznat iz pamćenja (broj korisnikovih potvrda). */
  issuerConfirmedCount: number;
  /** Dosad viđeni IBAN-i prepoznatog izdavatelja. */
  knownIbans: string[];
}

export const MEMORY_FILL_WARNING = 'dopunjeno_iz_zapamcenog';

const isBlank = (v: unknown): boolean => v === null || v === undefined || v === '';

export function memoryFill(input: MemoryFillInput): MemoryFillResult {
  const out: Record<string, unknown> = { ...(input.extraction ?? {}) };
  const placeCode = (input.placeCode ?? '').trim();
  // Šifra mjesta uvijek putuje uz stavku — `mail_item_confirm` je koristi kao
  // dio ključa pri učenju, neovisno o tome je li išta dopunjeno.
  if (placeCode) out.place_code = placeCode;

  const domain = issuerKeyDomainValue(input.fromDomain);
  let oib = String(out.supplier_oib ?? '').trim();
  let applied = false;

  // RAZRJEŠENJE VIŠE KANDIDATA — presjek dokumenta i pamćenja.
  if (!oib && !input.onlyPlaceLabel && (input.oibCandidates?.length ?? 0) > 1) {
    const remembered = new Set(
      input.rows.map((r) => (r.supplier_oib ?? '').trim()).filter((o) => o !== ''),
    );
    const hits = [...new Set((input.oibCandidates ?? []).filter((c) => remembered.has(c)))];
    if (hits.length === 1) {
      oib = hits[0];
      out.supplier_oib = oib;
      applied = true;
    }
  }

  const candidates = input.rows.filter(
    (r) =>
      (domain !== '' && (r.from_domain ?? '').toLowerCase() === domain) ||
      (oib !== '' && r.supplier_oib === oib),
  );
  if (candidates.length === 0) {
    return {
      extraction: out,
      applied,
      warnings: applied ? [MEMORY_FILL_WARNING] : [],
      issuerConfirmedCount: 0,
      knownIbans: [],
    };
  }

  const distinctOibs = new Set(candidates.map((r) => r.supplier_oib).filter((o) => o !== ''));
  if (distinctOibs.size > 1) {
    return {
      extraction: out,
      applied,
      warnings: applied ? [MEMORY_FILL_WARNING] : [],
      issuerConfirmedCount: 0,
      knownIbans: [],
    };
  }

  const exact =
    placeCode === ''
      ? null
      : candidates.find((r) => r.place_code === placeCode) ?? null;

  const identity = exact ?? candidates[0];

  if (!input.onlyPlaceLabel) {
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

  // POZNAT IZDAVATELJ — samo kad se identitet dokumenta poklapa s pamćenjem.
  const finalOib = String(out.supplier_oib ?? '').trim();
  const knownIssuer = finalOib !== '' && identity.supplier_oib === finalOib;
  const confirmedCount = knownIssuer
    ? candidates
        .filter((r) => r.supplier_oib === finalOib)
        .reduce((sum, r) => sum + (r.confirmed_count ?? 0), 0)
    : 0;
  const knownIbans = knownIssuer
    ? [
        ...new Set(
          candidates
            .filter((r) => r.supplier_oib === finalOib)
            .flatMap((r) => r.known_ibans ?? []),
        ),
      ]
    : [];

  if (confirmedCount > 0) out.issuer_confirmed_count = confirmedCount;

  return {
    extraction: out,
    applied,
    warnings: applied ? [MEMORY_FILL_WARNING] : [],
    issuerConfirmedCount: confirmedCount,
    knownIbans,
  };
}

const issuerKeyDomainValue = (domain: string | null | undefined): string => {
  const value = String(domain ?? '').trim().toLowerCase();
  return isPublicMailDomain(value) ? '' : value;
};

/**
 * FORWARDER BRANA. Kad korisnik račun PROSLIJEDI sa svoje adrese (gmail,
 * outlook, vlastita domena…), `from` više ne identificira IZDAVATELJA. Takvu
 * domenu ne smijemo koristiti kao ključ pamćenja — ključ pada na OIB.
 * Lista javnih domena živi u `publicMailDomains.ts` (dijeli je i SQL upis).
 */
export function issuerKeyDomain(
  fromHeader: string | null | undefined,
  ownDomains: readonly string[] = [],
): string {
  const raw = String(fromHeader ?? '').replace(/^.*<|>.*$/g, '');
  const domain = (raw.split('@')[1] ?? '').trim().toLowerCase();
  if (!domain) return '';
  if (isPublicMailDomain(domain)) return '';
  if (ownDomains.some((d) => (d ?? '').trim().toLowerCase() === domain)) return '';
  return domain;
}
