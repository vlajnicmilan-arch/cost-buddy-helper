/**
 * POTVRDA BRISANJA — RLS odbija tuđi redak BEZ greške.
 *
 * PostgREST DELETE koji politika ne propusti vraća `error: null` i 0 pogođenih
 * redaka. Bez `.select(...)` aplikacija to vidi kao uspjeh, javi "obrisano" i
 * makne redak s ekrana, a u bazi on ostane. Zato svaki DELETE čiji ishod
 * korisnik vidi mora zatražiti retke natrag i proći kroz ovu provjeru.
 */

/** Broj stvarno obrisanih redaka iz PostgREST `.select()` odgovora. */
export const rowsAffected = (data: unknown): number => (Array.isArray(data) ? data.length : 0);

/** Je li brisanje stvarno primijenjeno (barem jedan pogođeni redak). */
export const wasDeleteApplied = (data: unknown): boolean => rowsAffected(data) > 0;
