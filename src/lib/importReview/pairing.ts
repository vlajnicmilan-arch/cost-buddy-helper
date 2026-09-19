/**
 * UVOZ IZVODA — UPARIVANJE S DRUGOM STRANOM KOJA VEĆ STOJI U KNJIGAMA.
 *
 * Izdvojeno iz `GlobalPDFImportHost` da dohvat kandidata i pozivi mečera stoje
 * na jednom mjestu i budu testirani bez Reacta. Odluka je čista funkcija
 * (`src/lib/transferPairMatch.ts`); ovdje je samo dohvat i prijevod redaka.
 *
 * Kandidati NISU samo prijenosi: obični primitak ili trošak na DRUGOM
 * novčaniku također može biti druga strana (npr. „nadoplata od Google Pay do
 * *1664"). Mečer ga prihvaća samo uz signal — broj korisnikove kartice ili
 * ključnu riječ prijenosa.
 *
 * Ništa se ne upisuje — rezultat je PRIJEDLOG u nacrtu pregleda uvoza.
 */

import {
  matchTransferPair,
  type TransferPairCandidate,
  type TransferPairMatch,
  type PairCandidateOrigin,
  type PairDirection,
} from '@/lib/transferPairMatch';
import { TRANSFER_KEYWORDS } from '@/lib/moneyDirection';
import { isCountedExpenseRow } from '@/lib/countedExpense';

/** Prozor dohvata — mečer ionako gleda ±3 dana, uzimamo dan viška. */
const FETCH_WINDOW_DAYS = 4;
const DAY_MS = 86_400_000;

const CUSTOM_SOURCE_RE = /^custom:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export const walletIdFromPaymentSource = (raw: unknown): string | null => {
  const m = CUSTOM_SOURCE_RE.exec(String(raw ?? ''));
  return m ? m[1].toLowerCase() : null;
};

/** Odakle je redak došao u knjige — samo za prikaz kandidata korisniku. */
export const candidateOriginOf = (row: {
  bank_raw_line_source?: unknown;
  import_batch_id?: unknown;
  bank_transaction_id?: unknown;
}): PairCandidateOrigin => {
  if (String(row.bank_raw_line_source ?? '') === 'enable_banking') return 'sync';
  if (row.import_batch_id || row.bank_transaction_id) return 'import';
  return 'manual';
};

export interface PairingSupabaseClient {
  from(table: string): any;
}

/**
 * Postojeći redci korisnika u razdoblju izvoda (±4 dana) koji mogu biti druga
 * strana prijenosa. Greška nikad ne ruši uvoz — vraća se prazan popis, pa
 * uparivanja jednostavno nema.
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
        'id,date,amount,type,description,payment_source,income_source_id,bank_transaction_id,counterpart_bank_transaction_id,transfer_counterpart_origin,bank_raw_line_source,import_batch_id,status',
      )
      .eq('user_id', userId)
      .in('type', ['transfer', 'income', 'expense'])
      .gte('date', from)
      .lte('date', to);
    if (res?.error) return [];
    return ((res?.data ?? []) as any[])
      .filter((row) => isCountedExpenseRow(row))
      .map((row) => ({
        id: String(row.id),
        amount: Number(row.amount),
        date: String(row.date),
        type: String(row.type ?? 'transfer'),
        description: row.description ?? null,
        walletId: walletIdFromPaymentSource(row.payment_source),
        payerWalletId: walletIdFromPaymentSource(row.payment_source),
        receiverWalletId: row.income_source_id ? String(row.income_source_id).toLowerCase() : null,
        bankTransactionId: row.bank_transaction_id ?? null,
        counterpartBankTransactionId: row.counterpart_bank_transaction_id ?? null,
        transferCounterpartOrigin: row.transfer_counterpart_origin ?? null,
        origin: candidateOriginOf(row),
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

export interface PairLookupOptions {
  /** Kandidati koje je u istoj seriji već uzeo raniji redak. */
  readonly claimedCandidateIds?: readonly string[];
  /** Zadnje 4 znamenke korisnikovih kartica. */
  readonly cardLast4?: readonly string[];
}

/** Bez smjera nema uparivanja — smjer je jedino po čemu se strana prepoznaje. */
export function resolvePairForRow(
  row: PairLookupRow,
  statementWalletId: string,
  candidates: readonly TransferPairCandidate[],
  options: PairLookupOptions = {},
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
    claimedCandidateIds: options.claimedCandidateIds ?? [],
    cardLast4: options.cardLast4 ?? [],
    transferKeywords: TRANSFER_KEYWORDS,
  });
}
