/**
 * Krug Execute Revoke Patch — source-level guard.
 *
 * Osigurava da revoke migracija za interne Krug helpere ostaje u
 * migracijskoj povijesti. Ove funkcije su SECURITY DEFINER i pozivaju
 * se ili iz drugih Krug RPC-a (koji rade kao owner) ili iz service_role
 * (cron / edge fn), pa `anon` i `authenticated` ne smiju imati EXECUTE.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const MIGRATIONS_DIR = resolve(__dirname, '../../../supabase/migrations');

function loadMigrationWith(marker: string): string {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
  for (const f of files) {
    const src = readFileSync(join(MIGRATIONS_DIR, f), 'utf8');
    if (src.includes(marker)) return src;
  }
  throw new Error(`No migration contains marker: ${marker}`);
}

describe('Krug Execute Revoke Patch migration', () => {
  const SRC = loadMigrationWith('Krug Execute Revoke Patch');

  const fns: Array<[string, string]> = [
    ['krug_notify_all_members', 'uuid'],
    ['krug_notify_full_members', 'uuid'],
    [
      'krug_emit_notification',
      'text, uuid, uuid, uuid, uuid, text, uuid\\[\\]',
    ],
    ['krug_purge_deleted', 'integer'],
    ['krug_bootstrap_creator', ''],
    ['krug_enforce_punopravni_cap', ''],
  ];

  for (const [name, args] of fns) {
    it(`revokes EXECUTE on ${name} from PUBLIC, anon, authenticated`, () => {
      const re = new RegExp(
        `REVOKE\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${name}\\s*\\(${args}\\)\\s+FROM\\s+PUBLIC,\\s*anon,\\s*authenticated`,
        'i',
      );
      expect(SRC).toMatch(re);
    });
  }

  it('does not touch write RPC grants', () => {
    for (const rpc of [
      'krug_apply_act',
      'krug_set_privacy',
      'krug_retract',
      'krug_withdraw',
      'krug_govern_to_personal',
      'krug_request_deletion',
      'krug_vote_deletion',
      'krug_cancel_deletion',
    ]) {
      expect(SRC).not.toMatch(new RegExp(`\\b${rpc}\\b`));
    }
  });
});
