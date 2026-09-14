/**
 * Prozor svježine potpunog dohvata transakcija.
 *
 * `useExpenseFetch` nije dijeljeno stanje: svaki pozivatelj je zasebna
 * instanca s vlastitim početnim efektom. `runSingleFlight` sažima samo
 * ISTOVREMENE pozive, pa instanca koja se montira kasnije (dijalog, lijeno
 * učitan dio) kreće u novi puni dohvat istog skupa.
 *
 * Ovdje pamtimo trenutak zadnjeg uspješnog POTPUNOG dohvata po korisniku.
 * Nova instanca unutar prozora hidrira se iz postojeće snimke
 * (sessionStorage / IndexedDB) i preskače mrežu.
 *
 * Prozor vrijedi SAMO za početni efekt nove instance — ručni `refetch()`,
 * povratak u fokus, promjena u stvarnom vremenu i spremanje troška ga
 * zaobilaze.
 */

/**
 * 30 s: dulje od tipičnog hladnog ulaska (montaža svih instanci na Početnoj
 * i lijeno učitanih dijaloga staje u nekoliko sekundi), a kratko dovoljno da
 * povratak na Početnu nakon stvarnog rada uvijek donese svjež dohvat.
 */
export const EXPENSES_FRESH_WINDOW_MS = 30_000;

const lastFullFetchAt = new Map<string, number>();

/** Bilježi uspješan potpuni dohvat za korisnika. */
export const markExpensesFetched = (userId: string, now: number = Date.now()): void => {
  lastFullFetchAt.set(userId, now);
};

/** Je li potpuni dohvat za tog korisnika još svjež. */
export const isExpensesFresh = (
  userId: string | null | undefined,
  now: number = Date.now(),
  windowMs: number = EXPENSES_FRESH_WINDOW_MS,
): boolean => {
  if (!userId) return false;
  const at = lastFullFetchAt.get(userId);
  if (!at) return false;
  return now - at < windowMs;
};

export const __resetExpensesFreshnessForTests = (): void => {
  lastFullFetchAt.clear();
};
