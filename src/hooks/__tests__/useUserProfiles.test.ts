/**
 * useUserProfiles — dokaz da hook NE zaključa trajno prazni rezultat.
 *
 * Prije fixa: neuspješni resolve (RLS filtrira, ili user ne postoji) upisao je
 * sentinel `{ display_name: '' }` u modulski cache, pa kasniji fix (npr. RLS
 * policy koja otvara vidljivost članova istog Kruga) ostane nevidljiv do
 * reloada taba.
 *
 * Poslije fixa: sentinel se ne upisuje; ponovni dohvat istog ID-ja u novom
 * hook mount-u ponovo pogađa Supabase i može vratiti realno ime.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const hoisted = vi.hoisted(() => ({
  fromSpy: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...args: any[]) => hoisted.fromSpy(...args) },
}));

function makeThenable(rows: Array<{ user_id: string; display_name: string | null }>) {
  const chain: any = {
    select: vi.fn(() => chain),
    in: vi.fn(() => Promise.resolve({ data: rows, error: null })),
  };
  return chain;
}

// Modul se importa nakon mocka.
async function importHook() {
  vi.resetModules();
  const mod = await import('@/hooks/useUserProfiles');
  return mod.useUserProfiles;
}

beforeEach(() => {
  hoisted.fromSpy.mockReset();
});

afterEach(() => {
  vi.resetModules();
});

describe('useUserProfiles — no permanent-empty sentinel', () => {
  it('re-queries when previous fetch returned no rows for that ID', async () => {
    // 1. runda: RLS filtrira, vraća prazno.
    hoisted.fromSpy.mockImplementationOnce(() => makeThenable([]));
    // 2. runda: policy je proradila, vraća pravo ime.
    hoisted.fromSpy.mockImplementationOnce(() =>
      makeThenable([{ user_id: 'u1', display_name: 'Ana' }]),
    );

    const useUserProfiles = await importHook();

    const first = renderHook(({ ids }: { ids: string[] }) => useUserProfiles(ids), {
      initialProps: { ids: ['u1'] },
    });
    await waitFor(() => expect(hoisted.fromSpy).toHaveBeenCalledTimes(1));
    expect(first.result.current.get('u1')).toBeUndefined();
    first.unmount();

    // Novi mount → novi fetch pokušaj za isti ID, jer nema sentinela u cache-u.
    const second = renderHook(({ ids }: { ids: string[] }) => useUserProfiles(ids), {
      initialProps: { ids: ['u1'] },
    });
    await waitFor(() => expect(hoisted.fromSpy).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(second.result.current.get('u1')?.display_name).toBe('Ana'),
    );
  });

  it('caches resolved names (does not re-query when already known)', async () => {
    hoisted.fromSpy.mockImplementationOnce(() =>
      makeThenable([{ user_id: 'u2', display_name: 'Bruno' }]),
    );

    const useUserProfiles = await importHook();

    const first = renderHook(() => useUserProfiles(['u2']));
    await waitFor(() => expect(hoisted.fromSpy).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(first.result.current.get('u2')?.display_name).toBe('Bruno'),
    );
    first.unmount();

    // Drugi mount za isti ID → pogodak u cache, bez novog fetcha.
    const second = renderHook(() => useUserProfiles(['u2']));
    await waitFor(() =>
      expect(second.result.current.get('u2')?.display_name).toBe('Bruno'),
    );
    expect(hoisted.fromSpy).toHaveBeenCalledTimes(1);
  });
});
