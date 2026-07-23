import { test, expect } from '@playwright/test';
import { authedClientFor, admin } from '../helpers/clients';
import {
  createProject, createExpense, createCustomSource, deleteProject,
} from '../helpers/fixtures';

/**
 * Scenarij 1 & 4 (čitanja): user B pokušava čitati resurse korisnika A.
 * Očekivano: RLS vraća prazan skup (bez greške) ili odbija (403/permission).
 */
test.describe('01 — cross-user reads (RLS)', () => {
  let aId: string; let bId: string;
  let aClient: Awaited<ReturnType<typeof authedClientFor>>['client'];
  let bClient: Awaited<ReturnType<typeof authedClientFor>>['client'];
  let projectAId: string; let expenseAId: string; let sourceAId: string;

  test.beforeAll(async () => {
    const A = await authedClientFor('a'); aId = A.userId; aClient = A.client;
    const B = await authedClientFor('b'); bId = B.userId; bClient = B.client;
    projectAId = await createProject(aClient, aId);
    sourceAId = await createCustomSource(aClient, aId);
    expenseAId = await createExpense(aClient, aId, {
      project_id: projectAId,
      payment_source: `custom:${sourceAId}`,
    });
  });

  test.afterAll(async () => {
    // per-spec cleanup (kreirano samo pod aId — service key je za sigurnost teardowna)
    await admin().from('expenses').delete().eq('user_id', aId);
    await admin().from('custom_payment_sources').delete().eq('user_id', aId);
    await admin().from('projects').delete().eq('user_id', aId);
  });

  test('B ne vidi A-in projekt izravnim select-om', async () => {
    const { data, error } = await bClient
      .from('projects').select('id').eq('id', projectAId);
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });

  test('B ne vidi A-inu transakciju po project_id', async () => {
    const { data, error } = await bClient
      .from('expenses').select('id').eq('project_id', projectAId);
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });

  test('B ne vidi A-inu transakciju po id-u', async () => {
    const { data, error } = await bClient
      .from('expenses').select('id').eq('id', expenseAId);
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });

  test('B ne vidi A-in custom payment source', async () => {
    const { data, error } = await bClient
      .from('custom_payment_sources').select('id').eq('id', sourceAId);
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });

  test('B ne vidi A-ine imported_statements po user_id filteru', async () => {
    const { data, error } = await bClient
      .from('imported_statements').select('id').eq('user_id', aId);
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });

  test('B ne vidi A-ine user_entitlements', async () => {
    const { data, error } = await bClient
      .from('user_entitlements').select('id').eq('user_id', aId);
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });

  test('B ne vidi A-in profile detalje kroz maska za listu', async () => {
    // profiles su vidljivi ali samo javna polja — ovdje samo tvrdimo da B ne vidi A-in email
    const { data, error } = await bClient
      .from('profiles').select('email').eq('user_id', aId);
    expect(error).toBeNull();
    // Politika bi trebala vratiti prazno ili null email
    for (const row of data ?? []) {
      expect(row.email == null || row.email === '').toBeTruthy();
    }
  });
});
