/**
 * Čuvar za "Prikaži još" obrazac: lista od 45 stavki → 20, pa 40, pa 45,
 * i tek tada gumb nestaje.
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useShowMore, SHOW_MORE_STEP } from '@/hooks/useShowMore';

const list = (n: number) => Array.from({ length: n }, (_, i) => i);

describe('useShowMore', () => {
  it('45 stavki → 20 → 40 → 45, gumb nestaje', () => {
    const { result } = renderHook(() => useShowMore(list(45)));
    expect(SHOW_MORE_STEP).toBe(20);
    expect(result.current.visible).toHaveLength(20);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.remaining).toBe(25);

    act(() => result.current.showMore());
    expect(result.current.visible).toHaveLength(40);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.remaining).toBe(5);

    act(() => result.current.showMore());
    expect(result.current.visible).toHaveLength(45);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.remaining).toBe(0);
  });

  it('kratka lista nema gumb', () => {
    const { result } = renderHook(() => useShowMore(list(7)));
    expect(result.current.visible).toHaveLength(7);
    expect(result.current.hasMore).toBe(false);
  });

  it('vidljivi podskup je uvijek prefiks — redoslijed se ne dira', () => {
    const items = list(45).map((i) => `x${i}`);
    const { result } = renderHook(() => useShowMore(items));
    expect(result.current.visible).toEqual(items.slice(0, 20));
  });

  it('prazna lista', () => {
    const { result } = renderHook(() => useShowMore<number>([]));
    expect(result.current.visible).toEqual([]);
    expect(result.current.hasMore).toBe(false);
  });

  it('lista se skrati → limit se spusti, gumb ne ostane visjeti', () => {
    const { result, rerender } = renderHook(({ n }) => useShowMore(list(n)), {
      initialProps: { n: 45 },
    });
    act(() => result.current.showMore());
    expect(result.current.visible).toHaveLength(40);
    rerender({ n: 5 });
    expect(result.current.visible).toHaveLength(5);
    expect(result.current.hasMore).toBe(false);
  });
});
