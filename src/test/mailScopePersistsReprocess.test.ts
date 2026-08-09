/**
 * ČUVAR — KORISNIKOVA KOREKCIJA ODREDIŠTA PREŽIVLJAVA PONOVNU OBRADU.
 *
 * Reprocess smije osvježiti ekstrakciju, ali NIKAD ne vraća scope na strojni
 * izračun kad je `scope_set_by_user = true`.
 */
import { describe, it, expect } from 'vitest';
import { upsertIngestItem } from '../../supabase/functions/_shared/mailImport/ingestItemUpsert.ts';

const makeClient = (existing: Record<string, unknown> | null) => {
  const updates: Record<string, unknown>[] = [];
  const inserts: Record<string, unknown>[] = [];
  const builder = () => {
    const b: any = {};
    b.select = () => b;
    b.eq = () => b;
    b.is = () => b;
    b.order = () => b;
    b.limit = async () => ({ data: existing ? [existing] : [] });
    b.update = (row: Record<string, unknown>) => {
      updates.push(row);
      return { eq: async () => ({ data: null }) };
    };
    b.insert = (row: Record<string, unknown>) => {
      inserts.push(row);
      return { select: () => ({ single: async () => ({ data: { id: 'novi' } }) }) };
    };
    return b;
  };
  return { client: { from: () => builder() }, updates, inserts };
};

const row = {
  status: 'na_pregledu',
  scope_type: 'user',
  scope_id: 'owner',
  extraction: { total_amount: 10 },
};

describe('upsertIngestItem — scope_set_by_user', () => {
  it('ne dira scope kad je korisnik odlučio, ali osvježava ekstrakciju', async () => {
    const { client, updates } = makeClient({
      id: 'i1',
      status: 'na_pregledu',
      scope_set_by_user: true,
    });
    const res = await upsertIngestItem(client, { messageId: 'm1', attachmentId: 'a1', row });
    expect(res.action).toBe('updated');
    expect(updates[0]).not.toHaveProperty('scope_type');
    expect(updates[0]).not.toHaveProperty('scope_id');
    expect(updates[0].extraction).toEqual({ total_amount: 10 });
  });

  it('strojni scope se osvježava kad korisnik nije odlučio', async () => {
    const { client, updates } = makeClient({
      id: 'i1',
      status: 'na_pregledu',
      scope_set_by_user: false,
    });
    await upsertIngestItem(client, { messageId: 'm1', attachmentId: 'a1', row });
    expect(updates[0].scope_type).toBe('user');
  });

  it('korisnikova odluka o statusu i dalje zaustavlja pisanje', async () => {
    const { client, updates } = makeClient({
      id: 'i1',
      status: 'povezan',
      scope_set_by_user: false,
    });
    const res = await upsertIngestItem(client, { messageId: 'm1', attachmentId: 'a1', row });
    expect(res.action).toBe('skipped');
    expect(updates).toHaveLength(0);
  });
});
