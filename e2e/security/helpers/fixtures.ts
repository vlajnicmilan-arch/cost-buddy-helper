/**
 * Fixture helperi — svaki test spec kreira SVOJE fixture podatke pod sintetičkim
 * userom A, i po završetku ih uklanja (per-spec cleanup je afterAll u specu).
 * NE dira žive korisničke redove.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export async function createProject(
  client: SupabaseClient,
  ownerId: string,
  name = `sec-proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
): Promise<string> {
  const { data, error } = await client
    .from('projects')
    .insert({ user_id: ownerId, name, status: 'active' })
    .select('id')
    .single();
  if (error) throw new Error(`createProject: ${error.message}`);
  return data.id;
}

export async function createExpense(
  client: SupabaseClient,
  ownerId: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const { data, error } = await client
    .from('expenses')
    .insert({
      user_id: ownerId,
      amount: 42,
      description: 'sec-fixture',
      type: 'expense',
      date: new Date().toISOString().slice(0, 10),
      ...overrides,
    })
    .select('id')
    .single();
  if (error) throw new Error(`createExpense: ${error.message}`);
  return data.id;
}

export async function createCustomSource(
  client: SupabaseClient,
  ownerId: string,
  name = 'sec-source',
): Promise<string> {
  const { data, error } = await client
    .from('custom_payment_sources')
    .insert({ user_id: ownerId, name, type: 'wallet', currency: 'EUR' })
    .select('id')
    .single();
  if (error) throw new Error(`createCustomSource: ${error.message}`);
  return data.id;
}

export async function addProjectMember(
  client: SupabaseClient,
  projectId: string,
  userId: string,
  role: 'member' | 'worker' | 'investor',
): Promise<string> {
  const { data, error } = await client
    .from('project_members')
    .insert({ project_id: projectId, user_id: userId, role })
    .select('id')
    .single();
  if (error) throw new Error(`addProjectMember(${role}): ${error.message}`);
  return data.id;
}

export async function deleteProject(client: SupabaseClient, projectId: string): Promise<void> {
  await client.from('projects').delete().eq('id', projectId);
}
