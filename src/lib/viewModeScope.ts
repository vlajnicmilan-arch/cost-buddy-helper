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

/**
 * Sigurnosna mreža: snimka VLASTITIH novčanika korisnika (user_id = auth.uid()).
 * Kad mrežna mapa još nije stigla, vlastiti novčanik iz snimke je i dalje
 * poznat — „nepoznato → skrij" ostaje samo za novčanike kojih nema ni u mapi
 * ni u snimci vlastitih.
 */
export type OwnSourceMap = ReadonlyMap<string, string | null>;

const lookup = (
  id: string,
  map: SourceBusinessMap,
  own?: OwnSourceMap,
): SourceScope | null => {
  if (map.has(id)) return { known: true, businessProfileId: map.get(id) ?? null };
  if (own?.has(id)) return { known: true, businessProfileId: own.get(id) ?? null };
  return null;
};

/** Tvrtka novčanika s kojeg je redak plaćen (ili na koji je prijenos stigao). */
export const resolveSourceScope = (
  row: ViewModeRow,
  map: SourceBusinessMap,
  own?: OwnSourceMap,
): SourceScope => {
  const customId = customSourceIdOf(row.payment_source ?? null);
  if (customId) {
    const direct = lookup(customId, map, own);
    if (direct) return direct;
    // Platitelj je nepoznat (napušteni dijeljeni novčanik), ali prijenos je
    // stigao U korisnikov novčanik — ostaje vidljiv kao PRILJEV. Simetrično
    // pravilu za odljev u napušteni novčanik.
    if (row.type === 'transfer' && row.income_source_id) {
      const dest = lookup(row.income_source_id, map, own);
      if (dest) return dest;
    }
    return { known: false, businessProfileId: null };
  }

  if (row.type === 'transfer' && row.income_source_id) {
    return lookup(row.income_source_id, map, own) ?? { known: false, businessProfileId: null };
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
