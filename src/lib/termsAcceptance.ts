/**
 * Prihvat Uvjeta korištenja pri registraciji.
 *
 * - Sprema DOSLOVAN tekst kvačice koji je korisnik vidio, jezik i verziju uvjeta.
 * - Prihvat je činjenica u trenutku: redak se NIKAD ne mijenja ni ne briše.
 *   Nova verzija = NOVI redak.
 * - Ako registracija zahtijeva potvrdu maila (nema sesije), namjera se čuva u
 *   sessionStorage i upisuje pri prvoj autentificiranoj sesiji.
 */
import { supabase } from '@/integrations/supabase/client';
import { logDiagnostic } from '@/lib/diagnosticLogger';

export const TERMS_ACCEPTANCE_SOURCE = 'registracija';

const PENDING_KEY = 'pending_terms_acceptance';

export interface TermsAcceptancePayload {
  tosVersion: string;
  acceptedText: string;
  locale: string;
  source: string;
}

export function buildTermsAcceptancePayload(
  tosVersion: string,
  acceptedText: string,
  locale: string,
): TermsAcceptancePayload {
  return {
    tosVersion,
    acceptedText,
    locale,
    source: TERMS_ACCEPTANCE_SOURCE,
  };
}

const SUPPORTED_LOCALES = ['hr', 'en', 'de'] as const;
export const DEFAULT_APP_LOCALE = 'hr';

/**
 * Svodi razriješeni jezik i18n-a na osnovni kod aplikacije.
 * Sirove oznake preglednika (npr. "en-US@posix") NE smiju u bazu.
 */
export function resolveAppLocale(language: string | undefined | null): string {
  const base = (language ?? '').split(/[-_@]/)[0]?.toLowerCase();
  return (SUPPORTED_LOCALES as readonly string[]).includes(base) ? base : DEFAULT_APP_LOCALE;
}

/**
 * Sastavlja rečenicu koju je korisnik stvarno vidio: prijevodi koriste
 * JEDNOSTRUKE vitičaste zagrade "{link}", koje i18next NE zamjenjuje,
 * pa se naziv poveznice umeće ručno. Isti izlaz koriste i prikaz i zapis.
 */
export function composeLinkedConsentText(label: string, linkText: string): string {
  return label.split('{link}').join(linkText);
}

/**
 * Rečenica uz obrazac ima DVIJE poveznice ({terms} i {privacy}). Isti izlaz
 * koriste i prikaz i zapis, pa doslovan tekst u bazi odgovara viđenome.
 */
export function composeTermsNoticeText(
  template: string,
  termsLabel: string,
  privacyLabel: string,
): string {
  return template.split('{terms}').join(termsLabel).split('{privacy}').join(privacyLabel);
}

export function stashPendingTermsAcceptance(payload: TermsAcceptancePayload): void {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota
  }
}

export function readPendingTermsAcceptance(): TermsAcceptancePayload | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TermsAcceptancePayload;
    if (!parsed?.tosVersion || !parsed?.acceptedText) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingTermsAcceptance(): void {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // ignore
  }
}

/**
 * Upisuje prihvat za prijavljenog korisnika. Ne baca grešku — neuspjeh ne smije
 * srušiti registraciju, ali MORA ostati vidljiv u dijagnostičkom zapisu.
 * Ako za tekuću verziju Uvjeta zapis već postoji, duplikat se NE upisuje.
 */
export async function recordTermsAcceptance(
  userId: string,
  payload: TermsAcceptancePayload,
): Promise<boolean> {
  try {
    const { data: existing } = await supabase
      .from('terms_acceptances')
      .select('id')
      .eq('user_id', userId)
      .eq('tos_version', payload.tosVersion)
      .limit(1);
    if (existing && existing.length > 0) return true;

    const { error } = await supabase.from('terms_acceptances').insert({
      user_id: userId,
      tos_version: payload.tosVersion,
      accepted_text: payload.acceptedText,
      locale: payload.locale,
      source: payload.source,
    });
    if (error) {
      logDiagnostic({
        event: 'terms_acceptance_write_failed',
        severity: 'error',
        details: {
          user_id: userId,
          tos_version: payload.tosVersion,
          locale: payload.locale,
          source: payload.source,
          message: error.message,
          code: (error as { code?: string }).code,
        },
      });
      return false;
    }
    return true;
  } catch (e) {
    logDiagnostic({
      event: 'terms_acceptance_write_failed',
      severity: 'error',
      details: {
        user_id: userId,
        tos_version: payload.tosVersion,
        locale: payload.locale,
        source: payload.source,
        message: e instanceof Error ? e.message : String(e),
      },
    });
    return false;
  }
}

/**
 * Poziva se kad sesija postane dostupna. Ako postoji odložen prihvat
 * (registracija s potvrdom maila), upisuje ga i čisti.
 */
export async function flushPendingTermsAcceptance(userId: string): Promise<void> {
  const pending = readPendingTermsAcceptance();
  if (!pending) return;
  const ok = await recordTermsAcceptance(userId, pending);
  if (ok) clearPendingTermsAcceptance();
}
