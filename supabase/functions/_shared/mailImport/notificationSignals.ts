/**
 * MAIL UVOZ — OBAVIJEST NIJE RAČUN.
 *
 * Kvar (rujan 2026): mailovi bez privitka koji samo JAVLJAJU da se nešto
 * dogodilo (Paddle webhook „Transaction billed", George/NetBanking potvrda
 * naloga, FINA „Obavijest o primitku dokumenta", „subscription paused")
 * postajali su `racun`. Pravi računi iz tijela maila (Meta/PayPal receipt,
 * Bolt, Airbnb) moraju ostati računi.
 *
 * Pravilo: prepoznaju se SAMO doslovni oblici obavijesti. Riječ „transakcija"
 * ili „payment" sama po sebi nije dokaz. Vrijedi samo za poruku BEZ privitka
 * (tijelo je jedini dokument) — privitak se uvijek klasificira sam.
 */

export const NOTICE_PLATFORM = 'obavijest_platforme';
export const NOTICE_TRANSACTION = 'obavijest_o_transakciji';

export type NoticeReason = typeof NOTICE_PLATFORM | typeof NOTICE_TRANSACTION;

export interface NoticeInput {
  subject?: string | null;
  bodyText?: string | null;
  /** Postoji li dokument izvan tijela (PDF/XML/slika). */
  hasDocument: boolean;
}

/** Bankovna potvrda izvršenog naloga (George, NetBanking …). */
const TRANSACTION_SUBJECT: readonly RegExp[] = [
  /^\s*transakcija\s*:/i,
  /^\s*netbanking\s*:/i,
];
const TRANSACTION_BODY_ANCHORS: readonly RegExp[] = [
  /\bnalog\s+za\s+(?:nacionalno|prekogranično|sepa)?\s*pla[cć]anje/i,
  /\bdetalji\s+transakcije\b/i,
  /\bstatus\s+naloga\b/i,
  /\btrans\.\s*br\./i,
  /\bizvr[sš]io\s+sam\s+transakciju\b/i,
];

/** Obavijesti platformi — webhook, pretinac, pretplata. */
const PLATFORM_SUBJECT: readonly RegExp[] = [
  /\bpaddle\s+notification\s*:\s*transaction\b/i,
  /\bobavijest\s+o\s+primitku\s+dokumenta\b/i,
  /\bsubscription\s+(?:access\s+)?(?:has\s+been\s+)?paused\b/i,
];
const PLATFORM_BODY: readonly RegExp[] = [
  /\bevent\s+type\s+transaction\.[a-z_]+/i,
  /\bzaprimili\s+novi\s+dokument\b/i,
  /\byour\s+subscription\s+access\s+has\s+been\s+paused\b/i,
];

const hits = (value: string, patterns: readonly RegExp[]): number =>
  patterns.reduce((n, re) => n + (re.test(value) ? 1 : 0), 0);

export function detectNotice(input: NoticeInput): NoticeReason | null {
  if (input.hasDocument) return null;
  const subject = input.subject ?? '';
  const body = input.bodyText ?? '';

  // Bankovna obavijest: naslov + barem jedno sidro, ili dva sidra u tijelu.
  const txAnchors = hits(body, TRANSACTION_BODY_ANCHORS);
  if ((hits(subject, TRANSACTION_SUBJECT) > 0 && txAnchors >= 1) || txAnchors >= 3) {
    return NOTICE_TRANSACTION;
  }

  if (hits(subject, PLATFORM_SUBJECT) > 0 || hits(body, PLATFORM_BODY) > 0) {
    return NOTICE_PLATFORM;
  }
  return null;
}
