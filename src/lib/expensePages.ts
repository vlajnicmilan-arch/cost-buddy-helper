/**
 * Straničenje dohvata transakcija — čiste funkcije.
 *
 * Prva stranica se i dalje dohvaća sama (s `count: 'exact'`), a preostale
 * stranice se izračunaju iz ukupnog broja redaka i dohvaćaju istovremeno.
 * Redoslijed rezultata mora ostati isti kao kod sekvencijalnog dohvata, pa
 * se rasponi vraćaju rastuće i spajaju tim redom.
 */

export interface PageRange {
  from: number;
  to: number;
}

/**
 * Rasponi preostalih stranica (bez prve). Prazno kad prva stranica nije puna
 * ili kad ukupan broj redaka nije poznat (tada pozivatelj pada natrag na
 * sekvencijalno straničenje).
 */
export function planPageRanges(
  totalCount: number | null | undefined,
  pageSize: number,
  firstPageLength: number,
): PageRange[] {
  if (pageSize <= 0) return [];
  if (firstPageLength < pageSize) return [];
  if (typeof totalCount !== 'number' || !isFinite(totalCount)) return [];

  const ranges: PageRange[] = [];
  for (let from = pageSize; from < totalCount; from += pageSize) {
    ranges.push({ from, to: from + pageSize - 1 });
  }
  return ranges;
}

/** Spaja prvu stranicu i paralelno dohvaćene stranice u izvornom redoslijedu. */
export function concatPagesInOrder<T>(firstPage: T[], rest: T[][]): T[] {
  const out: T[] = [...firstPage];
  rest.forEach(page => out.push(...page));
  return out;
}
