/**
 * Newsletter privola pri registraciji.
 *
 * - Sprema DOSLOVAN tekst na koji je korisnik pristao (dokaz privole po GDPR-u).
 * - Ako kvačica nije označena, NE upisuje se nikakav redak.
 * - Ako registracija zahtijeva potvrdu maila (nema sesije), namjera se čuva u
 *   sessionStorage i upisuje pri prvoj autentificiranoj sesiji.
 * - Odjava se bilježi upisom revoked_at — redak se NIKAD ne briše.
 */
import { supabase } from '@/integrations/supabase/client';

export const NEWSLETTER_CONSENT_SOURCE = 'registracija';

const PENDING_KEY = 'pending_newsletter_consent';

export interface NewsletterConsentPayload {
  email: string;
  consentText: string;
  locale: string;
  source: string;
}

export function buildConsentPayload(
  email: string,
  consentText: string,
  locale: string,
): NewsletterConsentPayload {
  return {
    email: email.trim().toLowerCase(),
    consentText,
    locale,
    source: NEWSLETTER_CONSENT_SOURCE,
  };
}

export function stashPendingConsent(payload: NewsletterConsentPayload): void {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota
  }
}

export function readPendingConsent(): NewsletterConsentPayload | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NewsletterConsentPayload;
    if (!parsed?.email || !parsed?.consentText) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingConsent(): void {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // ignore
  }
}

/** Upisuje privolu za prijavljenog korisnika. Ne baca grešku — privola ne smije blokirati registraciju. */
export async function recordNewsletterConsent(
  userId: string,
  payload: NewsletterConsentPayload,
): Promise<boolean> {
  try {
    const { error } = await supabase.from('newsletter_consents').insert({
      user_id: userId,
      email: payload.email,
      consent_text: payload.consentText,
      locale: payload.locale,
      source: payload.source,
    });
    return !error;
  } catch {
    return false;
  }
}

/**
 * Poziva se kad sesija postane dostupna. Ako postoji odložena privola
 * (registracija s potvrdom maila), upisuje je i čisti.
 */
export async function flushPendingNewsletterConsent(userId: string): Promise<void> {
  const pending = readPendingConsent();
  if (!pending) return;
  const ok = await recordNewsletterConsent(userId, pending);
  if (ok) clearPendingConsent();
}
