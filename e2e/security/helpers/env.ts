function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Security e2e env var ${name} is required`);
  return v;
}

export const senv = {
  get supabaseUrl() { return required('E2E_SUPABASE_URL'); },
  get anonKey() { return required('E2E_SUPABASE_ANON_KEY'); },
  get serviceKey() { return required('E2E_SUPABASE_SERVICE_ROLE_KEY'); },
  get password() { return required('E2E_USER_PASSWORD'); },
};

export const SEC_USERS = {
  a: 'security+a@vmbalance.com',
  b: 'security+b@vmbalance.com',
} as const;

export type SecUserKey = keyof typeof SEC_USERS;
