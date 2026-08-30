/**
 * POČEK KOD NEUSPJELE NAPLATE (klijentski zrcalni izračun).
 *
 * Izvor istine je baza: `public.entitlement_in_grace(status, metadata)` —
 * pravo u statusu `past_due` vrijedi još 7 dana od PRVOG prelaska u taj status
 * (`metadata.past_due_since`, sidro postavlja trigger na `user_entitlements`).
 * Ovdje računamo isto samo da bismo korisniku mogli prikazati datum.
 *
 * Poček vrijedi ISKLJUČIVO za `past_due`. Otkaz, pauza, istek i povrat djeluju
 * odmah, bez počeka.
 */
export const GRACE_DAYS = 7;

export function pastDueSince(metadata: Record<string, unknown> | null | undefined): Date | null {
  const raw = metadata?.['past_due_since'];
  if (typeof raw !== 'string') return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function graceEndsAt(
  status: string,
  metadata: Record<string, unknown> | null | undefined,
): Date | null {
  if (status !== 'past_due') return null;
  const since = pastDueSince(metadata);
  if (!since) return null;
  return new Date(since.getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000);
}

export function isInGrace(
  status: string,
  metadata: Record<string, unknown> | null | undefined,
  now: Date = new Date(),
): boolean {
  const end = graceEndsAt(status, metadata);
  return !!end && end.getTime() > now.getTime();
}
