/**
 * eRačun — spajanje uplata iz bankovnog izvoda s računima.
 *
 * TVRDO PRAVILO: spajanje NE stvara ni prihod ni trošak i ne dira saldo ni
 * sidro. Uplata već postoji kao transakcija iz izvoda; spajanje upisuje samo
 * `settled_amount` / `paid_at` na račun i vezu u `eracun_payment_links`.
 * Ne pretvarati ovo u pisač u `expenses`.
 *
 * Slojevi (prvi koji pogodi pobjeđuje):
 *   1. `payment_reference` s računa pronađen u opisu uplate → `certain`
 *   2. naučeni IBAN platitelja + iznos                      → `strong`
 *   3. iznos + token-subset naziva                          → `likely`
 *   4. skupno podudaranje (do 4 računa iste druge strane)   → `likely`
 *
 * Poziv na broj nije pouzdan sam za sebe: platitelji redovito koriste model
 * HR99 s vlastitom oznakom, pa je sloj 1 koristan kad postoji, ali nikad
 * jedini put.
 *
 * Dvosmislenost se NIKAD ne rješava tiho: svi kandidati ostaju u prijedlogu,
 * a preporuka je najstariji nenaplaćeni račun te druge strane (standardna
 * knjigovodstvena praksa — uplata zatvara najstariji dug).
 */

import { namesMatch } from './normalizeName';

export type MatchConfidence = 'certain' | 'strong' | 'likely';
export type MatchReason = 'payment_reference' | 'learned_iban' | 'amount_name';

export const MATCH_WINDOW_DAYS = 90;
const EPS = 0.005;
const MAX_GROUP_SIZE = 4;

export interface MatchInvoice {
  readonly id: string;
  readonly direction: 'in' | 'out';
  readonly invoiceNumber: string;
  readonly counterpartyName: string | null;
  readonly counterpartyOib: string | null;
  /** Poziv na broj s računa (`HR00 345-3-1`). */
  readonly paymentReference?: string | null;
  readonly totalAmount: number;
  readonly settledAmount: number | null;
  readonly issueDate: string | null;
  readonly paidAt: string | null;
}

export interface MatchTransaction {
  readonly id: string;
  /** Uvijek pozitivan iznos uplate. */
  readonly amount: number;
  readonly date: string;
  readonly description: string | null;
  readonly merchantName?: string | null;
}

/** Naučena veza IBAN → druga strana (potvrđena ranijim spajanjem). */
export interface LearnedIban {
  readonly iban: string;
  readonly counterpartyOib: string | null;
  readonly counterpartyName: string | null;
}

export interface MatchCandidate {
  readonly invoiceIds: readonly string[];
  /** Koliko se s ove uplate raspoređuje na koji račun. */
  readonly allocation: Readonly<Record<string, number>>;
  readonly confidence: MatchConfidence;
  readonly reason: MatchReason;
  /** `true` kad je kandidat izabran samo zato što zatvara najstariji dug. */
  readonly oldestFallback: boolean;
  readonly partial: boolean;
  readonly group: boolean;
}

export interface PaymentSuggestion {
  readonly transactionId: string;
  /** Prvi kandidat je preporuka; ostali su dostupni u istom retku. */
  readonly candidates: readonly MatchCandidate[];
  /** Predoznačen redak: samo jednoznačan `certain` pogodak. */
  readonly autoSelect: boolean;
  readonly ambiguous: boolean;
}

