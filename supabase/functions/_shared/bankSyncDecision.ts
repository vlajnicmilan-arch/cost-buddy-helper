/**
 * ODLUKA O BANKOVNOM RETKU — čista logika bankovne sinkronizacije.
 *
 * Nastalo iz incidenta 17.–18.9.2026: prijenos od 300 € upisan je DVAPUT kao
 * priljev jer su dvije REZERVACIJE iste transakcije stigle s različitim
 * ID-om i bile upisane kao konačni retci.
 *
 * Ovdje nema mreže ni baze — samo odluka, da je testovi mogu voziti izravno.
 * Smjer novca ide isključivo kroz `resolveBankTxDirection`, a platilac se
 * određuje brojem kartice (`cardMatch`), ne nazivom trgovca.
 */
import { resolveBankTxDirection } from './moneyDirection.ts';
import {
  describeCardMasks,
  extractCardMasks,
  matchUserCard,
  type CardMask,
  type UserCardRef,
} from './cardMatch.ts';

export interface EBTransactionLike {
  entry_reference?: string;
  transaction_id?: string;
  booking_date?: string;
  value_date?: string;
  transaction_amount?: { amount?: string; currency?: string };
  credit_debit_indicator?: string;
  remittance_information?: unknown;
  creditor?: { name?: string } | null;
  debtor?: { name?: string } | null;
  status?: string;
  [key: string]: unknown;
}

export interface DecisionContext {
  /** UUID `custom_payment_sources` reda na koji je bankovni račun spojen. */
  readonly syncPaymentSourceId: string;
  /** Sve korisnikove upisane kartice (uključujući „Wallet" brojeve). */
  readonly cards: readonly UserCardRef[];
}

export type SkipReason =
  | 'missing_id'
  | 'missing_amount'
  | 'missing_date'
  | 'reservation'
  | 'card_source_mismatch';

export interface BankSyncDecision {
  readonly action: 'upsert' | 'skip';
  readonly reason: SkipReason | 'ok';
  readonly stableId: string | null;
  readonly isReservation: boolean;
  readonly amount: number | null;
  readonly date: string | null;
  readonly description: string;
  readonly type: 'expense' | 'income' | null;
  readonly paymentSourceCardId: string | null;
  /**
   * Redak nosi broj DRUGE korisnikove kartice → kandidat za prijenos između
   * vlastitih novčanika. Drugu stranu upisuje tek točka 3 plana.
   */
  readonly transferCandidate: { readonly counterpartSourceId: string; readonly cardId: string } | null;
  /** Cijeli EB objekt + odluka aplikacije — ide u `bank_raw_line`. */
  readonly raw: Record<string, unknown>;
}

const BOOKED = new Set(['BOOK', 'BOOKED', 'BOOKING']);
const PENDING = new Set(['PDNG', 'PENDING', 'HOLD', 'INFO']);

/** Kratki ID bez dugog prefiksa (npr. `G1204340R918423D`) — samo signal u logu. */
export function looksLikeShortReservationId(id: string | null | undefined): boolean {
  const v = String(id ?? '').trim();
  return /^G[0-9A-Z]+R[0-9A-Z]+D$/i.test(v);
}

/** Rezervacija: primarno EB `status`, sekundarno prazan `booking_date`. */
export function isReservation(tx: EBTransactionLike): boolean {
  const status = String(tx.status ?? '').trim().toUpperCase();
  if (BOOKED.has(status)) return false;
  if (PENDING.has(status)) return true;
  return !tx.booking_date;
}

export function extractRemittance(tx: EBTransactionLike): string {
  const ri = tx.remittance_information;
  if (Array.isArray(ri)) {
    const parts = ri
      .map((r) => (typeof r === 'string' ? r : (r as { content?: string })?.content || ''))
      .filter(Boolean);
    if (parts.length > 0) return parts.join(' ');
  }
  return '';
}

