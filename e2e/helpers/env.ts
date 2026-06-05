/**
 * Centralised env access for E2E. Fails loudly when required vars are accessed
 * without being set, but does NOT throw on module load — so `playwright --list`
 * and IDE indexing still work locally without secrets.
 */
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`E2E env var ${name} is required`);
  return v;
}

export const env = {
  get supabaseUrl() { return required('E2E_SUPABASE_URL'); },
  get supabaseAnonKey() { return required('E2E_SUPABASE_ANON_KEY'); },
  get supabaseServiceKey() { return required('E2E_SUPABASE_SERVICE_ROLE_KEY'); },
  get password() { return required('E2E_USER_PASSWORD'); },
  get baseUrl() { return process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173'; },
};

export const E2E_USERS = {
  onboarding: 'e2e+onboarding@vmbalance.com',
  core: 'e2e+core@vmbalance.com',
  import: 'e2e+import@vmbalance.com',
} as const;

export type E2EUserKey = keyof typeof E2E_USERS;
