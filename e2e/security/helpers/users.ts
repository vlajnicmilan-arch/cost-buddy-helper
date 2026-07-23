import { admin } from './clients';
import { senv, SEC_USERS, type SecUserKey } from './env';

/** Idempotent kreiranje sintetičkog usera; postavlja is_e2e_user=true. */
export async function ensureSecUser(email: string): Promise<string> {
  const a = admin();
  let userId: string | null = null;
  let page = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await a.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) { userId = found.id; break; }
    if (data.users.length < 200) break;
    page++;
    if (page > 30) break;
  }
  if (!userId) {
    const { data, error } = await a.auth.admin.createUser({
      email, password: senv.password, email_confirm: true,
    });
    if (error) throw error;
    userId = data.user!.id;
  } else {
    await a.auth.admin.updateUserById(userId, { password: senv.password, email_confirm: true });
  }
  const { error: upErr } = await a
    .from('profiles')
    .upsert(
      { user_id: userId, is_e2e_user: true, onboarding_completed: true },
      { onConflict: 'user_id' },
    );
  if (upErr) throw upErr;
  return userId;
}

export async function ensureBothSecUsers(): Promise<{ aId: string; bId: string }> {
  const aId = await ensureSecUser(SEC_USERS.a);
  const bId = await ensureSecUser(SEC_USERS.b);
  return { aId, bId };
}

/** Očisti sve podatke sintetičkih korisnika (service role, ograničeno na njihove id-ove). */
export async function purgeSecUserData(userId: string): Promise<void> {
  const a = admin();
  const tables = [
    'expenses',
    'custom_payment_sources',
    'bank_accounts',
    'bank_connections',
    'budget_categories',
    'budget_plans',
    'imported_statements',
    'pdf_parse_jobs',
    'project_work_entries',
    'project_workers',
    'project_members',
    'project_documents',
    'project_milestones',
    'project_funding',
    'project_collaborators',
    'projects',
    'user_entitlements',
    'krug_membership',
    'krug',
    'notifications',
    'chat_messages',
    'app_diagnostics_logs',
    'user_login_logs',
    'feedback_submissions',
    'bug_reports',
    'reminders',
    'savings_goals',
    'income_sources',
    'invoices',
    'clients',
    'project_invoices',
    'project_estimates',
  ];
  for (const t of tables) {
    // Ignoriramo pojedinačne greške (npr. FK); teardown je best-effort.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (a as any).from(t).delete().eq('user_id', userId);
    } catch { /* noop */ }
  }
}

export async function purgeSecUsersFully(): Promise<void> {
  const a = admin();
  for (const key of Object.keys(SEC_USERS) as SecUserKey[]) {
    const email = SEC_USERS[key];
    let page = 1;
    let found: string | null = null;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data } = await a.auth.admin.listUsers({ page, perPage: 200 });
      if (!data) break;
      const u = data.users.find((x) => x.email?.toLowerCase() === email.toLowerCase());
      if (u) { found = u.id; break; }
      if (data.users.length < 200) break;
      page++;
      if (page > 30) break;
    }
    if (found) {
      await purgeSecUserData(found);
      // ne brišemo user račun (ostavlja stabilnu ID rezervaciju za sljedeći run)
    }
  }
}
