/**
 * DOSEG POGLEDA (Osobno / po tvrtki) — izdvojeno iz `useExpenseFetch`.
 *
 * Jedino mjesto koje odlučuje pripada li redak osobnom ili firminom pogledu.
 * Pravilo sigurnosti: kad novčanik retka NIJE poznat u mapi
 * (`custom_payment_sources.id -> business_profile_id`), redak se SKRIVA u oba
 * pogleda. Prazna mapa (neuspio ili nedovršen dohvat) tako nikad ne znači
 * "sve je osobno".
 */

export type SourceBusinessMap = ReadonlyMap<string, string | null>;

export interface ViewModeRow {
  payment_source?: string | null;
  income_source_id?: string | null;
  type?: string | null;
  business_profile_id?: string | null;
}

/** `custom:UUID` → UUID; sve ostalo → null. */
export const customSourceIdOf = (paymentSource: string | null | undefined): string | null => {
  if (!paymentSource || typeof paymentSource !== 'string') return null;
  return paymentSource.startsWith('custom:') ? paymentSource.slice('custom:'.length) : null;
};

export interface SourceScope {
  /** Je li novčanik retka poznat (postoji u mapi ili nije custom novčanik). */
  known: boolean;
  /** Tvrtka novčanika; null = osobni novčanik. */
  businessProfileId: string | null;
}

/** Tvrtka novčanika s kojeg je redak plaćen (ili na koji je prijenos stigao). */
export const resolveSourceScope = (row: ViewModeRow, map: SourceBusinessMap): SourceScope => {
  const customId = customSourceIdOf(row.payment_source ?? null);
  if (customId) {
    if (!map.has(customId)) return { known: false, businessProfileId: null };
    return { known: true, businessProfileId: map.get(customId) ?? null };
  }

  if (row.type === 'transfer' && row.income_source_id) {
    if (!map.has(row.income_source_id)) return { known: false, businessProfileId: null };
    return { known: true, businessProfileId: map.get(row.income_source_id) ?? null };
  }

  // Standardni izvori (gotovina, kartica…) su uvijek osobni i uvijek poznati.
  return { known: true, businessProfileId: null };
};

/**
 * Osoban redak = poznat novčanik BEZ tvrtke. Firmina oznaka na retku s osobnog
 * novčanika (pozajmica vlasnika) ostaje vidljiva — to je postojeći cross-mode
 * slučaj i ne mijenja se.
 */
export const isPersonalRow = (row: ViewModeRow, map: SourceBusinessMap): boolean => {
  const scope = resolveSourceScope(row, map);
  return scope.known && scope.businessProfileId === null;
};

/** Redak pripada pogledu tvrtke `profileId`. Nepoznat novčanik ne prolazi. */
export const isBusinessRow = (
  row: ViewModeRow,
  map: SourceBusinessMap,
  profileId: string,
): boolean => {
  const scope = resolveSourceScope(row, map);
  if (!scope.known) return false;
  if (scope.businessProfileId === profileId) return true;
  return scope.businessProfileId === null && (row.business_profile_id ?? null) === profileId;
};

export interface ViewModeFilterOptions {
  isPersonalView: boolean;
  isBusinessView: boolean;
  viewBusinessProfileId: string | null;
  sourceBusinessMap: SourceBusinessMap;
}

export const applyViewModeFilter = <T extends ViewModeRow>(
  list: readonly T[],
  opts: ViewModeFilterOptions,
): T[] => {
  const { isPersonalView, isBusinessView, viewBusinessProfileId, sourceBusinessMap } = opts;
  if (isPersonalView) return list.filter((e) => isPersonalRow(e, sourceBusinessMap));
  if (isBusinessView && viewBusinessProfileId) {
    return list.filter((e) => isBusinessRow(e, sourceBusinessMap, viewBusinessProfileId));
  }
  return [...list];
};
