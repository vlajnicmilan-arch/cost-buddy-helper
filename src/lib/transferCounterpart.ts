/**
 * PROTUSTRANA PRIJENOSA — je li druga strana DRUGI korisnikov novčanik.
 *
 * Isti modul koristi bankovna sinkronizacija (upis prijenosa s obje strane)
 * i uvoz izvoda (PREDODABIR cilja u pregledu; ništa se ne upisuje bez
 * „Potvrdi uvoz").
 *
 * Pravila koja se ne pregovaraju:
 *  - Odredište je sigurno SAMO kad je točno JEDAN novčanik kandidat.
 *  - Novčanik čiji se izvod obrađuje nikad nije kandidat.
 *  - Broj kartice je jači signal od imena; ime je rezerva.
 *
 * Zrcalo za edge funkcije: `supabase/functions/_shared/transferCounterpart.ts`.
 * Jezgra između SHARED CORE markera mora biti identična u obje datoteke —
 * čuva ju `transferCounterpartMirror.test.ts`.
 */

// ---------------- SHARED CORE START ----------------

/** Korisnikov novčanik — kandidat za drugu stranu prijenosa. */
export interface WalletRef {
  readonly id: string;
  readonly name: string | null;
}

export type OwnTransferResolution =
  | { readonly kind: 'own_transfer'; readonly counterpartSourceId: string; readonly signal: 'card' | 'name' }
  | { readonly kind: 'ambiguous'; readonly matches: readonly string[] }
  | { readonly kind: 'none' };

/** Odsijeca sve iza maske kartice (npr. „Revolut**5385* Dublin" → „Revolut**5385*"). */
const MASK_CUT =
  /(\d{6}\s*[x\*\u2022\.\-\s]{4,10}\d{4}|[\*\u2022]{2,}\s*\d{4}\*?|(?:kartica|kartice|card)\s*[:\-]?\s*[^\dA-Za-z]{0,6}\d{4})/i;

/**
 * Normalizirano ime protustrane — jedini ključ po kojem se spaja.
 * Uzima dio prije „ - ", odsijeca sve iza maske kartice, pa briše sve
 * što nije slovo ili znamenka i spušta u mala slova.
 *
 * „Revolut**5385* Dublin" i „Revolut**5385* - 462765XXXXXX2081," → „revolut5385".
 */
export function normalizeCounterparty(input: string | null | undefined): string {
  let s = String(input ?? '').trim();
  if (!s) return '';
  const dash = s.indexOf(' - ');
  if (dash > 0) s = s.slice(0, dash);
  const m = MASK_CUT.exec(s);
  if (m && m.index !== undefined) s = s.slice(0, m.index + m[0].length);
  return s.toLowerCase().replace(/[^a-z0-9\u00e0-\u017f]+/gi, '');
}

const plainName = (value: string | null | undefined): string =>
  String(value ?? '').toLowerCase().replace(/[^a-z0-9\u00e0-\u017f]+/gi, '');

/** Prva značajna riječ imena novčanika („Revolut biznis" → „revolut"). */
const firstToken = (value: string | null | undefined): string => {
  const tokens = String(value ?? '')
    .toLowerCase()
    .split(/[^a-z0-9\u00e0-\u017f]+/i)
    .filter((t) => t.length >= 4);
  return tokens[0] ?? '';
};

/**
 * Je li protustrana DRUGI korisnikov novčanik.
 *
 * Redom: (a) broj kartice, (b) normalizirano ime novčanika sadržano u
 * normaliziranom imenu protustrane. Odredište je sigurno samo kad je točno
 * JEDAN novčanik kandidat; novčanik čiji se izvod obrađuje nije kandidat.
 */
export function resolveOwnTransferCounterpart(input: {
  readonly syncPaymentSourceId: string;
  readonly cardPaymentSourceId?: string | null;
  readonly counterpartyText?: string | null;
  readonly wallets?: readonly WalletRef[];
}): OwnTransferResolution {
  const sync = String(input.syncPaymentSourceId ?? '');
  const cardSource = input.cardPaymentSourceId ?? null;
  if (cardSource && cardSource !== sync) {
    return { kind: 'own_transfer', counterpartSourceId: cardSource, signal: 'card' };
  }

  const haystack = normalizeCounterparty(input.counterpartyText ?? '');
  if (!haystack) return { kind: 'none' };

  const matches = (input.wallets ?? [])
    .filter((w) => w.id !== sync)
    .filter((w) => {
      const full = plainName(w.name);
      if (full.length >= 3 && haystack.includes(full)) return true;
      const token = firstToken(w.name);
      return token.length >= 4 && haystack.includes(token);
    })
    .map((w) => w.id);

  if (matches.length === 1) return { kind: 'own_transfer', counterpartSourceId: matches[0], signal: 'name' };
  if (matches.length > 1) return { kind: 'ambiguous', matches };
  return { kind: 'none' };
}

// ---------------- SHARED CORE END ----------------
