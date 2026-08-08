/**
 * Idempotency key za write-path transakcija.
 *
 * Klijent generira stabilan ključ po pokušaju spremanja; DB parcijalni unique
 * indeks `uniq_expenses_client_request` (user_id, client_request_id) pretvara
 * dupli klik ILI mrežni retry u no-op koji vraća postojeći redak.
 */
export function newClientRequestId(): string {
  const g = globalThis as unknown as { crypto?: { randomUUID?: () => string } };
  if (typeof g.crypto?.randomUUID === 'function') return g.crypto.randomUUID();
  return `crid_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}
