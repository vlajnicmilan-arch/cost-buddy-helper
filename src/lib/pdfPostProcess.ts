/**
 * Post-process transactions extracted by the AI PDF/HTML/photo parser.
 *
 * Dva smjera korekcije:
 *
 * 1. AI ponekad interne prijenose ("Uplata gotovine na Aircash Tisak/INA",
 *    "Uplata na Aircash - Visa *** 7262", "Revolut top up", ATM podizanja...)
 *    klasificira kao `income` ili `expense`. To su zapravo `transfer`, inače
 *    napuhuju prihode ili rashode.
 *
 * 2. AI ponekad PLAĆANJA preko digitalnih novčanika ("Aircash Pay Jadrolinija",
 *    "Aircash Pay <bilo koji trgovac>") krivo označi kao `transfer`. To NIJE
 *    interni prijenos — to je vanjsko trošenje novca i mora biti `expense`.
 *
 * CSV import keyword check (`isInternalTransfer()`) je primaran; ovaj helper
 * je deterministički safety net nakon AI outputa, prije UI/importa.
 */
import { isInternalTransfer } from './csvParsers';

export interface ReclassifiableTransaction {
  type: string;
  description?: string | null;
}

/**
 * Pattern koji jednoznačno znači plaćanje preko Aircasha (NIJE interni
 * prijenos): "Aircash Pay <trgovac>". Lowercase + word boundary kako ne bi
 * pokupio nešto kao "Aircash Payback" ili sl.
 */
const EXTERNAL_PAYMENT_RE = /\baircash\s+pay\b/i;

function isExternalPayment(desc: string): boolean {
  return EXTERNAL_PAYMENT_RE.test(desc);
}

/**
 * Vrati novi array s ispravljenim tipovima:
 *   - `income`/`expense` čiji opis odgovara `isInternalTransfer()` → `transfer`
 *   - `transfer` čiji opis odgovara `isExternalPayment()` → `expense`
 * Ne mutira ulaz.
 */
export function reclassifyInternalTransfers<T extends ReclassifiableTransaction>(
  transactions: T[],
): T[] {
  return transactions.map((tx) => {
    const desc = tx.description ?? '';
    if (!desc) return tx;

    if (tx.type === 'transfer') {
      if (isExternalPayment(desc)) {
        return { ...tx, type: 'expense' as T['type'] };
      }
      return tx;
    }

    if (tx.type !== 'income' && tx.type !== 'expense') return tx;
    if (!isInternalTransfer(desc)) return tx;
    // Sigurnosni izlaz: ako keyword (npr. "uplata gotovine") slučajno upadne
    // u "Aircash Pay ..." red, vanjsko plaćanje uvijek pobjeđuje.
    if (isExternalPayment(desc)) return tx;
    return { ...tx, type: 'transfer' as T['type'] };
  });
}
