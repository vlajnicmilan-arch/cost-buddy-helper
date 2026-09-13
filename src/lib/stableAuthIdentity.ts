/**
 * Stabilan identitet prijavljenog korisnika.
 *
 * supabase-js emitira auth događaje i pri osvježenju tokena i pri povratku
 * aplikacije u prvi plan. Svaki događaj nosi NOVI `user` objekt, iako je to
 * isti korisnik. Deseci hookova imaju `user` u ovisnostima, pa svaki takav
 * događaj pokreće novi val dohvata ("oluja" zahtjeva).
 *
 * `pickStableUser` vraća POSTOJEĆU referencu kad je riječ o istom korisniku
 * (isti id, email i `updated_at`), a novu tek kad se korisnik stvarno
 * promijeni. Ne dira nijedno pravilo prijave — samo referencu objekta.
 */
export interface StableUserLike {
  id: string;
  email?: string | null;
  updated_at?: string | null;
}

export function isSameUserIdentity(
  prev: StableUserLike | null | undefined,
  next: StableUserLike | null | undefined,
): boolean {
  if (!prev || !next) return false;
  if (prev.id !== next.id) return false;
  if ((prev.email ?? null) !== (next.email ?? null)) return false;
  if ((prev.updated_at ?? null) !== (next.updated_at ?? null)) return false;
  return true;
}

export function pickStableUser<T extends StableUserLike>(
  prev: T | null,
  next: T | null,
): T | null {
  if (prev && next && isSameUserIdentity(prev, next)) return prev;
  return next;
}