export interface MatchInput {
  readonly invoices: readonly MatchInvoice[];
  readonly transactions: readonly MatchTransaction[];
  readonly learnedIbans?: readonly LearnedIban[];
  /** Smjer računa koji se zatvara; uplate = izlazni računi. */
  readonly direction?: 'in' | 'out';
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export const remainingOf = (invoice: MatchInvoice): number =>
  round2(Number(invoice.totalAmount) - Number(invoice.settledAmount ?? 0));

/** Samo znamenke — poziv na broj i opis se uspoređuju u istom obliku. */
const digitsOnly = (value: string | null | undefined): string =>
  (value ?? '').replace(/\D+/g, '');

const alnum = (value: string | null | undefined): string =>
  (value ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, '');

/** IBAN-i platitelja iz opisa uplate (`HR` + 19 znamenki). */
export const extractIbans = (description: string | null | undefined): string[] => {
  const compact = alnum(description);
  return [...compact.matchAll(/HR\d{19}/g)].map((m) => m[0]);
};

const daysBetween = (a: string, b: string): number =>
  Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86_400_000;

const withinWindow = (invoice: MatchInvoice, tx: MatchTransaction): boolean => {
  if (!invoice.issueDate) return true;
  // Prozor je simetričan: uplata prije izdavanja računa je legitimna
  // (avans, dogovorena isplata unaprijed) i mora ostati kandidat.
  return daysBetween(invoice.issueDate, tx.date) <= MATCH_WINDOW_DAYS;
};

const shiftDays = (isoDate: string, days: number): string =>
  new Date(new Date(isoDate).getTime() + days * 86_400_000).toISOString().slice(0, 10);

/** Nenaplaćeni računi traženog smjera — jedina definicija „otvorenog” računa. */
export const outstandingInvoices = (
  invoices: readonly MatchInvoice[],
  direction: 'in' | 'out',
): MatchInvoice[] =>
  invoices.filter((i) => i.direction === direction && !i.paidAt && remainingOf(i) > EPS);

/**
 * Granice dohvata transakcija — JEDINA definicija prozora za obje strane.
 *
 * Prozor je sidren na račune (`issue_date ± MATCH_WINDOW_DAYS`), nikad na
 * današnji dan. Nenaplaćeni računi su po prirodi stari, pa bi prozor oko
 * `now()` tiho odbacio njihove uplate — točno kvar koji je ovo uveo.
 *
 * `null` = nema nenaplaćenih računa, ne dohvaćaj ništa.
 * `since`/`until` = `null` kad neki račun nema datum izdavanja (tada motor
 * prihvaća bilo koji datum uplate, pa dohvat ne smije ograničavati).
 */
export const paymentFetchWindow = (
  invoices: readonly MatchInvoice[],
  direction: 'in' | 'out',
): { since: string | null; until: string | null } | null => {
  const pool = outstandingInvoices(invoices, direction);
  if (pool.length === 0) return null;
  if (pool.some((i) => !i.issueDate)) return { since: null, until: null };
  const times = pool.map((i) => new Date(i.issueDate as string).getTime());
  const min = new Date(Math.min(...times)).toISOString().slice(0, 10);
  const max = new Date(Math.max(...times)).toISOString().slice(0, 10);
  return {
    since: shiftDays(min, -MATCH_WINDOW_DAYS),
    until: shiftDays(max, MATCH_WINDOW_DAYS),
  };
};


/** Poziv na broj s računa nađen u opisu uplate. */
const referenceHit = (invoice: MatchInvoice, tx: MatchTransaction): boolean => {
  const ref = digitsOnly(invoice.paymentReference);
  if (ref.length < 4) return false;
  return digitsOnly(tx.description).includes(ref);
};

const learnedHit = (
  invoice: MatchInvoice,
  tx: MatchTransaction,
  learned: readonly LearnedIban[],
): boolean => {
  if (learned.length === 0) return false;
  const ibans = new Set(extractIbans(tx.description));
  if (ibans.size === 0) return false;
  return learned.some((l) => {
    if (!ibans.has(alnum(l.iban))) return false;
    if (l.counterpartyOib && invoice.counterpartyOib) {
      return alnum(l.counterpartyOib).replace(/^HR/, '') === alnum(invoice.counterpartyOib).replace(/^HR/, '');
    }
    return namesMatch(l.counterpartyName, invoice.counterpartyName);
  });
};

const nameHit = (invoice: MatchInvoice, tx: MatchTransaction): boolean =>
  namesMatch(invoice.counterpartyName, tx.description) ||
  namesMatch(invoice.counterpartyName, tx.merchantName);

/** Najstariji prvi; računi bez datuma izdavanja idu na kraj. */
const byOldest = (a: MatchInvoice, b: MatchInvoice): number => {
  const da = a.issueDate ? new Date(a.issueDate).getTime() : Number.MAX_SAFE_INTEGER;
  const db = b.issueDate ? new Date(b.issueDate).getTime() : Number.MAX_SAFE_INTEGER;
  if (da !== db) return da - db;
  return a.invoiceNumber.localeCompare(b.invoiceNumber);
};

const singleCandidate = (
  invoice: MatchInvoice,
  amount: number,
  confidence: MatchConfidence,
  reason: MatchReason,
  oldestFallback: boolean,
): MatchCandidate => {
  const allocated = round2(Math.min(amount, remainingOf(invoice)));
  return {
    invoiceIds: [invoice.id],
    allocation: { [invoice.id]: allocated },
    confidence,
    reason,
    oldestFallback,
    partial: allocated + EPS < remainingOf(invoice),
    group: false,
  };
};

/**
 * Podskupovi (2..4) čiji zbroj preostalog odgovara uplati.
 * Sortirano tako da prednost ima podskup koji zatvara najstarije račune.
 */
const groupCandidates = (
  pool: readonly MatchInvoice[],
  amount: number,
  reason: MatchReason,
): MatchCandidate[] => {
  const sorted = [...pool].sort(byOldest).slice(0, 12);
  const out: MatchCandidate[] = [];

  const walk = (start: number, picked: MatchInvoice[], sum: number) => {
    if (picked.length >= 2 && Math.abs(sum - amount) <= EPS) {
      out.push({
        invoiceIds: picked.map((p) => p.id),
        allocation: Object.fromEntries(picked.map((p) => [p.id, remainingOf(p)])),
        confidence: 'likely',
        reason,
        oldestFallback: false,
        partial: false,
        group: true,
      });
      return;
    }
    if (picked.length >= MAX_GROUP_SIZE || sum > amount + EPS) return;
    for (let i = start; i < sorted.length; i += 1) {
      walk(i + 1, [...picked, sorted[i]], round2(sum + remainingOf(sorted[i])));
    }
  };

  walk(0, [], 0);
  // Najstariji zatvoreni račun odlučuje redoslijed prijedloga.
  return out.sort((a, b) => {
    const oldest = (c: MatchCandidate) =>
      Math.min(...c.invoiceIds.map((id) => {
        const inv = pool.find((p) => p.id === id);
        return inv?.issueDate ? new Date(inv.issueDate).getTime() : Number.MAX_SAFE_INTEGER;
      }));
    return oldest(a) - oldest(b);
  }).slice(0, 5);
};

export const matchPayments = (input: MatchInput): PaymentSuggestion[] => {
  const direction = input.direction ?? 'out';
  const learned = input.learnedIbans ?? [];

  const outstanding = outstandingInvoices(input.invoices, direction);


  const suggestions: PaymentSuggestion[] = [];

  for (const tx of input.transactions) {
    const pool = outstanding.filter((inv) => withinWindow(inv, tx));
    if (pool.length === 0) continue;

    // Sloj 1 — poziv na broj.
    const refHits = pool.filter((inv) => referenceHit(inv, tx));
    if (refHits.length > 0) {
      const sorted = [...refHits].sort(byOldest);
      const exact = sorted.filter((inv) => Math.abs(remainingOf(inv) - tx.amount) <= EPS);
      const chosen = exact.length > 0 ? exact : sorted;
      const unique = chosen.length === 1;
      const candidates = chosen.map((inv, idx) =>
        singleCandidate(
          inv,
          tx.amount,
          unique && exact.length > 0 ? 'certain' : 'strong',
          'payment_reference',
          !unique && idx === 0,
        ),
      );
      suggestions.push({
        transactionId: tx.id,
        candidates,
        autoSelect: unique && exact.length > 0,
        ambiguous: !unique,
      });
      continue;
    }

    // Sloj 2 — naučeni IBAN platitelja.
    const ibanPool = pool.filter((inv) => learnedHit(inv, tx, learned));
    const namePool = pool.filter((inv) => nameHit(inv, tx));
    const active = ibanPool.length > 0 ? ibanPool : namePool;
    const reason: MatchReason = ibanPool.length > 0 ? 'learned_iban' : 'amount_name';
    if (active.length === 0) continue;

    const exact = [...active]
      .filter((inv) => Math.abs(remainingOf(inv) - tx.amount) <= EPS)
      .sort(byOldest);

    const candidates: MatchCandidate[] = [];
    if (exact.length > 0) {
      const ambiguousAmount = exact.length > 1;
      exact.forEach((inv, idx) => {
        candidates.push(
          singleCandidate(
            inv,
            tx.amount,
            reason === 'learned_iban' ? 'strong' : 'likely',
            reason,
            ambiguousAmount && idx === 0,
          ),
        );
      });
    }

    // Skupno podudaranje i djelomična uplata.
    candidates.push(...groupCandidates(active, tx.amount, reason));
    if (candidates.length === 0) {
      const partialTargets = [...active]
        .filter((inv) => remainingOf(inv) > tx.amount + EPS)
        .sort(byOldest);
      if (partialTargets.length === 0) continue;
      partialTargets.forEach((inv, idx) => {
        candidates.push(
          singleCandidate(inv, tx.amount, reason === 'learned_iban' ? 'strong' : 'likely', reason, idx === 0),
        );
      });
    }

    suggestions.push({
      transactionId: tx.id,
      candidates,
      // Nikad automatski izvan sloja 1.
      autoSelect: false,
      ambiguous: candidates.length > 1,
    });
  }

  return suggestions;
};
