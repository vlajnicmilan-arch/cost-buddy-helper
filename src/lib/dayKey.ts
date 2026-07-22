/**
 * toDayKey — robust "YYYY-MM-DD" for Date | string | number | null.
 *
 * Kontekst: bagovi tipa "z.slice is not a function" nastaju kad kod pretpostavi
 * string (npr. `.slice(0, 10)`) a dobije Date objekt (Supabase vraća date-string,
 * optimistički update vraća Date). Ovaj helper normalizira oba u lokalni day-key.
 *
 * Koristi LOKALNU zonu (getFullYear/getMonth/getDate) jer je "day-cut" pravilo
 * u UI-u (badge "Prije sidra") vezano za korisnikov dan — ne UTC.
 */
export function toDayKey(input: Date | string | number | null | undefined): string | null {
  if (input == null) return null;
  let d: Date;
  if (input instanceof Date) {
    d = input;
  } else if (typeof input === 'number') {
    d = new Date(input);
  } else if (typeof input === 'string') {
    // Već "YYYY-MM-DD..." → uzmi prvih 10 znakova ako je ISO-like s crticama.
    if (/^\d{4}-\d{2}-\d{2}/.test(input)) return input.slice(0, 10);
    d = new Date(input);
  } else {
    return null;
  }
  if (isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * isOnOrBeforeDay — true ako je `value` na isti ili raniji day-key od `anchor`.
 * null anchor → false (nema sidra = ništa nije "prije sidra").
 */
export function isOnOrBeforeDay(
  value: Date | string | number | null | undefined,
  anchor: Date | string | number | null | undefined,
): boolean {
  const a = toDayKey(anchor);
  if (!a) return false;
  const v = toDayKey(value);
  if (!v) return false;
  return v <= a;
}
