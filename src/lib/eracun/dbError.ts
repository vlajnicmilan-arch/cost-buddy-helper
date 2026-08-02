/**
 * eRačun v1 — čitljiv opis greške s baze.
 *
 * Generičko „uvoz nije uspio" skriva stvarni uzrok (npr. CHECK ograničenje).
 * Ovdje se iz Supabase/Postgres greške izvlači sve što korisniku i podršci
 * pomaže: poruka, detalji, hint, šifra i ime ograničenja.
 */

export interface DbErrorLike {
  message?: string | null;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
}

/** Kratki, ali konkretan opis greške. Nikad prazan string. */
export const describeDbError = (err: unknown, fallback = 'Nepoznata greška'): string => {
  if (!err) return fallback;
  if (typeof err === 'string') return err || fallback;

  const e = err as DbErrorLike;
  const parts: string[] = [];
  if (e.message) parts.push(String(e.message));
  if (e.details && e.details !== e.message) parts.push(String(e.details));
  if (e.hint) parts.push(String(e.hint));
  const body = parts.join(' — ');
  const code = e.code ? `[${e.code}] ` : '';
  return (code + body).trim() || fallback;
};

/** Opis greške vezan uz konkretan račun (dobavljač / broj računa). */
export const describeInvoiceDbError = (
  err: unknown,
  context: { supplier?: string | null; invoiceNumber?: string | null } = {},
  fallback = 'Nepoznata greška',
): string => {
  const who = [context.supplier, context.invoiceNumber].filter(Boolean).join(' · ');
  const base = describeDbError(err, fallback);
  return who ? `${who}: ${base}` : base;
};
