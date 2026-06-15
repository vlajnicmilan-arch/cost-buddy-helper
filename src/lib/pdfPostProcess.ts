/**
 * Post-process transactions extracted by the AI PDF/HTML/photo parser.
 *
 * AI ponekad interne prijenose ("Uplata gotovine na Aircash Tisak/INA",
 * "Uplata na Aircash - Visa *** 7262", "Revolut top up", ATM podizanja...)
 * klasificira ili kao `income` (gledano s računa koji prima novac) ili kao
 * `expense` (gledano s računa koji šalje novac). Oba su pogrešna — to su
 * interni prijenosi i moraju biti `transfer`, inače napuhuju prihode ili
 * rashode.
 *
 * CSV import to već rješava preko `isInternalTransfer()`. Ovaj helper je
 * deterministički safety net koji se primjenjuje nakon AI outputa, ali prije
 * nego što transakcije uđu u UI/import. Postojeći `transfer` retci ostaju
 * netaknuti (AI ih često dobro pohvata).
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
