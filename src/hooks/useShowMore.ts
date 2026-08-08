/**
 * useShowMore — jedinstveni obrazac za progresivno otkrivanje dugih lista.
 *
 * Prikazuje prvih `step` redaka; svaki poziv `showMore()` otkriva sljedećih
 * `step`. Kad više nema skrivenih redaka, `hasMore` je false (gumb nestaje).
 *
 * Redoslijed i sadržaj ulazne liste se NE dira — hook radi isključivo
 * `slice(0, visibleCount)`.
 *
 * Ako se lista skrati (npr. stavka odlučena pa ispala iz queue-a), broj
 * vidljivih se automatski spušta natrag na najbliži korak.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

export const SHOW_MORE_STEP = 20;

export interface UseShowMoreResult<T> {
  /** Vidljivi podskup — uvijek prefiks ulazne liste. */
  visible: T[];
  /** Ima li još skrivenih redaka. */
  hasMore: boolean;
  /** Koliko je redaka još skriveno. */
  remaining: number;
  /** Otkrij sljedećih `step` redaka. */
  showMore: () => void;
  /** Trenutni limit prikaza. */
  visibleCount: number;
}

export function useShowMore<T>(items: T[], step: number = SHOW_MORE_STEP): UseShowMoreResult<T> {
  const [visibleCount, setVisibleCount] = useState(step);

  // Lista se smanjila ispod trenutnog limita → vrati limit na prvi korak koji
  // pokriva novu duljinu, da gumb ne ostane "zapamćeno" otvoren bez potrebe.
  useEffect(() => {
    setVisibleCount((current) => {
      if (items.length <= step) return step;
      if (current <= items.length) return current;
      return Math.max(step, Math.ceil(items.length / step) * step);
    });
  }, [items.length, step]);

  const visible = useMemo(() => items.slice(0, visibleCount), [items, visibleCount]);
  const remaining = Math.max(0, items.length - visible.length);
  const showMore = useCallback(() => setVisibleCount((c) => c + step), [step]);

  return { visible, hasMore: remaining > 0, remaining, showMore, visibleCount };
}
