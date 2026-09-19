/**
 * UPARIVANJE DVIJU STRANA JEDNOG PRIJENOSA.
 *
 * Isti novac se često pojavi dvaput: jednom s izvoda novčanika koji plaća,
 * jednom s izvoda novčanika koji prima (ili kao raniji ručni unos). Ovaj modul
 * odgovara na jedno pitanje: je li novi redak DRUGA STRANA prijenosa koji već
 * stoji u knjigama.
 *
 * Pravila koja se ne pregovaraju:
 *  - Imena i opisi se NE uspoređuju međusobno — dvije banke isti novac pišu
 *    različito. Opis se čita SAMO kao signal (broj kartice / ključna riječ)
 *    kod običnog primitka ili troška koji se pretvara u prijenos.
 *  - Spaja se samo kad je točno JEDAN kandidat; dva ili više → pitanje.
 *  - Iznos do centa (±0,005). Prozor je STUPNJEVAN: isti dan → ±1 → ±3 dana.
 *    „Dvosmisleno" se vraća tek kad ni na ±3 nije jednoznačno.
 *  - Kandidat koji je u istoj seriji već uzeo drugi redak (`claimedCandidateIds`)
 *    ne postoji za ovaj redak.
 *  - Platitelj se ispravlja isključivo kad je postojeći redak nastao po
 *    naučenom pravilu (`transfer_counterpart_origin = 'rule'`).
 *
 * Zrcalo za edge funkcije: `supabase/functions/_shared/transferPairMatch.ts`.
 * Jezgra između SHARED CORE markera mora biti identična u obje datoteke —
 * čuva ju `transferPairMatchMirror.test.ts`.
 */

// ---------------- SHARED CORE START ----------------

export type PairDirection = 'in' | 'out';

/** Odakle je kandidat došao u knjige — samo za prikaz korisniku. */
export type PairCandidateOrigin = 'import' | 'sync' | 'manual';

/** Postojeći redak u knjigama (deleted_at null) koji MOŽE biti druga strana. */
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
  /**
   * `transfer` = već upisan prijenos. `income`/`expense` = obična strana koja
   * se MOŽE pretvoriti u prijenos, ali samo uz signal (kartica ili ključna
   * riječ) u opisu.
   */
  readonly type?: string | null;
  /** Novčanik običnog retka (iz `payment_source`). */
  readonly walletId?: string | null;
  readonly description?: string | null;
  readonly origin?: PairCandidateOrigin | null;
}

/** Podaci kandidata za prikaz korisniku kad odluka nije jednoznačna. */
export interface PairCandidateInfo {
  readonly id: string;
  readonly date: string;
  readonly amount: number;
  readonly payerWalletId: string | null;
  readonly receiverWalletId: string | null;
  readonly description: string | null;
  readonly origin: PairCandidateOrigin | null;
  /** Kandidat je obični primitak/trošak koji se pretvara u prijenos. */
  readonly convert: boolean;
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
  /** Kandidati koje je u istoj seriji već uzeo raniji redak. */
  readonly claimedCandidateIds?: readonly string[];
  /** Zadnje 4 znamenke korisnikovih kartica — signal za pretvorbu. */
  readonly cardLast4?: readonly string[];
  /** Ključne riječi prijenosa — slabiji signal za pretvorbu. */
  readonly transferKeywords?: readonly string[];
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
      /** Postojeći redak je obični primitak/trošak → pretvara se u prijenos. */
      readonly convert?: boolean;
      /** Što je prepoznalo pretvorbu. */
      readonly convertSignal?: 'card' | 'keyword' | null;
    }
  | { readonly kind: 'same_row'; readonly existingId: string }
  | {
      readonly kind: 'ambiguous';
      readonly candidateIds: readonly string[];
      readonly candidates: readonly PairCandidateInfo[];
    }
  | { readonly kind: 'none' };

