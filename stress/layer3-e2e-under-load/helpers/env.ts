/**
 * Layer 3 env access. Reads ONLY local Supabase — refuses remote URLs at
 * module scope (belt & suspenders on top of run-all.sh --layer=3 grep guard).
 */
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`layer3 env: ${name} is required`);
  return v;
}

function assertLocal(url: string, label: string): void {
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(url)) {
    throw new Error(`layer3 env: ${label} must be localhost/127.0.0.1, got: ${url}`);
  }
  if (/\.supabase\.(co|in)/i.test(url)) {
    throw new Error(`layer3 env: ${label} contains remote Supabase host — REFUSED: ${url}`);
  }
}

export const env = {
  get supabaseUrl() {
    const u = required('STRESS_SUPABASE_URL');
    assertLocal(u, 'STRESS_SUPABASE_URL');
    return u;
  },
  get supabaseAnonKey() { return required('STRESS_SUPABASE_ANON_KEY'); },
  get supabaseServiceKey() { return required('STRESS_SUPABASE_SERVICE_ROLE_KEY'); },
  get password() { return process.env.STRESS_SEED_PASSWORD ?? 'stress-test-pw-local-only'; },
  get baseUrl() {
    const u = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173';
    assertLocal(u, 'E2E_BASE_URL');
    return u;
  },
};

export const L3_USERS = {
  primary: 'layer3+primary@local.test',
  secondary: 'layer3+secondary@local.test',
} as const;

export type L3UserKey = keyof typeof L3_USERS;
