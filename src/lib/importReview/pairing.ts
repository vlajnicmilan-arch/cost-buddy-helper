/**
 * UVOZ IZVODA — UPARIVANJE S PRIJENOSOM KOJI VEĆ STOJI U KNJIGAMA.
 *
 * Izdvojeno iz `GlobalPDFImportHost` da dohvat kandidata i pozivi mečera stoje
 * na jednom mjestu i budu testirani bez Reacta. Odluka je čista funkcija
 * (`src/lib/transferPairMatch.ts`); ovdje je samo dohvat i prijevod redaka.
 *
 * Ništa se ne upisuje — rezultat je PRIJEDLOG u nacrtu pregleda uvoza.
 */

import {
  matchTransferPair,
  type TransferPairCandidate,
  type TransferPairMatch,
  type PairDirection,
} from '@/lib/transferPairMatch';
import { isCountedExpenseRow } from '@/lib/countedExpense';

/** Prozor dohvata — mečer ionako gleda ±3 dana, uzimamo dan viška. */
const FETCH_WINDOW_DAYS = 4;
const DAY_MS = 86_400_000;

const CUSTOM_SOURCE_RE = /^custom:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export const walletIdFromPaymentSource = (raw: unknown): string | null => {
  const m = CUSTOM_SOURCE_RE.exec(String(raw ?? ''));
  return m ? m[1].toLowerCase() : null;
};

export interface PairingSupabaseClient {
  from(table: string): any;
}

/**
 * Postojeći prijenosi korisnika u razdoblju izvoda (±4 dana). Greška nikad ne
 * ruši uvoz — vraća se prazan popis, pa uparivanja jednostavno nema.
 */
export async function loadTransferPairCandidates(
  supabase: PairingSupabaseClient,
  userId: string,
  dateIsos: readonly string[],
): Promise<readonly TransferPairCandidate[]> {
  const times = dateIsos.map((d) => Date.parse(d)).filter((t) => !Number.isNaN(t));
  if (times.length === 0) return [];
  const from = new Date(Math.min(...times) - FETCH_WINDOW_DAYS * DAY_MS).toISOString();
  const to = new Date(Math.max(...times) + FETCH_WINDOW_DAYS * DAY_MS).toISOString();

  try {
    const res = await supabase
      .from('expenses')
      .select(
        'id,date,amount,payment_source,income_source_id,bank_transaction_id,counterpart_bank_transaction_id,transfer_counterpart_origin,status',
      )
      .eq('user_id', userId)
      .eq('type', 'transfer')
      .gte('date', from)
      .lte('date', to);
    if (res?.error) return [];
    return ((res?.data ?? []) as any[])
      .filter((row) => isCountedExpenseRow(row))
      .map((row) => ({
        id: String(row.id),
        amount: Number(row.amount),
        date: String(row.date),
        payerWalletId: walletIdFromPaymentSource(row.payment_source),
        receiverWalletId: row.income_source_id ? String(row.income_source_id).toLowerCase() : null,
        bankTransactionId: row.bank_transaction_id ?? null,
        counterpartBankTransactionId: row.counterpart_bank_transaction_id ?? null,
        transferCounterpartOrigin: row.transfer_counterpart_origin ?? null,
      }));
  } catch {
    return [];
  }
}

export interface PairLookupRow {
  readonly amount: number;
  readonly dateIso: string;
  readonly direction: PairDirection | null;
  readonly counterpartWalletId?: string | null;
  readonly fingerprint?: string | null;
}

/** Bez smjera nema uparivanja — smjer je jedino po čemu se strana prepoznaje. */
export function resolvePairForRow(
  row: PairLookupRow,
  statementWalletId: string,
  candidates: readonly TransferPairCandidate[],
): TransferPairMatch {
  if (row.direction !== 'in' && row.direction !== 'out') return { kind: 'none' };
  return matchTransferPair({
    amount: row.amount,
    date: row.dateIso,
    statementWalletId: statementWalletId.toLowerCase(),
    direction: row.direction,
    counterpartWalletId: row.counterpartWalletId ?? null,
    fingerprint: row.fingerprint ?? null,
    candidates,
  });
}
