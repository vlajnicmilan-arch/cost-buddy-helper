import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env, L3_USERS, type L3UserKey } from './env';

let _admin: SupabaseClient | null = null;
export function admin(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(env.supabaseUrl, env.supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _admin;
}

/**
 * Idempotent: create-or-update local test user with known password + confirmed email.
 * Also sets profiles.is_e2e_user=true so any test-only paths kick in.
 */
export async function ensureUser(email: string): Promise<string> {
  const a = admin();
  let userId: string | null = null;
  let page = 1;
  while (true) {
    const { data, error } = await a.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) { userId = found.id; break; }
    if (data.users.length < 200) break;
    page += 1;
    if (page > 10) break;
  }

  if (!userId) {
    const { data, error } = await a.auth.admin.createUser({
      email,
      password: env.password,
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user!.id;
  } else {
    await a.auth.admin.updateUserById(userId, { password: env.password, email_confirm: true });
  }

  const { error: upsertErr } = await a
    .from('profiles')
    .upsert(
      { user_id: userId, is_e2e_user: true, onboarding_completed: true },
      { onConflict: 'user_id' },
    );
  if (upsertErr) throw upsertErr;
  return userId;
}

/**
 * Best-effort wipe of user-owned data between tests. Layer 3 is local-only
 * so we can just delete rows via service role.
 */
export async function wipeUserData(userId: string): Promise<void> {
  const a = admin();
  // Order matters for FK: expenses first, then projects.
  await a.from('expenses').delete().eq('user_id', userId);
  await a.from('projects').delete().eq('user_id', userId);
  await a.from('custom_payment_sources').delete().eq('user_id', userId);
}

/**
 * Seed a minimal fixture so the layer3 UI has:
 *  - at least one custom_payment_source → `summary-balance` (visible aggregate)
 *    renders on the compact home layout.
 *  - at least one project → AppStateContext backfill flips
 *    `projects_module_enabled` to true, so `nav-projects` renders in BottomNav.
 * Both scenarios were previously failing at the setup phase because a
 * freshly-reset user has neither, and the compact home hides balance/nav
 * when the underlying signal is empty.
 */
async function seedLayer3Fixture(userId: string): Promise<void> {
  const a = admin();
  await a.from('custom_payment_sources').insert({
    user_id: userId,
    name: 'L3 Test Wallet',
    balance: 1000,
    color: '#14b8a6',
    icon: 'wallet',
    currency: 'EUR',
  });
  await a.from('projects').insert({
    user_id: userId,
    name: 'L3 Seed Project',
    status: 'active',
    project_type: 'general',
    total_budget: 0,
  });
}

export async function resetUserByKey(key: L3UserKey): Promise<string> {
  const id = await ensureUser(L3_USERS[key]);
  await wipeUserData(id);
  await seedLayer3Fixture(id);
  return id;
}

