/**
 * Guard: globalni razrješitelj označava mail stavku obrađenom SAMO kad uvoz
 * javi da je zabilježen; pad/odustajanje ne javljaju ništa pa stavka ostaje.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

const marked = vi.hoisted(() => ({ ids: [] as string[], ok: true }));

vi.mock('@/hooks/useStatementImport', () => ({
  markIngestItemLinked: async (id: string) => {
    marked.ids.push(id);
    return marked.ok;
  },
}));

import { useStatementLinkResolver } from '@/hooks/useStatementLinkResolver';
import {
  clearPendingStatementLink,
  loadPendingStatementLink,
  savePendingStatementLink,
} from '@/lib/mail/statementImportLink';

const Host = () => {
  useStatementLinkResolver();
  return null;
};

describe('useStatementLinkResolver', () => {
  beforeEach(() => {
    marked.ids = [];
    clearPendingStatementLink();
  });

  it('zabilježen uvoz označava stavku i čisti vezu', async () => {
    savePendingStatementLink({ itemId: 'item-1', sourceId: 'src-1', fileName: 'a.pdf', savedAt: Date.now() });
    render(<Host />);
    window.dispatchEvent(
      new CustomEvent('vm:pdf-import-completed', { detail: { sourceId: 'src-1', fileName: 'a.pdf' } }),
    );
    await waitFor(() => expect(marked.ids).toEqual(['item-1']));
    expect(loadPendingStatementLink()).toBeNull();
  });

  it('bez događaja uvoza (pad/odustajanje) stavka ostaje netaknuta', async () => {
    savePendingStatementLink({ itemId: 'item-2', sourceId: 'src-1', fileName: 'a.pdf', savedAt: Date.now() });
    render(<Host />);
    await new Promise((r) => setTimeout(r, 10));
    expect(marked.ids).toEqual([]);
    expect(loadPendingStatementLink()?.itemId).toBe('item-2');
  });

  it('uvoz drugog novčanika ne dira stavku', async () => {
    savePendingStatementLink({ itemId: 'item-3', sourceId: 'src-1', fileName: 'a.pdf', savedAt: Date.now() });
    render(<Host />);
    window.dispatchEvent(
      new CustomEvent('vm:pdf-import-completed', { detail: { sourceId: 'src-9', fileName: 'a.pdf' } }),
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(marked.ids).toEqual([]);
    expect(loadPendingStatementLink()?.itemId).toBe('item-3');
  });
});
