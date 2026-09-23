/**
 * Anonimizirani stvarni parovi (kolovoz 2026). Id-evi i vlasnik su izmišljeni;
 * iznosi, datumi, trgovci i kartice odgovaraju stvarnim parovima.
 */
import type { SameExpenseRow, CardWalletMap } from '@/lib/sameExpenseRule';

export const OWNER = 'aa000000-0000-4000-8000-000000000001';
export const OTHER = 'bb000000-0000-4000-8000-000000000002';
export const WALLET = 'custom:cc000000-0000-4000-8000-000000000003';
export const WALLET_2 = 'custom:dd000000-0000-4000-8000-000000000004';
export const CARD_TOKEN_7246 = 'card-7246';
export const CARD_PHYS_2081 = 'card-2081';
export const CARD_OTHER_WALLET = 'card-9999';

export const CARD_WALLETS: CardWalletMap = {
  [CARD_TOKEN_7246]: WALLET.slice('custom:'.length),
  [CARD_PHYS_2081]: WALLET.slice('custom:'.length),
  [CARD_OTHER_WALLET]: WALLET_2.slice('custom:'.length),
};

export const manual = (id: string, amount: number, date: string, merchantName: string | null, over: Partial<SameExpenseRow> = {}): SameExpenseRow => ({
  id, userId: OWNER, paymentSource: WALLET, type: 'expense', amount, date, merchantName,
  description: null, bankTransactionId: null, bankMatchStatus: 'pending_bank', origin: { kind: 'manual' }, ...over,
});

export const bank = (id: string, amount: number, date: string, counterparty: string, over: Partial<SameExpenseRow> = {}): SameExpenseRow => ({
  id, userId: OWNER, paymentSource: WALLET, type: 'expense', amount, date, merchantName: counterparty,
  description: counterparty, bankTransactionId: `bt-${id}`, bankMatchStatus: 'unmatched',
  bankRawLine: `${date} ${counterparty.toUpperCase()} -${amount.toFixed(2)}`,
  origin: { kind: 'sync', importedAt: `${date}T06:00:00Z` }, ...over,
});

export interface MustMatchPair { readonly name: string; readonly manual: SameExpenseRow; readonly bank: SameExpenseRow }

export const MUST_MATCH: readonly MustMatchPair[] = [
  { name: 'Baustoff 60,96 (kartice 7246/2081)',
    manual: manual('m-baustoff-1', 60.96, '2026-08-01', 'Baustoff + Metall', { description: 'Građevinski materijal (Knauf, profili)', cardId: CARD_TOKEN_7246, cardLast4: '7246' }),
    bank: bank('b-baustoff-1', 60.96, '2026-08-03', 'BAUSTOFF + METALL', { cardId: CARD_PHYS_2081, cardLast4: '2081' }) },
  { name: 'Petrol 113,87',
    manual: manual('m-petrol', 113.87, '2026-08-03', 'Petrol'),
    bank: bank('b-petrol', 113.87, '2026-08-05', 'PETROL BS 123 ZAGREB') },
  { name: 'Lignum 126,29',
    manual: manual('m-lignum', 126.29, '2026-08-07', 'Lignum'),
    bank: bank('b-lignum', 126.29, '2026-08-09', 'Lignum Gradevinski Mat') },
  { name: 'Baustoff 110,49',
    manual: manual('m-baustoff-2', 110.49, '2026-08-07', 'Baustoff + Metall'),
    bank: bank('b-baustoff-2', 110.49, '2026-08-09', 'BAUSTOFF + METALL') },
  { name: 'Aleta 7,65',
    manual: manual('m-aleta', 7.65, '2026-07-31', 'Aleta'),
    bank: bank('b-aleta', 7.65, '2026-08-02', 'Aleta P 1') },
  { name: 'Oluk 472,40 (ručni upisan nakon banke)',
    manual: manual('m-oluk', 472.4, '2026-08-12', 'Oluk Interijeri'),
    bank: bank('b-oluk', 472.4, '2026-08-12', 'Oluk') },
];