const AMOUNT_EPSILON = 0.005;
/** Stupnjevani prozor: prvo isti dan, pa ±1, pa ±3 dana. */
const DATE_WINDOWS: readonly number[] = [0, 1, 3];
const MAX_WINDOW_DAYS = 3;
const DAY_MS = 86_400_000;

const dayOf = (value: string): number | null => {
  const t = Date.parse(String(value ?? '').length === 10 ? `${value}T00:00:00Z` : String(value));
  if (Number.isNaN(t)) return null;
  return Math.floor(t / DAY_MS);
};

const withinDays = (a: string, b: string, days: number): boolean => {
  const da = dayOf(a);
  const db = dayOf(b);
  if (da === null || db === null) return false;
  return Math.abs(da - db) <= days;
};

const sameAmount = (a: number, b: number): boolean =>
  Math.abs(Math.abs(Number(a)) - Math.abs(Number(b))) <= AMOUNT_EPSILON;

const isTransferRow = (c: TransferPairCandidate): boolean => (c.type ?? 'transfer') === 'transfer';

/**
 * Je li novi redak druga strana prijenosa koji već stoji u knjigama.
 */
export function matchTransferPair(input: TransferPairInput): TransferPairMatch {
  const statement = String(input.statementWalletId ?? '');
  const counterpart = input.counterpartWalletId ?? null;
  const fingerprint = input.fingerprint ?? null;
  const claimed = new Set(input.claimedCandidateIds ?? []);
  const last4 = (input.cardLast4 ?? []).map((v) => String(v)).filter((v) => /^\d{4}$/.test(v));
  const keywords = (input.transferKeywords ?? [])
    .map((k) => String(k ?? '').toLowerCase().trim())
    .filter((k) => k.length > 0);

  const sameAmountRows = (input.candidates ?? []).filter((c) => sameAmount(c.amount, input.amount));

  // Isti redak, ne par: otisak već stoji na kandidatu (bilo kojoj strani).
  if (fingerprint) {
    const same = sameAmountRows.find(
      (c) =>
        withinDays(c.date, input.date, MAX_WINDOW_DAYS) &&
        (c.bankTransactionId === fingerprint || c.counterpartBankTransactionId === fingerprint),
    );
    if (same) return { kind: 'same_row', existingId: same.id };
  }

  const free = sameAmountRows.filter((c) => !claimed.has(c.id));

  /** Postojeći PRIJENOS čija druga strana odgovara novom retku. */
  const isStrictTransfer = (c: TransferPairCandidate): boolean => {
    if (!isTransferRow(c)) return false;
    if (input.direction === 'in') {
      if (c.receiverWalletId !== statement) return false;
      if (!c.payerWalletId || c.payerWalletId === statement) return false;
      return counterpart ? c.payerWalletId === counterpart : true;
    }
    if (c.payerWalletId !== statement) return false;
    if (!c.receiverWalletId || c.receiverWalletId === statement) return false;
    return counterpart ? c.receiverWalletId === counterpart : true;
  };

  /**
   * Obični primitak/trošak na DRUGOM novčaniku koji je zapravo druga strana.
   * Bez broja kartice i bez ključne riječi NIJE kandidat.
   */
  const convertSignalOf = (c: TransferPairCandidate): 'card' | 'keyword' | null => {
    if (isTransferRow(c)) return null;
    const wallet = c.walletId ?? null;
    if (!wallet || wallet === statement) return null;
    if (counterpart && wallet !== counterpart) return null;
    const text = String(c.description ?? '').toLowerCase();
    if (!text) return null;
    // Očekivani predznak druge strane: kod „in" druga strana plaća (trošak),
    // kod „out" druga strana prima (primitak).
    const expected = input.direction === 'out' ? 'income' : 'expense';
    const hasCard = last4.some((d) => text.includes(d));
    // Broj kartice je determinističan dokaz — vrijedi i kad je banka redak
    // knjižila s krivim predznakom (stvarni slučaj: Revolut „nadoplata … *1664").
    if (hasCard) return 'card';
    if (c.type !== expected) return null;
    if (keywords.some((k) => text.includes(k))) return 'keyword';
    return null;
  };

  const infoOf = (c: TransferPairCandidate, convert: boolean): PairCandidateInfo => ({
    id: c.id,
    date: c.date,
    amount: Math.abs(Number(c.amount)),
    payerWalletId: convert
      ? (input.direction === 'out' ? statement : (c.walletId ?? null))
      : c.payerWalletId,
    receiverWalletId: convert
      ? (input.direction === 'out' ? (c.walletId ?? null) : statement)
      : c.receiverWalletId,
    description: c.description ?? null,
    origin: c.origin ?? null,
    convert,
  });

  const pairFromTransfer = (c: TransferPairCandidate): TransferPairMatch => ({
    kind: 'pair',
    existingId: c.id,
    payerWalletId: (input.direction === 'in' ? c.payerWalletId : statement) as string,
    receiverWalletId: (input.direction === 'in' ? statement : c.receiverWalletId) as string,
  });

  const pairFromConvert = (
    c: TransferPairCandidate,
    signal: 'card' | 'keyword',
  ): TransferPairMatch => ({
    kind: 'pair',
    existingId: c.id,
    payerWalletId: (input.direction === 'out' ? statement : c.walletId) as string,
    receiverWalletId: (input.direction === 'out' ? c.walletId : statement) as string,
    convert: true,
    convertSignal: signal,
  });

  /** Kandidati za pretvorbu; kartica ima prednost pred ključnom riječi. */
  const convertsIn = (rows: readonly TransferPairCandidate[]) => {
    const hits = rows
      .map((c) => ({ c, signal: convertSignalOf(c) }))
      .filter((x): x is { c: TransferPairCandidate; signal: 'card' | 'keyword' } => x.signal !== null);
    const byCard = hits.filter((x) => x.signal === 'card');
    return byCard.length > 0 ? byCard : hits;
  };

  let widestTransfers: TransferPairCandidate[] = [];
  let widestConverts: { c: TransferPairCandidate; signal: 'card' | 'keyword' }[] = [];

  for (const window of DATE_WINDOWS) {
    const inWindow = free.filter((c) => withinDays(c.date, input.date, window));
    const transfers = inWindow.filter(isStrictTransfer);
    const converts = convertsIn(inWindow);
    widestTransfers = transfers;
    widestConverts = converts;

    if (transfers.length === 1) return pairFromTransfer(transfers[0]);
    if (transfers.length === 0 && converts.length === 1) {
      return pairFromConvert(converts[0].c, converts[0].signal);
    }
  }

  if (widestTransfers.length > 1) {
    return {
      kind: 'ambiguous',
      candidateIds: widestTransfers.map((c) => c.id),
      candidates: widestTransfers.map((c) => infoOf(c, false)),
    };
  }
  if (widestConverts.length > 1) {
    return {
      kind: 'ambiguous',
      candidateIds: widestConverts.map((x) => x.c.id),
      candidates: widestConverts.map((x) => infoOf(x.c, true)),
    };
  }

  // ISPRAVAK PLATITELJA — samo kad znamo pravu drugu stranu i kad je postojeći
  // redak nastao pogađanjem po naučenom pravilu.
  if (counterpart && input.direction === 'in') {
    const guessed = free.filter(
      (c) =>
        isTransferRow(c) &&
        withinDays(c.date, input.date, MAX_WINDOW_DAYS) &&
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
    if (guessed.length > 1) {
      return {
        kind: 'ambiguous',
        candidateIds: guessed.map((c) => c.id),
        candidates: guessed.map((c) => infoOf(c, false)),
      };
    }
  }

  return { kind: 'none' };
}

// ---------------- SHARED CORE END ----------------
