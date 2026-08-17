/**
 * MAIL UVOZ — KARANTENA GOVORI (ali ne sva).
 *
 * Razlozi karantene dijele se u DVIJE obitelji:
 *
 *  1. KORISNIČKI POPRAVLJIVI (format privitka): korisnik je poslao html,
 *     .eml (message/rfc822), arhivu ili nešto drugo što ne znamo čitati.
 *     Tu tišina je kvar: korisnik triput šalje isto i misli da app ne radi.
 *     Za njih se stvara vidljiva kartica „pošalji kao PDF" + obavijest.
 *
 *  2. SIGURNOSNI (sadržaj privitka): zabranjeni XML DTD/entiteti i sve buduće
 *     malware/nečitljivost presude. Tu je tišina NAMJERNA — ne pozivamo
 *     korisnika da išta „popravi" na dokumentu koji je odbijen zbog sadržaja.
 *
 * Razdvajanje je ALLOWLISTA, ne opće pravilo: novi razlog je tih dok ga se
 * svjesno ne doda ovdje.
 */

/** Klasifikacija stavke koja nosi vidljivu poruku o nepodržanom privitku. */
export const UNSUPPORTED_ATTACHMENT_CLASSIFICATION = 'privitak_nepodrzan';

/** Razlozi karantene koje korisnik MOŽE ispraviti ponovnim slanjem. */
export const USER_FIXABLE_QUARANTINE_REASONS: readonly string[] = [
  'nepodrzan_tip',
  'arhiva_nije_podrzana',
];

export function isUserFixableQuarantine(reason: string | null | undefined): boolean {
  return USER_FIXABLE_QUARANTINE_REASONS.includes((reason ?? '').trim());
}

/**
 * Ljudski čitljiva oznaka tipa za karticu. Deklarirani MIME je ono što je
 * korisnik zapravo poslao („text/html", „message/rfc822"), pa je on mjerodavan
 * za poruku; njuškani tip ide uz njega kao tehnički trag.
 */
export function attachmentTypeLabel(
  mimeDeclared: string | null | undefined,
  sniffed: string | null | undefined,
): string {
  const declared = (mimeDeclared ?? '').trim();
  if (declared.length > 0) return declared;
  const s = (sniffed ?? '').trim();
  return s.length > 0 ? s : 'nepoznato';
}
