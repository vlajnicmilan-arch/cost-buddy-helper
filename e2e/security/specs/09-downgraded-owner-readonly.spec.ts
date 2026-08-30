import { test, expect } from '@playwright/test';
import { authedClientFor, admin } from '../helpers/clients';
import { createProject } from '../helpers/fixtures';
import { ensureModuleEntitlement } from '../helpers/users';

/**
 * Vlasnik BEZ prava na modul "projekti" (downgrade):
 *   - MORA vidjeti vlastite projekte i vezane zapise (pregled + izvoz)
 *   - NE SMIJE pisati (insert / update / delete)
 *   - tuđi korisnik i dalje ne vidi ništa
 *
 * Regresija: RESTRICTIVE politike `*_readonly_when_downgraded` bile su pisane
 * kao FOR ALL, pa su gasile i SELECT — vlasniku su projekti nestajali.
 */
test.describe('09 — downgraded owner: vidi, ne piše', () => {
  let aId: string; let bId: string;
  let aClient: any; let bClient: any;
  let projectId: string;
  let milestoneId: string;

  test.beforeAll(async () => {
    const A = await authedClientFor('a'); aId = A.userId; aClient = A.client;
    const B = await authedClientFor('b'); bId = B.userId; bClient = B.client;

    // Projekt se kreira DOK vlasnik još ima pravo na modul.
    projectId = await createProject(aClient, aId, `sec-downgrade-${Date.now()}`);
    await admin()
      .from('project_documents')
      .insert({ project_id: projectId, name: 'a.pdf', storage_path: 'sec/a.pdf', uploaded_by: aId });
    const { data: ms } = await admin()
      .from('project_milestones')
      .insert({ project_id: projectId, name: 'Faza 1' })
      .select('id')
      .single();
    milestoneId = ms.id;

    // Downgrade: uklanjamo pravo na modul.
    await admin().from('user_entitlements').delete().eq('user_id', aId).eq('module', 'projekti');
  });

  test.afterAll(async () => {
    await admin().from('project_documents').delete().eq('project_id', projectId);
    await admin().from('project_milestones').delete().eq('project_id', projectId);
    await admin().from('projects').delete().eq('id', projectId);
    await ensureModuleEntitlement(aId, 'projekti');
  });

  test('vlasnik bez prava VIDI svoj projekt', async () => {
    const { data, error } = await aClient.from('projects').select('id,name').eq('id', projectId);
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
  });

  test('vlasnik bez prava VIDI vezane dokumente', async () => {
    const { data, error } = await aClient
      .from('project_documents')
      .select('id')
      .eq('project_id', projectId);
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
  });

  test('vlasnik bez prava NE MOŽE mijenjati projekt', async () => {
    const { data } = await aClient
      .from('projects')
      .update({ name: 'hack' })
      .eq('id', projectId)
      .select('id');
    expect(data ?? []).toHaveLength(0);
    const { data: after } = await admin().from('projects').select('name').eq('id', projectId).single();
    expect(after?.name).not.toBe('hack');
  });

  test('vlasnik bez prava NE MOŽE brisati projekt', async () => {
    const { data } = await aClient.from('projects').delete().eq('id', projectId).select('id');
    expect(data ?? []).toHaveLength(0);
    const { count } = await admin()
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('id', projectId);
    expect(count).toBe(1);
  });

  test('vlasnik bez prava NE MOŽE kreirati novi projekt', async () => {
    const { error } = await aClient
      .from('projects')
      .insert({ user_id: aId, name: 'blocked', status: 'active' })
      .select('id');
    expect(error).not.toBeNull();
  });

  test('vlasnik bez prava VIDI svoje faze', async () => {
    const { data, error } = await aClient
      .from('project_milestones')
      .select('id,name')
      .eq('project_id', projectId);
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
  });

  test('vlasnik bez prava NE MOŽE mijenjati fazu', async () => {
    const { data } = await aClient
      .from('project_milestones')
      .update({ name: 'hack' })
      .eq('id', milestoneId)
      .select('id');
    expect(data ?? []).toHaveLength(0);
    const { data: after } = await admin()
      .from('project_milestones')
      .select('name')
      .eq('id', milestoneId)
      .single();
    expect(after?.name).not.toBe('hack');
  });

  test('vlasnik bez prava NE MOŽE brisati fazu', async () => {
    const { data } = await aClient.from('project_milestones').delete().eq('id', milestoneId).select('id');
    expect(data ?? []).toHaveLength(0);
    const { count } = await admin()
      .from('project_milestones')
      .select('id', { count: 'exact', head: true })
      .eq('id', milestoneId);
    expect(count).toBe(1);
  });

  test('vlasnik bez prava NE MOŽE dodati fazu', async () => {
    const { error } = await aClient
      .from('project_milestones')
      .insert({ project_id: projectId, name: 'blocked' })
      .select('id');
    expect(error).not.toBeNull();
  });

  test('tuđi korisnik ne vidi ništa', async () => {
    const { data: p } = await bClient.from('projects').select('id').eq('id', projectId);
    expect(p ?? []).toHaveLength(0);
    const { data: d } = await bClient.from('project_documents').select('id').eq('project_id', projectId);
    expect(d ?? []).toHaveLength(0);
    const { data: m } = await bClient.from('project_milestones').select('id').eq('project_id', projectId);
    expect(m ?? []).toHaveLength(0);
    expect(bId).not.toBe(aId);
  });
});
