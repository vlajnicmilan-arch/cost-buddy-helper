/**
 * PRED-ODABIR PROJEKTA pri skenu i pregledu dokumenta.
 *
 * (a) pokrenuto iz otvorenog projekta → taj projekt (currentId ostaje);
 * (b) inače PRAZNO — nikad automatski pred-odabir "jedinog aktivnog projekta".
 *     Kategorije se mijenjaju samo kad korisnik sam odabere projekt.
 */
export const pickPreselectedProject = (
  _projects: { id: string; status?: string | null }[],
  currentId: string | null,
): string | null => currentId ?? null;
