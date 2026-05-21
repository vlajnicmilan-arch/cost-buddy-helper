/**
 * Hybrid bank-first model — odlučuje početni `bank_match_status` za novi expense red.
 *
 * Konceptualni model:
 *   Banka  = istina o novcu       → bank_only / confirmed
 *   Račun  = istina o sadržaju    → samo enrichment, ne mijenja status
 *   Ručno  = privremeno           → manual ili pending_bank
 *
 * `bank_sync` izvor NE ide kroz ovaj helper — odluku donosi edge funkcija
 * (`bank-sync-transactions`) prema match logici (0/1/N kandidata).
 */

export type BankMatchStatus = 'manual' | 'pending_bank' | 'confirmed' | 'bank_only';

export type ExpenseEntrySource = 'manual' | 'csv' | 'pdf' | 'recurring' | 'ocr';

export interface GetInitialBankMatchStatusInput {
  /** Tko stvara expense. */
  source: ExpenseEntrySource;
  /**
   * Vrijednost iz `expenses.payment_source`. Tipično `custom:UUID`, ali može biti i
   * `cash`, `other`, ili NULL kod novih nedovršenih unosa.
   */
  paymentSource: string | null | undefined;
  /**
   * Skup ID-eva (UUID stringovi) `custom_payment_sources` koji su preko
   * `bank_accounts.linked_payment_source_id` povezani na aktivnu bank konekciju
   * u korisnikovom trenutnom kontekstu (osobno ili konkretna tvrtka).
   */
  bankLinkedSourceIds: ReadonlySet<string>;
}

/** Provjerava je li payment_source u formatu `custom:UUID` koji bi mogao biti vezan na banku. */
function extractCustomSourceId(paymentSource: string | null | undefined): string | null {
  if (!paymentSource) return null;
  if (paymentSource.startsWith('custom:')) {
    const id = paymentSource.slice(7);
    return id.length > 0 ? id : null;
  }
  return null;
}

export function getInitialBankMatchStatus(
  input: GetInitialBankMatchStatusInput,
): Exclude<BankMatchStatus, 'confirmed'> {
  const { source, paymentSource, bankLinkedSourceIds } = input;

  // CSV/PDF uvoz = bankovni izvod = potvrda novca, ali bez bank_transaction_id sa API-ja.
  if (source === 'csv' || source === 'pdf') {
    return 'bank_only';
  }

  // Recurring auto-generate — nikad ne čeka banku, sustavski je generirano.
  if (source === 'recurring') {
    return 'manual';
  }

  // manual i ocr koriste istu logiku: status ovisi o payment_source.
  // (Račun je samo enrichment — payment_source diktira čeka li bank potvrdu.)
  const customId = extractCustomSourceId(paymentSource);
  if (customId && bankLinkedSourceIds.has(customId)) {
    return 'pending_bank';
  }

  return 'manual';
}
