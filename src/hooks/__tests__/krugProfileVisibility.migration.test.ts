/**
 * Krug Member Name Resolution — Fix v1
 *
 * Source-level provjera da migracija sadrži:
 *  - `krug_shares_krug_with(uuid, uuid)` SECURITY DEFINER helper (bez EXECUTE za PUBLIC/anon),
 *  - SELECT policy nad `public.profiles` koja pušta članove istog Kruga
 *    (bez otvaranja PII kolona — aplikacija SELECTa samo user_id, display_name).
 *
 * Ovo NIJE integracijski test protiv baze; svrha je fiksirati oblik migracije
 * da regresija (npr. slučajno brisanje policyja / promjena imena helpera)
 * padne prije deploya.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATION = resolve(
  __dirname,
  '../../../supabase/migrations/20260709201107_e164e7f2-4705-4cc9-b86f-4d67d20bc0cf.sql',
);
const SRC = readFileSync(MIGRATION, 'utf8');

describe('Krug member name resolution migration', () => {
  it('creates krug_shares_krug_with as SECURITY DEFINER', () => {
    expect(SRC).toMatch(
      /CREATE OR REPLACE FUNCTION public\.krug_shares_krug_with\(_viewer uuid, _target uuid\)/,
    );
    expect(SRC).toMatch(/SECURITY DEFINER/);
    expect(SRC).toMatch(/SET search_path = public/);
  });

  it('revokes helper from PUBLIC/anon and grants to authenticated', () => {
    expect(SRC).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.krug_shares_krug_with\(uuid, uuid\) FROM PUBLIC, anon/,
    );
    expect(SRC).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.krug_shares_krug_with\(uuid, uuid\) TO authenticated, service_role/,
    );
  });

  it('adds co-member SELECT policy on profiles scoped to shared Krug', () => {
    expect(SRC).toMatch(/CREATE POLICY "Krug co-members can view display name"/);
    expect(SRC).toMatch(/ON public\.profiles/);
    expect(SRC).toMatch(/FOR SELECT/);
    expect(SRC).toMatch(/TO authenticated/);
    expect(SRC).toMatch(
      /USING \(public\.krug_shares_krug_with\(auth\.uid\(\), user_id\)\)/,
    );
  });

  it('does not open any additional PII columns via new policy', () => {
    // Policy je nad cijelim retkom `profiles`, ali app kod SELECTa samo
    // (user_id, display_name). Migracija ne uvodi view ni novu kolonu.
    expect(SRC).not.toMatch(/CREATE VIEW/);
    expect(SRC).not.toMatch(/ALTER TABLE public\.profiles/i);
  });
});
