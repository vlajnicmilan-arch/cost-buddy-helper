/**
 * MAIL UVOZ — obitelj verifikacijskih poruka (Gmail prosljeđivanje).
 *
 * Kad korisnik u Gmailu postavi prosljeđivanje na svoju uvoznu adresu, Google
 * pošalje potvrdnu poruku s kodom. Ta poruka MORA proći bez ijednog AI poziva
 * i bez trošenja kvote — inače korisnik ne može ni započeti.
 *
 * SIGURNOST: potvrdni link postaje KLIKABILAN GUMB samo ako su ISPUNJENA OBA
 * uvjeta: (1) poruka je autentificirana kao Googleova, (2) URL je striktno na
 * `https://mail-settings.google.com/`. Inače se prikazuje SAMO kod, uz
 * upozorenje. Nikad ne pretvaramo neprovjeren link u gumb.
 */

export const GMAIL_FORWARDING_SENDER = 'forwarding-noreply@google.com';
export const GMAIL_CONFIRM_ORIGIN = 'https://mail-settings.google.com/';

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

export function isGoogleConfirmUrl(url: string): boolean {
  const value = (url ?? '').trim();
  // Striktno: točan origin i https. Bez `startsWith` trikova tipa
  // "https://mail-settings.google.com.zlo.example/".
  if (!value.toLowerCase().startsWith(GMAIL_CONFIRM_ORIGIN)) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && parsed.hostname === 'mail-settings.google.com';
  } catch {
    return false;
  }
}

export function detectGmailVerification(
  input: GmailVerificationInput,
): GmailVerificationResult {
  const sender = emailOf(input.fromHeader);
  const subject = input.subject ?? '';
  const senderMatches = sender === GMAIL_FORWARDING_SENDER;
  const subjectMatches = /gmail forwarding confirmation/i.test(subject);

  if (!senderMatches || !subjectMatches) {
    return {
      isVerification: false,
      code: null,
      safeConfirmUrl: null,
      linkWithheld: false,
      warnings: [],
    };
  }

  const code = extractConfirmationCode(subject) ?? extractCodeFromBody(input.bodyText ?? '');
  const candidate = (input.links ?? []).find((l) => /mail-settings\.google\.com/i.test(l)) ?? null;
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
    warnings,
  };
}
