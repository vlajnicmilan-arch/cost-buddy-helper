/**
 * MAIL UVOZ — USMJERAVANJE PO OIB-u PRIMATELJA.
 *
 * Dokument nosi OIB KUPCA (to smo mi). Ako je taj OIB jednog od korisnikovih
 * biznis profila, dokument pripada TOJ tvrtki. Tvrdimo SAMO nedvosmisleno:
 *  - točno 1 vlastiti OIB u tekstu → 'business_profile' + taj profil
 *  - 0 vlastitih                   → 'user' (osobno)
 *  - ≥2 vlastita                   → 'user' + upozorenje 'vise_vlastitih_oib'
 *
 * Atribucija (owner_user_id, kvota, obavijesti) se OVIME NE MIJENJA — ona
 * uvijek ostaje na vlasniku aliasa.
 */

import { findValidOibs } from './oib.ts';
import { findValidIbans } from './ibanCheck.ts';

export const MULTIPLE_OWN_OIB_WARNING = 'vise_vlastitih_oib';

export interface OwnOibEntry {
  oib: string;
  profileId: string;
}

export interface ScopeDecision {
  scopeType: 'user' | 'business_profile';
  scopeId: string;
  warnings: string[];
  /** OIB-i vlastitih tvrtki pronađeni u tekstu (dijagnostika/testovi). */
  matched: string[];
}

/** Uklanja pojavu IBAN-a iz teksta, tolerirajući razmake u ispisu. */
const stripIban = (text: string, iban: string): string => {
  const spaced = iban.split('').join('[\\s-]*');
  return text.replace(new RegExp(spaced, 'gi'), ' ');
};

export function resolveScope(params: {
  text: string;
  ownOibs: readonly OwnOibEntry[];
  /** Vlasnik aliasa — odredište kad usmjeravanje nije nedvosmisleno. */
  ownerId: string;
}): ScopeDecision {
  let haystack = params.text ?? '';
  for (const iban of findValidIbans(haystack)) haystack = stripIban(haystack, iban);

  const byOib = new Map<string, string>();
  for (const entry of params.ownOibs) {
    const digits = (entry.oib ?? '').replace(/[^0-9]/g, '');
    if (digits.length === 11 && entry.profileId) byOib.set(digits, entry.profileId);
  }

  const matched = [...new Set(findValidOibs(haystack).filter((o) => byOib.has(o)))];

  if (matched.length === 1) {
    return {
      scopeType: 'business_profile',
      scopeId: byOib.get(matched[0])!,
      warnings: [],
      matched,
    };
  }

  return {
    scopeType: 'user',
    scopeId: params.ownerId,
    warnings: matched.length > 1 ? [MULTIPLE_OWN_OIB_WARNING] : [],
    matched,
  };
}
