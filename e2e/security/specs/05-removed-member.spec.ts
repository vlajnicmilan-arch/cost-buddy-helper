import { test, expect } from '@playwright/test';
import { authedClientFor, admin } from '../helpers/clients';
import { createProject, addProjectMember } from '../helpers/fixtures';

/**
 * Scenarij 5: uklonjeni član gubi pristup u istom trenutku.
 */
test.describe('05 — removed member', () => {
  let aId: string; let bId: string;
  let aClient: any; let bClient: any;
  let projectId: string; let memberRowId: string;

  test.beforeAll(async () => {
    const A = await authedClientFor('a'); aId = A.userId; aClient = A.client;
    const B = await authedClientFor('b'); bId = B.userId; bClient = B.client;
    projectId = await createProject(aClient, aId);
    memberRowId = await addProjectMember(aClient, projectId, bId, 'member');
  });

  test.afterAll(async () => {
    await admin().from('project_members').delete().eq('project_id', projectId);
    await admin().from('expenses').delete().eq('project_id', projectId);
    await admin().from('projects').delete().eq('id', projectId);
  });

  test('prije uklanjanja B vidi projekt', async () => {
    const { data } = await bClient.from('projects').select('id').eq('id', projectId);
    expect((data ?? []).length).toBe(1);
  });

  test('nakon uklanjanja B više NE vidi projekt', async () => {
    await admin().from('project_members').delete().eq('id', memberRowId);
    const { data } = await bClient.from('projects').select('id').eq('id', projectId);
    expect(data ?? []).toEqual([]);
  });

  test('nakon uklanjanja B ne može INSERT expense u projekt', async () => {
    const { error } = await bClient.from('expenses').insert({
      user_id: bId, project_id: projectId, amount: 1, type: 'expense',
      date: new Date().toISOString().slice(0, 10), description: 'sneak',
    });
    expect(error).not.toBeNull();
  });

  test('nakon uklanjanja B ne vidi expense retke projekta', async () => {
    await aClient.from('expenses').insert({
      user_id: aId, project_id: projectId, amount: 5, type: 'expense',
      date: new Date().toISOString().slice(0, 10), description: 'after-remove',
    });
    const { data } = await bClient
      .from('expenses').select('id').eq('project_id', projectId);
    expect(data ?? []).toEqual([]);
  });
});
