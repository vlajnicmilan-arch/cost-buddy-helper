/**
 * MAIL UVOZ — IZLAZNI RAČUN NIJE TROŠAK.
 *
 * Kvar (rujan 2026): „Račun za predujam" koji je izdao vlastiti profil
 * (Tactura) kupcu trećoj strani došao je u red kao ulazni račun.
 *
 * Pravilo: prvi valjani OIB u dokumentu (zona izdavatelja, zaglavlje) je
 * vlastiti, a iza oznake kupca stoji DRUGI, tuđi OIB. Ulazni račun na kojem
 * je naš OIB samo kao kupac ne prolazi: tamo je prvi OIB dobavljačev.
 */
import { isValidOib } from './oib.ts';

export const OUTGOING_INVOICE = 'izlazni_racun';

const BUYER_MARKER =
  /\b(?:naziv\s+kupca|kupac|primatelj\s+ra[cč]una|buyer|bill\s+to|customer|k[aä]ufer|rechnungsempf[aä]nger)\b/i;

const normalize = (o: string | null | undefined) => (o ?? '').replace(/[^0-9]/g, '');

function oibsWithIndex(text: string): Array<{ oib: string; index: number }> {
  const out: Array<{ oib: string; index: number }> = [];
  const re = /\d{11}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (isValidOib(m[0])) out.push({ oib: m[0], index: m.index });
    re.lastIndex = m.index + 1;
  }
  return out;
}

export function detectOutgoingInvoice(
  text: string | null | undefined,
  ownOibs: readonly (string | null | undefined)[],
): { outgoing: boolean; issuerOib: string | null; buyerOib: string | null } {
  const none = { outgoing: false, issuerOib: null, buyerOib: null };
  const own = new Set(ownOibs.map(normalize).filter((o) => o.length === 11));
  const haystack = text ?? '';
  if (own.size === 0 || haystack.trim() === '') return none;

  const found = oibsWithIndex(haystack);
  if (found.length === 0 || !own.has(found[0].oib)) return none;

  const marker = BUYER_MARKER.exec(haystack);
  if (!marker || marker.index < found[0].index) return none;

  const buyer = found.find((f) => f.index > marker.index && !own.has(f.oib));
  if (!buyer) return none;
  return { outgoing: true, issuerOib: found[0].oib, buyerOib: buyer.oib };
}

/** Vlastiti OIB nikad nije dobavljač — vraća kopiju s očišćenim poljem. */
export function stripOwnSupplierOib(
  extraction: Record<string, unknown> | null,
  ownOibs: readonly (string | null | undefined)[],
): { extraction: Record<string, unknown> | null; stripped: boolean } {
  if (!extraction) return { extraction, stripped: false };
  const own = new Set(ownOibs.map(normalize).filter((o) => o.length === 11));
  const current = normalize(extraction.supplier_oib as string | null);
  if (current.length !== 11 || !own.has(current)) return { extraction, stripped: false };
  return { extraction: { ...extraction, supplier_oib: null }, stripped: true };
}

export const OWN_OIB_NOT_SUPPLIER_WARNING = 'vlastiti_oib_nije_dobavljac';
