import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env, E2E_USERS, type E2EUserKey } from './env';

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
 * Ensure an E2E user exists, has profiles.is_e2e_user = true, and known password.
 * Idempotent — safe to call from global-setup.
 */
export async function ensureE2EUser(email: string): Promise<string> {
  const a = admin();
  // Look up by email via paged listing (Supabase admin API has no direct lookup)
  let userId: string | null = null;
  let page = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await a.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) { userId = found.id; break; }
    if (data.users.length < 200) break;
    page += 1;
    if (page > 25) break; // hard stop
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
    // Reset password to known value in case it drifted
    await a.auth.admin.updateUserById(userId, { password: env.password, email_confirm: true });
  }

  // Ensure profile row + flag
  const { error: upsertErr } = await a
    .from('profiles')
    .upsert(
      { user_id: userId, is_e2e_user: true, onboarding_completed: false },
      { onConflict: 'user_id' },
    );
  if (upsertErr) throw upsertErr;

  return userId;
}

export async function resetE2EUser(userId: string): Promise<void> {
  const { error } = await admin().rpc('e2e_reset_user', { p_user_id: userId });
  if (error) throw error;
}

export async function resetUserByKey(key: E2EUserKey): Promise<string> {
  const id = await ensureE2EUser(E2E_USERS[key]);
  await resetE2EUser(id);
  return id;
}
