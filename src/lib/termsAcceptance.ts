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
 */
export async function recordTermsAcceptance(
  userId: string,
  payload: TermsAcceptancePayload,
): Promise<boolean> {
  try {
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
