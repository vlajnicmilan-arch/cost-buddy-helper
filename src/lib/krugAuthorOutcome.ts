/**
 * Krug — Author Outcome Detection (client-side, realtime driven).
 *
 * Zatvara "author outcome blind spot": kad drugi član Kruga potvrdi (A1)
 * ili odbije (A2) autorov shared prijedlog, RPC ažurira
 * `expenses.krug_shared_status` iz `predlozena` u `potvrdjena` ili
 * `nepotvrdjena`. Ta se promjena već emitira kroz `postgres_changes`
 * realtime kanal (postoji u `useExpenseFetch`), ali autor do sada nije
 * dobivao nikakav user-visible signal jer server-side notification path
 * (notify-krug-event) trenutno vraća 401 iz emit funkcije.
 *
 * Ovaj helper NE pokušava popraviti taj notification path — samo iz UPDATE
 * payloada pouzdano detektira tranziciju vlastitog prijedloga i vraća
 * outcome. Realtime već dostavlja `old` + `new` — ako u budućnosti bude
 * dostupan samo `new`, funkcija ne fabricira lažni signal (vraća `null`).
 *
 * Scope disciplina:
 *   - ne dira state machine
 *   - ne dira notifications infrastrukturu
 *   - ne dira create/delete/shared source flow
 *   - jedini side effect je jasna user-facing StatusFeedback poruka
 *     koju dispečira poziv u `useExpenseFetch` UPDATE handleru
 */

export type KrugAuthorOutcome = 'confirmed' | 'rejected';

interface KrugExpenseSnapshot {
  user_id?: string | null;
  krug_id?: string | null;
  krug_privacy?: string | null;
  krug_shared_status?: string | null;
  deleted_at?: string | null;
}

/**
 * Vraća outcome ako i samo ako:
 *   - autor (`new.user_id`) je trenutni user
 *   - trošak je u shared flowu (`new.krug_privacy = 'shared'`) i ima krug
 *   - nije soft-deletan
 *   - prev status je bio `predlozena`
 *   - new status je `potvrdjena` ili `nepotvrdjena`
 *
 * Inače vraća `null`. Bez `prev` (npr. INSERT payload) uvijek vraća `null`
 * — ne pretpostavljamo tranziciju bez oba snimka.
 */
export function detectAuthorOutcome(
  prev: KrugExpenseSnapshot | null | undefined,
  next: KrugExpenseSnapshot | null | undefined,
  currentUserId: string | null | undefined,
): KrugAuthorOutcome | null {
  if (!currentUserId || !next || !prev) return null;
  if (next.user_id !== currentUserId) return null;
  if (!next.krug_id) return null;
  if (next.krug_privacy !== 'shared') return null;
  if (next.deleted_at) return null;
  if (prev.krug_shared_status !== 'predlozena') return null;
  if (next.krug_shared_status === 'potvrdjena') return 'confirmed';
  if (next.krug_shared_status === 'nepotvrdjena') return 'rejected';
  return null;
}
