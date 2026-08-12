/**
 * IZVEDENO IME RETKA — jedini izvor imena za sužavanje kandidata i za obrazac
 * odgovora na pitanja.
 *
 * Prioritet: `merchantName` → `description`. `bank_raw_line` se NAMJERNO NE
 * koristi: nosi IBAN-e, šifre i reference koje mogu lažno stvoriti sličnost.
 *
 * Tehnički tokeni (UUID, IBAN, maskirana kartica, duge reference) se izbacuju
 * prije normalizacije — inače bi dva različita plaćanja s istom karticom
 * ispala "slična".
 *
 * Čisti modul — bez Reacta i IO-a.
 */

import { areMerchantsSimilar, normalizeMerchant } from '@/lib/duplicateDetection';
import { KNOWN_BANK_NAMES } from '@/lib/mail/statementSignals';
import { isTechnicalToken } from './describeRow';

export interface ComparableNameInput {
  readonly merchantName?: string | null;
  readonly description?: string | null;
  /** Izdavatelj izvoda; njegovo ime nije protustrana transakcije. */
  readonly statementBankName?: string | null;
}

/** Minimalna duljina riječi koja se smatra značajnom pri usporedbi imena. */
export const SIGNIFICANT_WORD_MIN_LENGTH = 3;

function cleanTechnical(raw: string): string {
  return raw
    .split(/[,;]+/)
    .flatMap(part => part.split(/\s+/))
    .map(tok => tok.trim())
    .filter(tok => tok.length > 0 && !isTechnicalToken(tok))
    .join(' ');
}

/** `''` = redak nema upotrebljivo ime. */
export function deriveComparableName(input: ComparableNameInput): string {
  const merchant = cleanTechnical(input.merchantName ?? '');
  const issuerNames = input.statementBankName
    ? [input.statementBankName]
    : KNOWN_BANK_NAMES;
  const isStatementIssuer = merchant.length > 0
    && issuerNames.some((issuer) => areMerchantsSimilar(merchant, issuer));
  const fromMerchant = isStatementIssuer ? '' : normalizeMerchant(merchant);
  if (fromMerchant) return fromMerchant;
  return normalizeMerchant(cleanTechnical(input.description ?? ''));
}

/** Ima li ime barem jednu značajnu riječ (>= 3 znaka)? */
export function hasSignificantWord(name: string): boolean {
  if (!name) return false;
  return name.split(/\s+/).some(w => w.length >= SIGNIFICANT_WORD_MIN_LENGTH);
}
