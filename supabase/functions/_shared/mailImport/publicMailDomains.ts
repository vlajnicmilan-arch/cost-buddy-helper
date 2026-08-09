/**
 * JAVNE (forwarder) MAIL DOMENE — JEDNO mjesto istine.
 *
 * Načelo: identitet izdavatelja živi u DOKUMENTU (OIB/naziv/IBAN/šifra), nikad
 * u omotnici proslijeđenog maila. Kad korisnik račun proslijedi sa svoje gmail
 * adrese, `From` više ne identificira izdavatelja — takva domena se NE smije
 * ni ZAPISATI ni ČITATI kao ključ pamćenja (upis i čitanje ista lista).
 *
 * SQL blizanac: `public.mail_is_public_domain(text)`. Čuvar
 * `src/test/mailPublicDomains.test.ts` drži dvije liste u koraku.
 */

export const PUBLIC_MAIL_DOMAINS: readonly string[] = [
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'yahoo.com', 'ymail.com', 'icloud.com', 'me.com', 'mac.com', 'proton.me', 'protonmail.com',
  'pm.me', 'tutanota.com', 'aol.com', 'mail.com', 'gmx.com', 'gmx.net', 'zoho.com', 'yandex.com',
  'net.hr', 'inet.hr', 'vip.hr', 'tel.hr', 'email.t-com.hr',
];

const SET = new Set(PUBLIC_MAIL_DOMAINS);

export const isPublicMailDomain = (domain: string | null | undefined): boolean =>
  SET.has(String(domain ?? '').trim().toLowerCase());
