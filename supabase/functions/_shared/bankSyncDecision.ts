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
}

/**
 * Traži već upisani redak koji je ISTA transakcija (proknjižena verzija onoga
 * što je već u bazi): iznos ±0,00, datum ±3 dana, ista kartica ili ista
 * protustrana. Više jednako dobrih kandidata → `null` (radije novi redak nego
 * kriva izmjena).
 */
export function pickMergeTarget(
  candidates: readonly MergeCandidateRow[],
  target: {
    readonly amount: number;
    readonly date: string;
    readonly cardId?: string | null;
    readonly description?: string | null;
  },
): MergeCandidateRow | null {
  const center = new Date(target.date).getTime();
  const desc = String(target.description ?? '').trim().toLowerCase();

  const viable = candidates.filter((c) => {
    if (Math.abs(Number(c.amount) - target.amount) > 0.005) return false;
    const days = Math.abs(new Date(c.date).getTime() - center) / 86400000;
    if (!(days <= 3)) return false;
    if (target.cardId && c.payment_source_card_id) {
      return c.payment_source_card_id === target.cardId;
    }
    if (desc) {
      return String(c.description ?? '').trim().toLowerCase() === desc;
    }
    return false;
  });

  if (viable.length !== 1) return null;
  return viable[0];
}
