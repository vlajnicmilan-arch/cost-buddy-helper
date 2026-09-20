/**
 * Doseg novčanika se dohvaća uvijek — prozor svježine smije preskočiti samo
 * transakcije, a povratak u fokus / refetch obnavljaju i mapu.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SOURCE = readFileSync('src/hooks/useExpenseFetch.ts', 'utf8');

describe('useExpenseFetch — doseg novčanika', () => {
  it('početni efekt zove fetchOwnedSources PRIJE provjere svježine', () => {
    const owned = SOURCE.indexOf('const { sharedIds } = await fetchOwnedSources();');
    const fresh = SOURCE.indexOf('isExpensesFresh(userId)');
    expect(owned).toBeGreaterThan(0);
    expect(fresh).toBeGreaterThan(owned);
  });

  it('povratak u fokus obnavlja i doseg', () => {
    expect(SOURCE).toMatch(/useAppResume\(async \(\) => \{[\s\S]{0,160}fetchOwnedSources\(\)/);
  });

  it('refetch obnavlja i doseg', () => {
    expect(SOURCE).toMatch(/const refetch = useCallback\(async \(\) => \{[\s\S]{0,160}fetchOwnedSources\(\)/);
  });

  it('instanca starta iz dijeljenog cachea i sluša njegove promjene', () => {
    expect(SOURCE).toContain('readSourceScope(user?.id)');
    expect(SOURCE).toContain('subscribeSourceScope(userId');
    expect(SOURCE).toContain('writeSourceScope(user.id');
  });

  it('prazna mapa se bilježi u dijagnostiku, bez poruke korisniku', () => {
    expect(SOURCE).toContain("event: 'source_map_empty_at_render'");
  });
});
