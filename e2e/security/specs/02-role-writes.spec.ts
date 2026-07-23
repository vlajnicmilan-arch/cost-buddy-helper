import { test, expect } from '@playwright/test';
import { authedClientFor, admin } from '../helpers/clients';
import { createProject, addProjectMember } from '../helpers/fixtures';

/**
 * Scenarij 2: worker / investor / member ne smiju izvoditi financijske zapise
 * na projektnim entitetima izvan svog scope-a.
 *
 * NAPOMENA: 'viewer' NIJE u živoj upotrebi (project_members.role ∈ {member,worker,investor});
 * u živoj bazi nema niti jednog viewera. Preskačemo defenzivno.
 */
test.describe('02 — niža uloga → financijski write', () => {
  let aId: string; let bId: string;
  let aClient: any; let bClient: any;
  let projectId: string;

  test.beforeAll(async () => {
    const A = await authedClientFor('a'); aId = A.userId; aClient = A.client;
    const B = await authedClientFor('b'); bId = B.userId; bClient = B.client;
    projectId = await createProject(aClient, aId);
  });

  test.afterEach(async () => {
    await admin().from('project_members').delete().eq('project_id', projectId);
  });

  test.afterAll(async () => {
    await admin().from('project_milestones').delete().eq('project_id', projectId);
    await admin().from('project_funding').delete().eq('project_id', projectId);
    await admin().from('expenses').delete().eq('project_id', projectId);
    await admin().from('projects').delete().eq('id', projectId);
  });

  for (const role of ['worker', 'investor'] as const) {
    test(`${role} ne smije INSERT milestone`, async () => {
      await addProjectMember(aClient, projectId, bId, role);
      const { error } = await bClient
        .from('project_milestones')
        .insert({ project_id: projectId, user_id: bId, name: 'evil', total_budget: 999 });
      expect(error, `${role} bi trebao biti odbijen`).not.toBeNull();
    });

    test(`${role} ne smije UPDATE milestone budget`, async () => {
      await addProjectMember(aClient, projectId, bId, role);
      // A najprije kreira milestone
      const { data: m } = await aClient
        .from('project_milestones')
        .insert({ project_id: projectId, user_id: aId, name: 'ok', total_budget: 100 })
        .select('id').single();
      const { data, error } = await bClient
        .from('project_milestones')
        .update({ total_budget: 999 })
        .eq('id', m!.id)
        .select('id');
      // Ili greška, ili "prazan update" (RLS filter na row)
      expect(error !== null || (data ?? []).length === 0).toBeTruthy();
      await admin().from('project_milestones').delete().eq('id', m!.id);
    });

    test(`${role} ne smije INSERT funding`, async () => {
      await addProjectMember(aClient, projectId, bId, role);
      const { error } = await bClient
        .from('project_funding')
        .insert({ project_id: projectId, user_id: bId, amount: 5000, source: 'x' });
      expect(error).not.toBeNull();
    });

    test(`${role} ne smije DELETE tuđe expense`, async () => {
      await addProjectMember(aClient, projectId, bId, role);
      const { data: e } = await aClient
        .from('expenses')
        .insert({
          user_id: aId, project_id: projectId, amount: 10, type: 'expense',
          date: new Date().toISOString().slice(0, 10), description: 'own',
        })
        .select('id').single();
      const { data, error } = await bClient
        .from('expenses').delete().eq('id', e!.id).select('id');
      expect(error !== null || (data ?? []).length === 0).toBeTruthy();
      await admin().from('expenses').delete().eq('id', e!.id);
    });
  }
});
