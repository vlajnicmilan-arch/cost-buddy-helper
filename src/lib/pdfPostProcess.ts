/**
 * Post-process transactions extracted by the AI PDF/HTML/photo parser.
 *
 * AI ponekad cash/wallet top-upove ("Uplata gotovine na Aircash Tisak",
 * "Uplata na Aircash - Visa *** 7262", "Revolut top up"...) klasificira kao
 * `income` jer s računa na koji ide novac to izgleda kao priljev. CSV import
 * to već rješava preko `isInternalTransfer()`, a PDF flow nije — pa interni
 * prijenosi završavaju kao prihod i napuhuju ukupni income.
 *
 * Ovaj helper je deterministički safety net koji se primjenjuje nakon AI
 * outputa, ali prije nego što transakcije uđu u UI/import. Ne pretvara
 * expense → transfer (banka legitimno ima outgoing transfere koje AI često
 * dobro pohvata kao `transfer`).
 */
import { isInternalTransfer } from './csvParsers';

export interface ReclassifiableTransaction {
  type: string;
  description?: string | null;
}

/**
 * Vrati novi array u kojem income transakcije s opisom koji odgovara
 * `isInternalTransfer()` listi keywordsa postaju `transfer`. Ostale
 * transakcije se vraćaju nepromijenjene. Ne mutira ulaz.
 */
export function reclassifyInternalTransfers<T extends ReclassifiableTransaction>(
  transactions: T[],
): T[] {
  return transactions.map((tx) => {
    if (tx.type !== 'income' && tx.type !== 'expense') return tx;
    const desc = tx.description ?? '';
    if (!desc) return tx;
    if (!isInternalTransfer(desc)) return tx;
    return { ...tx, type: 'transfer' as T['type'] };
  });
}
