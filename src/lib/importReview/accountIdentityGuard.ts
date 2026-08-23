/**
 * BRANA IDENTITETA RAČUNA — izvod vs. odredišni novčanik.
 *
 * Tuđi izvod ne smije tiho ući u korisnikove knjige. Prije izvršenja uvoza
 * uspoređuje se identitet računa S IZVODA (IBAN iz zaglavlja ili broj računa)
 * s identitetom UPISANIM NA NOVČANIKU (`account_identifier`).
 *
 * Pravila:
 *  - oba postoje i razlikuju se → `mismatch` (uvoz staje, pita se korisnik)
 *  - jedan nedostaje → `unknown` (nema se što usporediti, ponašanje kao dosad)
 *  - jednaki → `match`
 *
 * Usporedba ide nad OČIŠĆENIM vrijednostima: valjan IBAN (mod-97) kroz
 * postojeći `sanitizeIban`, sve ostalo kroz `normalizeAccountKey`.
 */

import { sanitizeIban } from '@/lib/mailImport/iban';
import { normalizeAccountKey } from '@/lib/mail/statementSourceMatch';

export type AccountIdentityStatus = 'match' | 'mismatch' | 'unknown';

export interface AccountIdentityCheck {
  status: AccountIdentityStatus;
  /** Očišćeni identitet s izvoda (prazno kad ga nema). */
  statement: string;
  /** Očišćeni identitet novčanika (prazno kad ga nema). */
  wallet: string;
}

/** Najkraći niz koji uopće smije biti temelj usporedbe identiteta. */
const MIN_IDENTITY_CHARS = 6;

/** Očisti identitet: valjan IBAN ostaje IBAN, ostalo je normalizirani ključ. */
export function cleanAccountIdentity(value: string | null | undefined): string {
  const iban = sanitizeIban(value);
  if (iban) return iban;
  const key = normalizeAccountKey(value);
  return key.length >= MIN_IDENTITY_CHARS ? key : '';
}

export function checkAccountIdentity(
  statementIdentifier: string | null | undefined,
  walletIdentifier: string | null | undefined,
): AccountIdentityCheck {
  const statement = cleanAccountIdentity(statementIdentifier);
  const wallet = cleanAccountIdentity(walletIdentifier);
  if (!statement || !wallet) return { status: 'unknown', statement, wallet };
  return { status: statement === wallet ? 'match' : 'mismatch', statement, wallet };
}

/** Prikaz identiteta u pitanju: „LT4332…8687" — dovoljno da se prepozna razlika. */
export function maskAccountIdentity(value: string | null | undefined): string {
  const clean = cleanAccountIdentity(value) || normalizeAccountKey(value);
  if (clean.length <= 10) return clean;
  return `${clean.slice(0, 6)}…${clean.slice(-4)}`;
}
