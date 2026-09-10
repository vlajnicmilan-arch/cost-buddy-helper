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

export interface FetchedPage<T> {
  rows: T[];
  count: number | null;
}

export interface LoadPagesOptions<T> {
  pageSize: number;
  /** Dohvat jedne stranice; `withCount` je true samo za prvu. */
  fetchPage: (from: number, withCount: boolean) => Promise<FetchedPage<T>>;
  /** false → sesija je nestala; straničenje staje prije novog upita. */
  isSessionAlive: () => boolean;
  /** Napredak (broj dosad prikupljenih redaka). */
  onProgress?: (rows: number) => void;
}

/**
 * Prva stranica sekvencijalno (nosi `count`), preostale istovremeno.
 * Kad `count` nije poznat, nastavlja sekvencijalno kao i dosad.
 */
export async function loadPagesInParallel<T>(
  opts: LoadPagesOptions<T>,
): Promise<{ rows: T[]; sessionLost: boolean }> {
  const { pageSize, fetchPage, isSessionAlive, onProgress } = opts;
  const progress = (n: number) => onProgress?.(n);

  if (!isSessionAlive()) return { rows: [], sessionLost: true };

  const first = await fetchPage(0, true);
  progress(first.rows.length);
  if (first.rows.length < pageSize) return { rows: first.rows, sessionLost: false };

  const ranges = planPageRanges(first.count, pageSize, first.rows.length);

  if (ranges.length > 0) {
    if (!isSessionAlive()) return { rows: [], sessionLost: true };
    const rest = await Promise.all(ranges.map(r => fetchPage(r.from, false)));
    if (!isSessionAlive()) return { rows: [], sessionLost: true };
    const all = concatPagesInOrder(first.rows, rest.map(p => p.rows));
    progress(all.length);
    return { rows: all, sessionLost: false };
  }

  const collected: T[] = [...first.rows];
  let from = pageSize;
  while (true) {
    if (!isSessionAlive()) return { rows: [], sessionLost: true };
    const page = await fetchPage(from, false);
    if (page.rows.length === 0) break;
    collected.push(...page.rows);
    progress(collected.length);
    if (page.rows.length < pageSize) break;
    from += pageSize;
  }
  return { rows: collected, sessionLost: false };
}
