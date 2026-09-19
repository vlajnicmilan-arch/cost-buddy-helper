/**
 * Zrcalo `src/lib/transferPairMatch.ts` za edge funkcije.
 * Jezgru između SHARED CORE markera čuva `transferPairMatchMirror.test.ts`.
 */

// ---------------- SHARED CORE START ----------------

export type PairDirection = 'in' | 'out';

/** Postojeći prijenos u knjigama (type='transfer', deleted_at null). */
export interface TransferPairCandidate {
  readonly id: string;
  readonly amount: number;
  /** ISO datum ili timestamp. */
  readonly date: string;
  /** UUID novčanika koji plaća (iz `payment_source` = `custom:<uuid>`). */
  readonly payerWalletId: string | null;
  /** UUID novčanika koji prima (`income_source_id`). */
  readonly receiverWalletId: string | null;
  readonly bankTransactionId?: string | null;
  readonly counterpartBankTransactionId?: string | null;
  readonly transferCounterpartOrigin?: string | null;
}

export interface TransferPairInput {
  readonly amount: number;
  readonly date: string;
  /** Novčanik čiji se izvod obrađuje. */
  readonly statementWalletId: string;
  readonly direction: PairDirection;
  /** Druga strana ako je poznata iz kartice/imena; inače null. */
  readonly counterpartWalletId?: string | null;
  /** Otisak novog retka (fingerprint ili bankovni id). */
  readonly fingerprint?: string | null;
  readonly candidates: readonly TransferPairCandidate[];
}

export type TransferPairMatch =
  | {
      readonly kind: 'pair';
      readonly existingId: string;
      readonly payerWalletId: string;
      readonly receiverWalletId: string;
      /**
       * Postojeći redak je imao krivog platitelja (pogođen pravilom) —
       * `payerWalletId` je stvarni platitelj, ovo je onaj koji se mijenja.
       */
      readonly correctedPayerFrom?: string | null;
    }
  | { readonly kind: 'same_row'; readonly existingId: string }
  | { readonly kind: 'ambiguous'; readonly candidateIds: readonly string[] }
  | { readonly kind: 'none' };

const AMOUNT_EPSILON = 0.005;
const DATE_WINDOW_DAYS = 3;
const DAY_MS = 86_400_000;

const dayOf = (value: string): number | null => {
  const t = Date.parse(String(value ?? '').length === 10 ? `${value}T00:00:00Z` : String(value));
  if (Number.isNaN(t)) return null;
  return Math.floor(t / DAY_MS);
};

const withinWindow = (a: string, b: string): boolean => {
  const da = dayOf(a);
  const db = dayOf(b);
  if (da === null || db === null) return false;
  return Math.abs(da - db) <= DATE_WINDOW_DAYS;
};

const sameAmount = (a: number, b: number): boolean =>
  Math.abs(Math.abs(Number(a)) - Math.abs(Number(b))) <= AMOUNT_EPSILON;

/**
 * Je li novi redak druga strana prijenosa koji već stoji u knjigama.
 */
export function matchTransferPair(input: TransferPairInput): TransferPairMatch {
  const statement = String(input.statementWalletId ?? '');
  const counterpart = input.counterpartWalletId ?? null;
  const fingerprint = input.fingerprint ?? null;

  const inWindow = (input.candidates ?? []).filter(
    (c) => sameAmount(c.amount, input.amount) && withinWindow(c.date, input.date),
  );

  // Isti redak, ne par: otisak već stoji na kandidatu (bilo kojoj strani).
  if (fingerprint) {
    const same = inWindow.find(
      (c) => c.bankTransactionId === fingerprint || c.counterpartBankTransactionId === fingerprint,
    );
    if (same) return { kind: 'same_row', existingId: same.id };
  }

  const strict = inWindow.filter((c) => {
    if (input.direction === 'in') {
      if (c.receiverWalletId !== statement) return false;
      if (!c.payerWalletId || c.payerWalletId === statement) return false;
      return counterpart ? c.payerWalletId === counterpart : true;
    }
    if (c.payerWalletId !== statement) return false;
    if (!c.receiverWalletId || c.receiverWalletId === statement) return false;
    return counterpart ? c.receiverWalletId === counterpart : true;
  });

  if (strict.length === 1) {
    const c = strict[0];
    return {
      kind: 'pair',
      existingId: c.id,
      payerWalletId: (input.direction === 'in' ? c.payerWalletId : statement) as string,
      receiverWalletId: (input.direction === 'in' ? statement : c.receiverWalletId) as string,
    };
  }
  if (strict.length > 1) return { kind: 'ambiguous', candidateIds: strict.map((c) => c.id) };

  // ISPRAVAK PLATITELJA — samo kad znamo pravu drugu stranu i kad je postojeći
  // redak nastao pogađanjem po naučenom pravilu.
  if (counterpart && input.direction === 'in') {
    const guessed = inWindow.filter(
      (c) =>
        c.receiverWalletId === statement &&
        !!c.payerWalletId &&
        c.payerWalletId !== statement &&
        c.payerWalletId !== counterpart &&
        c.transferCounterpartOrigin === 'rule',
    );
    if (guessed.length === 1) {
      const c = guessed[0];
      return {
        kind: 'pair',
        existingId: c.id,
        payerWalletId: counterpart,
        receiverWalletId: statement,
        correctedPayerFrom: c.payerWalletId,
      };
    }
    if (guessed.length > 1) return { kind: 'ambiguous', candidateIds: guessed.map((c) => c.id) };
  }

  return { kind: 'none' };
}

// ---------------- SHARED CORE END ----------------
