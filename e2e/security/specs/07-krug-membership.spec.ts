import { test, expect } from '@playwright/test';
import { authedClientFor, admin } from '../helpers/clients';

/**
 * Krug: role ∈ { punopravni, obicni }
 *  - punopravni: potpuni član; može upravljati zajedničkim izvorima, glasati o brisanjima itd.
 *  - obicni: niža prava; može vidjeti krug i sudjelovati (proposed/act flow) ali NE upravljati
 *
 * Adversarial: obicni pokušava akcije rezervirane za punopravnog / vlasnika.
 */
test.describe('07 — krug membership (obicni vs punopravni)', () => {
  let aId: string; let bId: string;
  let aClient: any; let bClient: any;
  let krugId: string;

  test.beforeAll(async () => {
    const A = await authedClientFor('a'); aId = A.userId; aClient = A.client;
    const B = await authedClientFor('b'); bId = B.userId; bClient = B.client;
    const { data: k, error: kerr } = await aClient
      .from('krug').insert({ name: 'sec-krug', owner_id: aId }).select('id').single();
    if (kerr) throw kerr;
    krugId = k!.id;
    // owner bootstrap trigger (krug_bootstrap_creator) postavlja A kao punopravnog.
    // Dodajemo B kao 'obicni'.
    const { error: mErr } = await admin()
      .from('krug_membership')
      .insert({ krug_id: krugId, user_id: bId, role: 'obicni' });
    if (mErr) throw mErr;
  });

  test.afterAll(async () => {
    await admin().from('krug_shared_payment_source').delete().eq('krug_id', krugId);
    await admin().from('krug_membership').delete().eq('krug_id', krugId);
    await admin().from('krug').delete().eq('id', krugId);
  });

  test('obicni vidi krug (dozvoljeno)', async () => {
    const { data } = await bClient.from('krug').select('id').eq('id', krugId);
    expect((data ?? []).length).toBe(1);
  });

  test('obicni NE SMIJE promovirati sebe u punopravnog', async () => {
    const { data, error } = await bClient
      .from('krug_membership')
      .update({ role: 'punopravni' })
      .eq('krug_id', krugId).eq('user_id', bId)
      .select('id');
    expect(error !== null || (data ?? []).length === 0).toBeTruthy();
  });

  test('obicni NE SMIJE brisati druge članove', async () => {
    // pokušaj brisanja ownera — mora biti odbijen (policy: only owner, not self)
    const { data, error } = await bClient
      .from('krug_membership').delete().eq('krug_id', krugId).eq('user_id', aId).select('id');
    expect(error !== null || (data ?? []).length === 0).toBeTruthy();
  });

  test('obicni NE SMIJE dodavati shared payment source', async () => {
    // krug_sps INSERT dozvoljen samo full memberu koji je i vlasnik sourcea
    const { error } = await bClient
      .from('krug_shared_payment_source')
      .insert({ krug_id: krugId, source_id: '00000000-0000-0000-0000-000000000000', added_by: bId });
    expect(error).not.toBeNull();
  });

  test('obicni NE SMIJE mijenjati krug meta', async () => {
    const { data, error } = await bClient
      .from('krug').update({ name: 'hijacked' }).eq('id', krugId).select('id');
    expect(error !== null || (data ?? []).length === 0).toBeTruthy();
    const { data: check } = await admin().from('krug').select('name').eq('id', krugId).single();
    expect(check?.name).toBe('sec-krug');
  });
});
