/**
 * Guard: veza „mail kartica izvoda → zabilježeni uvoz".
 * Samo stvarno zabilježen uvoz miče stavku iz reda „Na pregled".
 */
import { describe, expect, it } from 'vitest';
import {
  MAIL_STATEMENT_LINK_TTL_MS,
  clearPendingStatementLink,
  loadPendingStatementLink,
  matchesPendingLink,
  savePendingStatementLink,
} from '@/lib/mail/statementImportLink';

function memStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

const link = { itemId: 'i1', sourceId: 's1', fileName: 'izvod.pdf', savedAt: 1000 };

describe('pending statement link', () => {
  it('sprema i vraća vezu', () => {
    const s = memStorage();
    savePendingStatementLink(link, s);
    expect(loadPendingStatementLink({ now: 2000, storage: s })).toEqual(link);
  });

  it('istekla veza se ne vraća', () => {
    const s = memStorage();
    savePendingStatementLink(link, s);
    expect(
      loadPendingStatementLink({ now: 1000 + MAIL_STATEMENT_LINK_TTL_MS + 1, storage: s }),
    ).toBeNull();
  });

  it('brisanje uklanja vezu', () => {
    const s = memStorage();
    savePendingStatementLink(link, s);
    clearPendingStatementLink(s);
    expect(loadPendingStatementLink({ storage: s })).toBeNull();
  });

  it('uvoz istog novčanika i datoteke se poklapa', () => {
    expect(matchesPendingLink(link, { sourceId: 's1', fileName: 'izvod.pdf' })).toBe(true);
    expect(matchesPendingLink(link, { sourceId: 's1', fileName: null })).toBe(true);
  });

  it('drugi novčanik ili druga datoteka se NE poklapaju', () => {
    expect(matchesPendingLink(link, { sourceId: 's2', fileName: 'izvod.pdf' })).toBe(false);
    expect(matchesPendingLink(link, { sourceId: 's1', fileName: 'drugi.pdf' })).toBe(false);
    expect(matchesPendingLink(null, { sourceId: 's1', fileName: 'izvod.pdf' })).toBe(false);
  });
});