/** Sav tekst retka u kojem može stajati maska kartice. */
export function cardSearchText(tx: EBTransactionLike): string {
  return [
    extractRemittance(tx),
    tx.creditor?.name ?? '',
    tx.debtor?.name ?? '',
    typeof tx.card_transaction === 'object' && tx.card_transaction
      ? JSON.stringify(tx.card_transaction)
      : '',
    typeof (tx as { masked_pan?: string }).masked_pan === 'string'
      ? (tx as { masked_pan?: string }).masked_pan
      : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function pickDescription(tx: EBTransactionLike, isIncome: boolean): string {
  const counterparty = isIncome ? tx.debtor?.name : tx.creditor?.name;
  const remittance = extractRemittance(tx);
  if (counterparty && counterparty.trim()) {
    if (remittance && !/^[\d\s\-\/]+$/.test(remittance)) {
      return `${counterparty} - ${remittance}`.slice(0, 200);
    }
    return counterparty;
  }
  if (remittance) return remittance.slice(0, 200);
  return 'Bank transaction';
}

export function pickStableId(tx: EBTransactionLike): string | null {
  return tx.entry_reference || tx.transaction_id || null;
}

export function decideBankSyncRow(
  tx: EBTransactionLike,
  ctx: DecisionContext,
): BankSyncDecision {
  const stableId = pickStableId(tx);
  const reservation = isReservation(tx);
  const masks: CardMask[] = extractCardMasks(cardSearchText(tx));
  const cardHit = matchUserCard(masks, ctx.cards);

  const base = {
    stableId,
    isReservation: reservation,
    masks: describeCardMasks(masks),
    short_id_signal: looksLikeShortReservationId(stableId),
  };

  const raw = (extra: Record<string, unknown>): Record<string, unknown> => ({
    provider: 'enable_banking',
    transaction: tx,
    decision: { ...base, ...extra },
  });

  if (!stableId) {
    return {
      action: 'skip', reason: 'missing_id', stableId: null, isReservation: reservation,
      amount: null, date: null, description: '', type: null, paymentSourceCardId: null,
      transferCandidate: null, raw: raw({ action: 'skip', reason: 'missing_id' }),
    };
  }

  const amountRaw = tx.transaction_amount?.amount;
  const parsed = amountRaw === undefined || amountRaw === null ? NaN : parseFloat(String(amountRaw));
  if (!isFinite(parsed) || parsed === 0) {
    return {
      action: 'skip', reason: 'missing_amount', stableId, isReservation: reservation,
      amount: null, date: null, description: '', type: null, paymentSourceCardId: null,
      transferCandidate: null, raw: raw({ action: 'skip', reason: 'missing_amount' }),
    };
  }
  const absAmount = Math.abs(parsed);

  const txDate = tx.booking_date || tx.value_date || null;
  if (!txDate) {
    return {
      action: 'skip', reason: 'missing_date', stableId, isReservation: reservation,
      amount: absAmount, date: null, description: '', type: null, paymentSourceCardId: null,
      transferCandidate: null, raw: raw({ action: 'skip', reason: 'missing_date' }),
    };
  }

  // REZERVACIJA — ne upisuje se, a njezinom indikatoru smjera se ne vjeruje.
  if (reservation) {
    return {
      action: 'skip', reason: 'reservation', stableId, isReservation: true,
      amount: absAmount, date: txDate, description: '', type: null, paymentSourceCardId: null,
      transferCandidate: null,
      raw: raw({ action: 'skip', reason: 'reservation', status: tx.status ?? null }),
    };
  }

  const dir = resolveBankTxDirection({
    creditDebitIndicator: tx.credit_debit_indicator,
    amount: amountRaw,
    creditorName: tx.creditor?.name,
    debtorName: tx.debtor?.name,
  });
  const isIncome = dir.direction === 'in';
  const description = pickDescription(tx, isIncome);

  const decisionCore = {
    action: 'upsert',
    reason: 'ok',
    direction: dir.direction,
    confidence: dir.confidence,
    direction_reason: dir.reason,
    card: cardHit,
  };

  // Broj kartice pripada DRUGOM korisnikovom novčaniku → ne upisujemo tiho.
  if (cardHit && cardHit.paymentSourceId !== ctx.syncPaymentSourceId) {
    return {
      action: 'skip', reason: 'card_source_mismatch', stableId, isReservation: false,
      amount: absAmount, date: txDate, description,
      type: isIncome ? 'income' : 'expense', paymentSourceCardId: null,
      transferCandidate: { counterpartSourceId: cardHit.paymentSourceId, cardId: cardHit.cardId },
      raw: raw({
        ...decisionCore,
        action: 'skip',
        reason: 'card_source_mismatch',
        needs_confirmation: true,
        sync_payment_source_id: ctx.syncPaymentSourceId,
      }),
    };
  }

  return {
    action: 'upsert', reason: 'ok', stableId, isReservation: false,
    amount: absAmount, date: txDate, description,
    type: isIncome ? 'income' : 'expense',
    paymentSourceCardId: cardHit ? cardHit.cardId : null,
    transferCandidate: null,
    raw: raw(decisionCore),
  };
}

export interface MergeCandidateRow {
  readonly id: string;
  readonly amount: number;
  readonly date: string;
  readonly payment_source_card_id?: string | null;
  readonly description?: string | null;
  /** Proknjiženi bankovni ID — ako postoji, redak je SVOJA transakcija. */
  readonly bank_transaction_id?: string | null;
  readonly bank_match_status?: string | null;
  readonly type?: string | null;
}

/** Odsijeca sve iza maske kartice (npr. „Revolut**5385* Dublin" → „Revolut**5385*"). */
const MASK_CUT =
  /(\d{6}\s*[x\*\u2022\.\-\s]{4,10}\d{4}|[\*\u2022]{2,}\s*\d{4}\*?|(?:kartica|kartice|card)\s*[:\-]?\s*[^\dA-Za-z]{0,6}\d{4})/i;

/**
 * Normalizirano ime protustrane — jedini ključ po kojem se spaja.
 * Uzima dio prije „ - ", odsijeca sve iza maske kartice, pa briše sve
 * što nije slovo ili znamenka i spušta u mala slova.
 *
 * „Revolut**5385* Dublin" i „Revolut**5385* - 462765XXXXXX2081," → „revolut5385".
 */
export function normalizeCounterparty(input: string | null | undefined): string {
  let s = String(input ?? '').trim();
  if (!s) return '';
  const dash = s.indexOf(' - ');
  if (dash > 0) s = s.slice(0, dash);
  const m = MASK_CUT.exec(s);
  if (m && m.index !== undefined) s = s.slice(0, m.index + m[0].length);
  return s.toLowerCase().replace(/[^a-z0-9\u00e0-\u017f]+/gi, '');
}

/** Ime protustrane iz EB objekta, s opisom kao rezervom. */
export function counterpartyOf(tx: EBTransactionLike, fallback?: string | null): string {
  const name = tx.creditor?.name || tx.debtor?.name || '';
  return normalizeCounterparty(name || fallback || '');
}

/**
 * Traži već upisani redak koji je ISTA transakcija (proknjižena verzija onoga
 * što je već u bazi): iznos ±0,005, datum ±3 dana, isto normalizirano ime
 * protustrane. Kartica, ako postoji na obje strane, mora se poklapati.
 *
 * Spaja se SAMO prema retku koji još nema svoj proknjiženi bankovni ID
 * (ručni, iz rezervacije, `manual`/`pending_bank`). Dvije legitimne uplate
 * istog iznosa u susjedne dane ostaju dva retka.
 */
export function pickMergeTarget(
  candidates: readonly MergeCandidateRow[],
  target: {
    readonly amount: number;
    readonly date: string;
    readonly cardId?: string | null;
    readonly counterparty?: string | null;
    /** Rezerva kad protustrana nije poznata iz EB objekta. */
    readonly description?: string | null;
  },
): MergeCandidateRow | null {
  const center = new Date(target.date).getTime();
  const wanted = normalizeCounterparty(target.counterparty ?? target.description ?? '');
  if (!wanted) return null;

  const viable = candidates.filter((c) => {
    // Redak s vlastitim proknjiženim ID-om je zasebna transakcija.
    if (c.bank_transaction_id) {
      const status = String(c.bank_match_status ?? '');
      if (status !== 'manual' && status !== 'pending_bank') return false;
    }
    if (Math.abs(Number(c.amount) - target.amount) > 0.005) return false;
    const days = Math.abs(new Date(c.date).getTime() - center) / 86400000;
    if (!(days <= 3)) return false;
    if (target.cardId && c.payment_source_card_id && c.payment_source_card_id !== target.cardId) {
      return false;
    }
    return normalizeCounterparty(c.description) === wanted;
  });

  if (viable.length !== 1) return null;
  return viable[0];
}

export interface EBBalanceLike {
  balance_type?: string;
  name?: string;
  balance_amount?: { amount?: string; currency?: string };
  reference_date?: string;
  [key: string]: unknown;
}

export interface PickedBankBalance {
  readonly amount: number;
  readonly currency: string | null;
  readonly balanceType: string | null;
  readonly referenceDate: string | null;
}

// Proknjiženi saldo ima prednost pred raspoloživim: CLBD/CLOSINGBOOKED, pa
// ITBD/INTERIMBOOKED (očekivani sirovi zapis ove banke), tek onda raspoloživi.
// Rezervacije se preskaču pri upisu, pa bi raspoloživi saldo (ITAV) u sidru
// dvaput odbio rezervaciju — jednom u sidru, jednom kad se proknjiži.
const BOOKED_CLOSED_BALANCE = ['CLBD', 'CLOSINGBOOKED'];
const BOOKED_INTERIM_BALANCE = ['ITBD', 'INTERIMBOOKED'];
const AVAILABLE_BALANCE = ['ITAV', 'XPCD', 'INTERIMAVAILABLE', 'EXPECTED'];

/** Proknjiženi saldo (CLBD, pa ITBD) ima prednost pred raspoloživim (ITAV/XPCD). */
export function pickBankBalance(
  balances: readonly EBBalanceLike[] | null | undefined,
): PickedBankBalance | null {
  const list = (balances ?? []).filter(Boolean);
  if (!list.length) return null;

  const key = (b: EBBalanceLike) =>
    String(b.balance_type ?? b.name ?? '').replace(/[^a-z]/gi, '').toUpperCase();

  const find = (wanted: readonly string[]) =>
    list.find((b) => wanted.includes(key(b)) && isFinite(parseFloat(String(b.balance_amount?.amount))));

  const chosen =
    find(BOOKED_CLOSED_BALANCE) ?? find(BOOKED_INTERIM_BALANCE) ?? find(AVAILABLE_BALANCE) ?? null;
  if (!chosen) return null;

  const amount = parseFloat(String(chosen.balance_amount?.amount));
  if (!isFinite(amount)) return null;

  return {
    amount: Math.round(amount * 100) / 100,
    currency: chosen.balance_amount?.currency ?? null,
    balanceType: String(chosen.balance_type ?? chosen.name ?? '') || null,
    referenceDate: chosen.reference_date ?? null,
  };
}

