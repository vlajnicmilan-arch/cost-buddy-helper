/**
 * Centralised env access for E2E. Fails loudly when required vars are missing.
 */
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`E2E env var ${name} is required`);
  return v;
}

export const env = {
  supabaseUrl: required('E2E_SUPABASE_URL'),
  supabaseAnonKey: required('E2E_SUPABASE_ANON_KEY'),
  supabaseServiceKey: required('E2E_SUPABASE_SERVICE_ROLE_KEY'),
  password: required('E2E_USER_PASSWORD'),
  baseUrl: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173',
};

export const E2E_USERS = {
  onboarding: 'e2e+onboarding@vmbalance.com',
  core: 'e2e+core@vmbalance.com',
  import: 'e2e+import@vmbalance.com',
} as const;

export type E2EUserKey = keyof typeof E2E_USERS;
