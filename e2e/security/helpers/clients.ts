import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { senv, SEC_USERS, type SecUserKey } from './env';

let _admin: SupabaseClient | null = null;
export function admin(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(senv.supabaseUrl, senv.serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _admin;
}

/** Klijent s korisnikovim JWT-om (kao browser koji je prijavljen). */
export async function authedClientFor(key: SecUserKey): Promise<{
  client: SupabaseClient;
  userId: string;
  accessToken: string;
}> {
  const email = SEC_USERS[key];
  const client = createClient(senv.supabaseUrl, senv.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: senv.password,
  });
  if (error || !data.session) {
    throw new Error(`sign-in failed for ${email}: ${error?.message ?? 'no session'}`);
  }
  return {
    client,
    userId: data.session.user.id,
    accessToken: data.session.access_token,
  };
}

/** Sirovi fetch prema edge funkciji s odabranim tokenom. */
export async function edgeFn(
  name: string,
  body: unknown,
  opts: { token?: string | null; anonOnly?: boolean } = {},
): Promise<{ status: number; text: string; json: any }> {
  const url = `${senv.supabaseUrl}/functions/v1/${name}`;
  const headers: Record<string, string> = {
    apikey: senv.anonKey,
    'Content-Type': 'application/json',
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  else if (!opts.anonOnly && opts.token !== null) {
    // eksplicitno neautoriziran → ne šalji Authorization
  }
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
  return { status: res.status, text, json };
}
