/**
 * IZOŠTRENA PONUDA SPAJANJA — sužavanje i rangiranje kandidata za ulazni račun.
 *
 * Živi slučaj (19.8.2026): dva Meta računa po 15,00 (izdani 17.8. i 18.8.) —
 * ponuda je nudila sve transakcije istog iznosa iz ±90 dana, bez datuma na
 * ekranu. Ovdje se ponuda sužava datumskim prozorom SIDRENIM NA `issue_date`
 * računa i rangira po podudaranju naziva.
 *
 * ŽELJEZNO PRAVILO: naziv NIKAD nije uvjet za ISKLJUČENJE (KEKS/agregatorski
 * opisi uopće nemaju ime dobavljača — nalaz 9.8.), služi samo za rang i za
 * ogradu istaknutog prijedloga.
 *
 * PROZOR −2 / +45 dana:
 *  - unatrag samo 2 dana: plaćanje PRIJE izdavanja postoji isključivo kod
 *    kartičnih naplata, gdje terećenje pada ISTI DAN kad račun nastane (±1–2
 *    dana zbog knjiženja). Širi prozor (−14) proizvodio je KRIVA sparivanja:
 *    Metina terećenja 8.–10.8. nisu plaćanja računa od 17./18.8., nego starijih
 *    računa koji nikad nisu ušli u Centar,
 *  - unaprijed 45 dana jer standardno dospijeće (15/30 dana) uz kašnjenje
 *    plaćanja stane unutar tog raspona.
 *
 * Čisti modul — bez Reacta i IO-a.
 */
import { areMerchantsSimilar } from '@/lib/duplicateDetection';
import { deriveComparableName, hasSignificantWord } from '@/lib/importReview/comparableName';
import type { MatchConfidence, MatchTransaction } from '@/lib/eracun/matchPayments';

export const LINK_WINDOW_BEFORE_DAYS = 2;
export const LINK_WINDOW_AFTER_DAYS = 45;
const EPS = 0.005;

export interface LinkOfferInvoice {
  readonly id: string;
  readonly supplierName: string | null;
  /** Preostali (nepokriveni) iznos računa. */
  readonly remaining: number;
  readonly issueDate: string | null;
}

export interface LinkCandidateInput {
  readonly transaction: MatchTransaction;
  readonly amount: number;
  readonly confidence: MatchConfidence;
}

export interface RankedLinkCandidate extends LinkCandidateInput {
  readonly nameMatch: boolean;
  readonly exactAmount: boolean;
  /** Razlika u danima od datuma izdavanja (negativno = prije izdavanja). */
  readonly dayOffset: number | null;
}

export interface LinkOffer {
  readonly rows: readonly RankedLinkCandidate[];
  /** Jednoznačan par — prijedlog s jednim dodirom. `null` = obična lista. */
  readonly highlight: RankedLinkCandidate | null;
}

const dayOffsetOf = (issueDate: string | null, txDate: string): number | null => {
  if (!issueDate) return null;
  const a = new Date(issueDate).getTime();
  const b = new Date(txDate).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
};

const inWindow = (offset: number | null): boolean =>
  offset === null || (offset >= -LINK_WINDOW_BEFORE_DAYS && offset <= LINK_WINDOW_AFTER_DAYS);

const txName = (tx: MatchTransaction): string =>
  deriveComparableName({ merchantName: tx.merchantName ?? null, description: tx.description ?? null });

/** Podudara li se naziv dobavljača s izvedenim imenom transakcije? */
export const supplierNameMatches = (supplierName: string | null, tx: MatchTransaction): boolean => {
  const supplier = (supplierName ?? '').trim();
  const derived = txName(tx);
  if (!supplier || !derived || !hasSignificantWord(derived)) return false;
  return areMerchantsSimilar(supplier, derived);
};

/**
 * Sudara li se naziv? Sudar postoji SAMO kad obje strane imaju upotrebljivo
 * ime, a ne poklapaju se (LIDL vs Meta). Transakcija bez imena (KEKS,
 * „Kartično plaćanje") NIJE sudar.
 */
export const nameConflicts = (supplierName: string | null, tx: MatchTransaction): boolean => {
  const supplier = (supplierName ?? '').trim();
  const derived = txName(tx);
  if (!supplier || !hasSignificantWord(supplier)) return false;
  if (!derived || !hasSignificantWord(derived)) return false;
  return !areMerchantsSimilar(supplier, derived);
};

const isExact = (amount: number, remaining: number): boolean =>
  Math.abs(amount - remaining) <= EPS;

export function buildLinkOffer(input: {
  readonly invoice: LinkOfferInvoice;
  readonly candidates: readonly LinkCandidateInput[];
  /** Ostali otvoreni računi — za provjeru jednoznačnosti s DRUGE strane. */
  readonly otherInvoices: readonly LinkOfferInvoice[];
}): LinkOffer {
  const { invoice, candidates, otherInvoices } = input;

  const ranked: RankedLinkCandidate[] = candidates
    .map((c) => {
      const offset = dayOffsetOf(invoice.issueDate, c.transaction.date);
      return {
        ...c,
        dayOffset: offset,
        nameMatch: supplierNameMatches(invoice.supplierName, c.transaction),
        exactAmount: isExact(Math.abs(c.transaction.amount), invoice.remaining),
      };
    })
    .filter((c) => inWindow(c.dayOffset))
    .sort((a, b) => {
      if (a.nameMatch !== b.nameMatch) return a.nameMatch ? -1 : 1;
      if (a.exactAmount !== b.exactAmount) return a.exactAmount ? -1 : 1;
      const da = a.dayOffset === null ? Number.MAX_SAFE_INTEGER : Math.abs(a.dayOffset);
      const db = b.dayOffset === null ? Number.MAX_SAFE_INTEGER : Math.abs(b.dayOffset);
      if (da !== db) return da - db;
      return a.transaction.id.localeCompare(b.transaction.id);
    });

  const exact = ranked.filter((c) => c.exactAmount);
  let highlight: RankedLinkCandidate | null = null;

  if (exact.length === 1) {
    const only = exact[0];
    // Druga strana mora biti jednako jednoznačna: ta transakcija ne smije
    // biti kandidat točnog iznosa ni za jedan drugi otvoreni račun.
    const claimedElsewhere = otherInvoices.some((other) => {
      if (other.id === invoice.id) return false;
      if (!isExact(Math.abs(only.transaction.amount), other.remaining)) return false;
      return inWindow(dayOffsetOf(other.issueDate, only.transaction.date));
    });
    // LIDL 1,29: isti iznos, ime se sudara — nikad istaknuti prijedlog.
    if (!claimedElsewhere && !nameConflicts(invoice.supplierName, only.transaction)) {
      highlight = only;
    }
  }

  return { rows: ranked, highlight };
}
