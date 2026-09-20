import { test, expect } from '@playwright/test';
import { authedClientFor, admin } from '../helpers/clients';
import { createCustomSource } from '../helpers/fixtures';

/**
 * Scenarij 8: član dijeljenog novčanika smije obrisati SAMO svoje članstvo.
 *   - član briše sebe → prolazi;
 *   - član briše drugog člana → odbijeno;
 *   - vlasnikov (owner) red se ne smije obrisati kroz člansku politiku.
 */
test.describe('08 — izlazak iz dijeljenog novčanika', () => {
  let aId: string; let bId: string;
  let aClient: any; let bClient: any;
  let sourceId: string;

  test.beforeAll(async () => {
    const A = await authedClientFor('a'); aId = A.userId; aClient = A.client;
    const B = await authedClientFor('b'); bId = B.userId; bClient = B.client;
    sourceId = await createCustomSource(aClient, aId, 'sec-shared-leave');
  });

  test.afterEach(async () => {
    await admin().from('payment_source_members').delete().eq('payment_source_id', sourceId);
  });

  test.afterAll(async () => {
    await admin().from('custom_payment_sources').delete().eq('id', sourceId);
  });

  const addMember = async (userId: string, role: string) => {
    const { data, error } = await admin()
      .from('payment_source_members')
      .insert({ payment_source_id: sourceId, user_id: userId, role })
      .select('id')
      .single();
    if (error) throw new Error(`addMember: ${error.message}`);
    return data.id as string;
  };

  test('član smije obrisati svoje članstvo', async () => {
    const memberId = await addMember(bId, 'limited');
    const { error } = await bClient.from('payment_source_members').delete().eq('id', memberId);
    expect(error).toBeNull();
    const { data } = await admin().from('payment_source_members').select('id').eq('id', memberId);
    expect(data ?? []).toHaveLength(0);
  });

  test('član ne smije obrisati tuđe članstvo', async () => {
    await addMember(bId, 'limited');
    const otherId = await addMember(aId, 'limited');
    const { data, error } = await bClient
      .from('payment_source_members')
      .delete()
      .eq('id', otherId)
      .select('id');
    expect(error !== null || (data ?? []).length === 0).toBeTruthy();
    const { data: still } = await admin().from('payment_source_members').select('id').eq('id', otherId);
    expect(still ?? []).toHaveLength(1);
  });

  test('owner red se ne briše kroz člansku politiku', async () => {
    const ownerRow = await addMember(bId, 'owner');
    const { data, error } = await bClient
      .from('payment_source_members')
      .delete()
      .eq('id', ownerRow)
      .select('id');
    expect(error !== null || (data ?? []).length === 0).toBeTruthy();
  });
});
