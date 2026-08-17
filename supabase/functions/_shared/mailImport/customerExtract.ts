/**
 * MAIL UVOZ — KUPAC (primatelj računa) IZ SADRŽAJA DOKUMENTA.
 *
 * Isti obrazac kao sken računa: prvo DETERMINISTIČKI iz teksta, AI je samo
 * dopuna za rupe. Kupac je pravna činjenica na dokumentu — iz njega se poslije
 * izvodi odredište (`receiptBusinessRouting`), pa se smije tvrditi SAMO
 * nedvosmisleno; inače polje ostaje prazno i kartica pošteno pokazuje „—".
 *
 * Modul je čist: bez mreže, bez Deno/DOM ovisnosti.
 */

import { findValidOibs } from './oib.ts';
import { findValidIbans } from './ibanCheck.ts';

export interface CustomerExtractResult {
  recipient_oib: string | null;
  recipient_name: string | null;
}

/** Uklanja pojavu IBAN-a iz teksta (IBAN nosi niz znamenki koji glumi OIB). */
const stripIban = (text: string, iban: string): string => {
  const spaced = iban.split('').join('[\\s-]*');
  return text.replace(new RegExp(spaced, 'gi'), ' ');
};

/** Pravni oblik u nazivu = pouzdan znak da je redak naziv tvrtke. */
const LEGAL_FORM_RE = /(j\.?\s?d\.?\s?o\.?\s?o|d\.?\s?o\.?\s?o|d\.?\s?d\.?|obrt|k\.?\s?d\.?|gmbh|ltd|llc|inc)\b/i;

/** Oznake retka koji nosi kupca u hrvatskim i engleskim ispisima. */
const CUSTOMER_LABEL_RE =
  /^\s*(obveznik|kupac|platitelj|primatelj|naru[cč]itelj|naziv|buyer|customer|bill\s*to)\s*[:\-]\s*(.+)$/i;

/** „612111 - AKROBAT J.D.O.O." → „AKROBAT J.D.O.O."; „naziv: X" → „X". */
export const cleanCustomerName = (raw: string): string => {
  let s = raw.trim();
  const labeled = s.match(CUSTOMER_LABEL_RE);
  if (labeled) s = labeled[2].trim();
  // Vodeća šifra partnera („612111 - ", „436 ") nije dio naziva.
  s = s.replace(/^\d{2,10}\s*[-–—]\s*/, '').trim();
  s = s.replace(/[;,]+$/, '').trim();
  return s;
};

const looksLikeName = (line: string): boolean => {
  const s = cleanCustomerName(line);
  if (s.length < 3 || s.length > 120) return false;
  if (/^[\d\s.,:;/-]+$/.test(s)) return false;
  return LEGAL_FORM_RE.test(s);
};

/**
 * KUPAC = jedan od vlastitih OIB-a pronađen u tekstu. Naziv se traži u
 * PROZORU oko tog OIB-a (računi ga ispisuju neposredno iznad), a tek onda po
 * oznaci retka („Kupac:", „Obveznik:").
 */
export function extractCustomer(params: {
  text: string;
  ownOibs: readonly (string | null | undefined)[];
}): CustomerExtractResult {
  let haystack = params.text ?? '';
  for (const iban of findValidIbans(haystack)) haystack = stripIban(haystack, iban);

  const own = new Set(
    (params.ownOibs ?? [])
      .map((o) => (o ?? '').replace(/[^0-9]/g, ''))
      .filter((o) => o.length === 11),
  );
  const matched = [...new Set(findValidOibs(haystack).filter((o) => own.has(o)))];
  const recipientOib = matched.length === 1 ? matched[0] : null;

  const lines = haystack.split(/\r?\n/);

  // 1) Naziv iz prozora iznad/ispod retka s OIB-om kupca.
  if (recipientOib) {
    const idx = lines.findIndex((l) => l.replace(/[^0-9]/g, '').includes(recipientOib));
    if (idx >= 0) {
      const from = Math.max(0, idx - 8);
      const window = [...lines.slice(from, idx).reverse(), ...lines.slice(idx + 1, idx + 4)];
      for (const line of window) {
        if (looksLikeName(line)) return { recipient_oib: recipientOib, recipient_name: cleanCustomerName(line) };
      }
    }
  }

  // 2) Redak s izričitom oznakom kupca — vrijednost na istom retku ili prva
  //    smislena ispod nje („Obveznik:" pa naziv u sljedećim redcima).
  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].match(CUSTOMER_LABEL_RE);
    if (!m) continue;
    const inline = cleanCustomerName(m[2]);
    if (inline.length >= 3 && !/^[\d\s.,:;/-]+$/.test(inline)) {
      return { recipient_oib: recipientOib, recipient_name: inline };
    }
    for (const next of lines.slice(i + 1, i + 4)) {
      if (looksLikeName(next)) {
        return { recipient_oib: recipientOib, recipient_name: cleanCustomerName(next) };
      }
    }
  }

  return { recipient_oib: recipientOib, recipient_name: null };
}

/** AI smije popuniti SAMO rupu; deterministički nalaz se nikad ne gazi. */
export function mergeCustomer(
  deterministic: CustomerExtractResult,
  aiExtraction: Record<string, unknown> | null | undefined,
): CustomerExtractResult {
  const ai = aiExtraction ?? {};
  const aiOibDigits = String(ai.recipient_oib ?? '').replace(/[^0-9]/g, '');
  const aiName = String(ai.recipient_name ?? '').trim();
  return {
    recipient_oib: deterministic.recipient_oib ?? (aiOibDigits.length === 11 ? aiOibDigits : null),
    recipient_name: deterministic.recipient_name ?? (aiName.length > 0 ? cleanCustomerName(aiName) : null),
  };
}
