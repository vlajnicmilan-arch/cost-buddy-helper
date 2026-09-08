/**
 * PRED-ODABIR PROJEKTA pri skenu i pregledu dokumenta.
 *
 * (a) pokrenuto iz otvorenog projekta → taj projekt (currentId ostaje);
 * (b) korisnik ima točno jedan AKTIVAN projekt → taj (može se maknuti);
 * (c) inače prazno.
 */
export const pickPreselectedProject = (
  projects: { id: string; status?: string | null }[],
  currentId: string | null,
): string | null => {
  if (currentId) return currentId;
  const active = projects.filter((p) => p.status === 'active');
  return active.length === 1 ? active[0].id : null;
};
