import { test, expect } from '@playwright/test';
import { authedClientFor, admin } from '../helpers/clients';
import { createProject, addProjectMember } from '../helpers/fixtures';

/**
 * Scenarij 3: investor → interni podaci izvođača.
 *
 * PO DIZAJNU investor SMIJE vidjeti (frontend InvestorPhasesView):
 *  - naziv projekta, phase naziv i status, javna polja milestonea
 *
 * INVESTOR NE SMIJE vidjeti:
 *  - individualne financijske transakcije (expenses po project_id) — worklog sati, worker payouts, interne bilješke
 *
 * Ovaj spec je adversarial: investor pokušava izravno preko REST-a povući što
 * frontend ne prikazuje. Padne li assertion → potvrđena rupa u RLS-u.
 */
test.describe('03 — investor scope', () => {
  let aId: string; let bId: string;
  let aClient: any; let bClient: any;
  let projectId: string; let milestoneId: string; let expenseId: string;

  test.beforeAll(async () => {
    const A = await authedClientFor('a'); aId = A.userId; aClient = A.client;
    const B = await authedClientFor('b'); bId = B.userId; bClient = B.client;
    projectId = await createProject(aClient, aId);
    await addProjectMember(aClient, projectId, bId, 'investor');
    const { data: m } = await aClient
      .from('project_milestones')
      .insert({ project_id: projectId, user_id: aId, name: 'M1', total_budget: 1234 })
      .select('id').single();
    milestoneId = m!.id;
    const { data: e } = await aClient
      .from('expenses')
      .insert({
        user_id: aId, project_id: projectId, amount: 500, type: 'expense',
        date: new Date().toISOString().slice(0, 10), description: 'interno',
      })
      .select('id').single();
    expenseId = e!.id;
  });

  test.afterAll(async () => {
    await admin().from('expenses').delete().eq('project_id', projectId);
    await admin().from('project_milestones').delete().eq('project_id', projectId);
    await admin().from('project_members').delete().eq('project_id', projectId);
    await admin().from('project_worker_payouts').delete().eq('project_id', projectId);
    await admin().from('project_work_entries').delete().eq('project_id', projectId);
    await admin().from('projects').delete().eq('id', projectId);
  });

  test('investor NE SMIJE čitati financijske expense retke po project_id', async () => {
    const { data, error } = await bClient
      .from('expenses').select('id, amount, description').eq('project_id', projectId);
    expect(error).toBeNull();
    // rupa: ako vraća bilo koji expense → CURENJE
    expect(data ?? [], 'investor je dobio raw financije').toEqual([]);
  });

  test('investor NE SMIJE čitati worker payouts', async () => {
    const { data, error } = await bClient
      .from('project_worker_payouts').select('id, paid_amount').eq('project_id', projectId);
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });

  test('investor NE SMIJE čitati work entries', async () => {
    const { data, error } = await bClient
      .from('project_work_entries').select('id').eq('project_id', projectId);
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });

  test('investor NE SMIJE čitati punu listu workera', async () => {
    const { data, error } = await bClient
      .from('project_workers').select('id, user_id').eq('project_id', projectId);
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });

  test('investor NE SMIJE čitati project_funding', async () => {
    const { data, error } = await bClient
      .from('project_funding').select('id, amount').eq('project_id', projectId);
    expect(error).toBeNull();
    // rupa: prisustvo funding retka je financijski leak
    expect(data ?? []).toEqual([]);
  });

  test('investor NE SMIJE čitati project_documents (mogu sadržavati ugovore/iznose)', async () => {
    const { data, error } = await bClient
      .from('project_documents').select('id').eq('project_id', projectId);
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });

  test('investor NE SMIJE čitati milestone total_budget', async () => {
    // Ovaj test dokumentira "što investitor ne bi trebao vidjeti"; ako RLS pušta,
    // spec padne i to je nalaz.
    const { data, error } = await bClient
      .from('project_milestones').select('id, total_budget').eq('id', milestoneId);
    expect(error).toBeNull();
    if ((data ?? []).length > 0) {
      // Formalno tvrdimo da total_budget nije eksponiran; ovdje samo prijavljujemo.
      // Ako je politika promijenjena da vraća, expect failuje.
      const budget = data![0].total_budget;
      expect(budget, 'investor je pročitao total_budget milestonea').toBeNull();
    }
  });

  test('investor SMIJE vidjeti projekt (dozvoljeno po dizajnu)', async () => {
    const { data, error } = await bClient
      .from('projects').select('id, name').eq('id', projectId);
    expect(error).toBeNull();
    expect((data ?? []).length).toBe(1);
  });
});
