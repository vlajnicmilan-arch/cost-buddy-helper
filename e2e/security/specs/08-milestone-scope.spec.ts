import { test, expect } from '@playwright/test';
import { authedClientFor, admin } from '../helpers/clients';
import { createProject, addProjectMember } from '../helpers/fixtures';

/**
 * Korak A — role-scoped čitanje faza projekta.
 *
 * Pravilo:
 *   budget          → owner, viewer, member
 *   investor_price  → owner, viewer, investor
 *   worker          → nijedan iznos
 *   investor        → pogled 0 redaka (nije "participant"), ali RPC vraća cijene
 *   svi osim vlasnika → izravan select nad project_milestones = prazno
 *
 * Provjera ide na SIROVOM JSON odgovoru (RE + REST), ne na prikazu.
 */

type Role = 'member' | 'viewer' | 'worker' | 'investor';
const ROLES: Role[] = ['member', 'viewer', 'worker', 'investor'];

const BUDGET = 1234.56;
const PRICE = 7777.77;

test.describe('08 — scope iznosa na fazama projekta', () => {
  let aId: string; let bId: string;
  let aClient: any; let bClient: any;
  const projectByRole: Record<string, string> = {};
  const milestoneByRole: Record<string, string> = {};

  test.beforeAll(async () => {
    const A = await authedClientFor('a'); aId = A.userId; aClient = A.client;
    const B = await authedClientFor('b'); bId = B.userId; bClient = B.client;

    for (const role of ROLES) {
      const pid = await createProject(aClient, aId, `sec-ms-${role}-${Date.now()}`);
      projectByRole[role] = pid;
      await addProjectMember(aClient, pid, bId, role as any);
      const { data, error } = await aClient
        .from('project_milestones')
        .insert({
          project_id: pid,
          name: `M-${role}`,
          budget: BUDGET,
          investor_price: PRICE,
        })
        .select('id')
        .single();
      if (error) throw new Error(`milestone insert (${role}): ${error.message}`);
      milestoneByRole[role] = data.id;
    }
  });

  test.afterAll(async () => {
    const ids = Object.values(projectByRole);
    for (const pid of ids) {
      await admin().from('project_milestones').delete().eq('project_id', pid);
      await admin().from('project_members').delete().eq('project_id', pid);
      await admin().from('projects').delete().eq('id', pid);
    }
  });

  test('owner vidi oba iznosa', async () => {
    const pid = projectByRole.member;
    const { data, error } = await aClient
      .from('project_milestones_scoped')
      .select('id, budget, investor_price')
      .eq('project_id', pid);
    expect(error).toBeNull();
    expect((data ?? []).length).toBe(1);
    expect(Number(data![0].budget)).toBe(BUDGET);
    expect(Number(data![0].investor_price)).toBe(PRICE);
  });

  test('member: budget DA, investor_price NE', async () => {
    const pid = projectByRole.member;
    const { data, error } = await bClient
      .from('project_milestones_scoped')
      .select('id, budget, investor_price')
      .eq('project_id', pid);
    expect(error).toBeNull();
    expect((data ?? []).length).toBe(1);
    expect(Number(data![0].budget)).toBe(BUDGET);
    expect(data![0].investor_price, 'member je vidio investor_price').toBeNull();
  });

  test('viewer: oba iznosa', async () => {
    const pid = projectByRole.viewer;
    const { data, error } = await bClient
      .from('project_milestones_scoped')
      .select('id, budget, investor_price')
      .eq('project_id', pid);
    expect(error).toBeNull();
    expect((data ?? []).length).toBe(1);
    expect(Number(data![0].budget)).toBe(BUDGET);
    expect(Number(data![0].investor_price)).toBe(PRICE);
  });

  test('worker: nijedan iznos ni na jednom retku', async () => {
    const pid = projectByRole.worker;
    const { data, error } = await bClient
      .from('project_milestones_scoped')
      .select('id, budget, investor_price')
      .eq('project_id', pid);
    expect(error).toBeNull();
    for (const row of data ?? []) {
      expect(row.budget, 'worker je vidio budget').toBeNull();
      expect(row.investor_price, 'worker je vidio investor_price').toBeNull();
    }
  });

  test('worker: investitorski RPC vraća 0 redaka', async () => {
    const { data, error } = await bClient.rpc('get_investor_project_phases', {
      _project_id: projectByRole.worker,
    });
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });

  test('investor: pogled 0 redaka, RPC vraća cijene', async () => {
    const pid = projectByRole.investor;
    const view = await bClient
      .from('project_milestones_scoped')
      .select('id, budget, investor_price')
      .eq('project_id', pid);
    expect(view.error).toBeNull();
    expect(view.data ?? []).toEqual([]);

    const { data, error } = await bClient.rpc('get_investor_project_phases', {
      _project_id: pid,
    });
    expect(error).toBeNull();
    expect((data ?? []).length).toBe(1);
    expect(Number((data as any[])[0].investor_price)).toBe(PRICE);
    expect((data as any[])[0]).not.toHaveProperty('budget');
  });

  test('owner: RPC vraća cijene', async () => {
    const { data, error } = await aClient.rpc('get_investor_project_phases', {
      _project_id: projectByRole.investor,
    });
    expect(error).toBeNull();
    expect((data ?? []).length).toBe(1);
  });

  for (const role of ROLES) {
    test(`${role}: izravan select nad project_milestones je prazan`, async () => {
      const { data, error } = await bClient
        .from('project_milestones')
        .select('id, budget, investor_price')
        .eq('project_id', projectByRole[role]);
      expect(error).toBeNull();
      expect(data ?? [], `${role} je pročitao baznu tablicu`).toEqual([]);
    });
  }

  test('vlasnik i dalje čita baznu tablicu (pisanje ostaje na tablici)', async () => {
    const { data, error } = await aClient
      .from('project_milestones')
      .select('id, budget')
      .eq('project_id', projectByRole.member);
    expect(error).toBeNull();
    expect((data ?? []).length).toBe(1);
  });
});
