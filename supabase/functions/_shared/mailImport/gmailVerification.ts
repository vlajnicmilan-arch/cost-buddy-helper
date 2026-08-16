/**
 * MAIL UVOZ — obitelj verifikacijskih poruka (Gmail prosljeđivanje).
 *
 * Kad korisnik u Gmailu postavi prosljeđivanje na svoju uvoznu adresu, Google
 * pošalje potvrdnu poruku s kodom. Ta poruka MORA proći bez ijednog AI poziva
 * i bez trošenja kvote — inače korisnik ne može ni započeti.
 *
 * SIGURNOST: potvrdni link postaje KLIKABILAN GUMB samo ako su ISPUNJENA OBA
 * uvjeta: (1) poruka je autentificirana kao Googleova, (2) URL je striktno na
 * Googleovoj domeni potvrde (`mail-settings.google.com` ili `mail.google.com`).
 * Inače se prikazuje SAMO kod, uz upozorenje. Nikad ne pretvaramo neprovjeren
 * link u gumb.
 *
 * JEZICI: predmet stiže na jeziku korisnikova Gmaila ("Gmail Forwarding
 * Confirmation", "Gmail Potvrda o prosljeđivanju", "Gmail-Weiterleitungs-
 * bestätigung"…). Zato je pošiljatelj TVRDA ograda, a predmet meka: uz
 * točnog pošiljatelja dovoljan je Googleov potvrdni link ili potvrdni kod.
 */

export const GMAIL_FORWARDING_SENDER = 'forwarding-noreply@google.com';
export const GMAIL_CONFIRM_ORIGIN = 'https://mail-settings.google.com/';
/** Hostovi na kojima Google poslužuje potvrdu prosljeđivanja. */
export const GMAIL_CONFIRM_HOSTS: readonly string[] = [
  'mail-settings.google.com',
  'mail.google.com',
];

/** Predmet potvrde — poznati oblici po jezicima (meka ograda). */
const SUBJECT_PATTERNS: readonly RegExp[] = [
  /forwarding confirmation/i,
  /potvrda o proslje/i, // hr: "Potvrda o prosljeđivanju"
  /potvrda proslje/i,
  /weiterleitungsbest/i, // de: "Weiterleitungsbestätigung"
  /bestätigung der weiterleitung/i,
  /bestatigung der weiterleitung/i,
  /confirmation de transfert/i,
  /confirmación de reenvío/i,
];

export interface GmailVerificationInput {
  fromHeader: string | null | undefined;
  subject: string | null | undefined;
  bodyText: string;
  links: readonly string[];
  /** Je li poruka kriptografski potvrđena kao Googleova (DKIM/SPF usklađen s google.com). */
  googleAuthenticated: boolean;
}

export interface GmailVerificationResult {
  isVerification: boolean;
  code: string | null;
  /** Link se smije prikazati kao gumb. */
  safeConfirmUrl: string | null;
  /** Nađen je potvrdni link, ali nije siguran za gumb. */
  linkWithheld: boolean;
  /** Adresa koja se prosljeđuje (iz predmeta), ako je čitljiva. */
  forwardedAddress: string | null;
  warnings: string[];
}

const emailOf = (fromHeader: string | null | undefined): string => {
  const raw = (fromHeader ?? '').toLowerCase();
  const m = raw.match(/([^\s<>,;]+@[^\s<>,;]+)/);
  return m ? m[1] : '';
};

/** Kod iz predmeta: "(#123456789) Gmail Forwarding Confirmation - Receive Mail from ..." */
export function extractConfirmationCode(subject: string | null | undefined): string | null {
  const s = subject ?? '';
  const paren = s.match(/\(#\s*(\d{6,})\s*\)/);
  if (paren) return paren[1];
  const hash = s.match(/#\s*(\d{6,})/);
  return hash ? hash[1] : null;
}

/** Kod iz tijela — rezerva kad predmet ne nosi zagradu. */
export function extractCodeFromBody(bodyText: string): string | null {
  const m = (bodyText ?? '').match(/\b(\d{9,})\b/);
  return m ? m[1] : null;
}

/** Adresa koja se prosljeđuje — zadnja e-adresa u predmetu ("… s adrese X"). */
export function extractForwardedAddress(subject: string | null | undefined): string | null {
  const all = (subject ?? '').match(/[^\s<>,;()]+@[^\s<>,;()]+/g);
  if (!all || all.length === 0) return null;
  return all[all.length - 1].replace(/[.,;:]+$/, '');
}

export function isGoogleConfirmUrl(url: string): boolean {
  const value = (url ?? '').trim();
  try {
    const parsed = new URL(value);
    // Striktno: https + TOČAN host. Bez `startsWith` trikova tipa
    // "https://mail-settings.google.com.zlo.example/".
    if (parsed.protocol !== 'https:') return false;
    return GMAIL_CONFIRM_HOSTS.includes(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Kandidat za potvrdni link — labavo prepoznavanje, sud donosi `isGoogleConfirmUrl`. */
const looksLikeConfirmLink = (link: string): boolean =>
  /mail-settings\.google\.com/i.test(link) || /mail\.google\.com\/mail\/vf-/i.test(link);

export function detectGmailVerification(
  input: GmailVerificationInput,
): GmailVerificationResult {
  const sender = emailOf(input.fromHeader);
  const subject = input.subject ?? '';
  const bodyText = input.bodyText ?? '';
  const links = input.links ?? [];

  // TVRDA ograda: samo točan Googleov pošiljatelj. Slično ime ne prolazi.
  if (sender !== GMAIL_FORWARDING_SENDER) {
    return {
      isVerification: false,
      code: null,
      safeConfirmUrl: null,
      linkWithheld: false,
      forwardedAddress: null,
      warnings: [],
    };
  }

  // Poruka zna stići kao čisti tekst — tada linkova nema u `links`, nego u tijelu.
  const bodyUrls = bodyText.match(/https?:\/\/[^\s<>"')]+/g) ?? [];
  const candidate = [...links, ...bodyUrls].find(looksLikeConfirmLink) ?? null;
  const code = extractConfirmationCode(subject) ?? extractCodeFromBody(bodyText);
  const subjectMatches = SUBJECT_PATTERNS.some((re) => re.test(subject));

  // Meka ograda: predmet na bilo kojem jeziku ILI Googleov potvrdni trag.
  if (!subjectMatches && candidate === null && code === null) {
    return {
      isVerification: false,
      code: null,
      safeConfirmUrl: null,
      linkWithheld: false,
      forwardedAddress: null,
      warnings: [],
    };
  }

  const urlIsSafe = candidate !== null && isGoogleConfirmUrl(candidate);
  const allowButton = urlIsSafe && input.googleAuthenticated;

  const warnings: string[] = [];
  if (!input.googleAuthenticated) warnings.push('verifikacija_nije_autenticirana');
  if (candidate !== null && !urlIsSafe) warnings.push('verifikacija_link_nije_googleov');
  if (code === null) warnings.push('verifikacija_bez_koda');

  return {
    isVerification: true,
    code,
    safeConfirmUrl: allowButton ? candidate : null,
    linkWithheld: candidate !== null && !allowButton,
    forwardedAddress: extractForwardedAddress(subject),
    warnings,
  };
}
