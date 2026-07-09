/**
 * Krug Notifications MVP — server-side migration guard.
 *
 * Source-level provjera nove migracije da MVP invariante ne odu tiho:
 *  - `notification_preferences.krug_enabled` boolean NOT NULL DEFAULT true
 *  - `is_push_category_enabled` prepoznaje kategoriju 'krug'
 *  - `krug_deletion_request.member_snapshot` uuid[]
 *  - Recipient helperi UNION-aju `krug_ownership` i `krug_membership`
 *  - `krug_set_privacy` emitira `krug_expense_proposed` na shared+predlozena
 *  - `krug_apply_act` emitira confirmed/rejected/proposed uz dedup preko
 *    `krug_act_dedup.id` (bez novog `predlozena_seq` polja)
 *  - `krug_request_deletion` snima `member_snapshot` i emitira
 *  - `krug_purge_deleted` emitira `krug_deleted` po Krugu iz snapshota
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

function extractFunctionBody(src: string, name: string): string {
  const re = new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${name}\\b[\\s\\S]*?AS \\$\\$[\\s\\S]*?\\n\\$\\$;`,
  );
  const m = src.match(re);
  if (!m) throw new Error(`Function body not found: ${name}`);
  return m[0];
}

describe('Krug Notifications MVP migration', () => {
  const SRC = loadMigrationWith('krug_notify_full_members');

  it('adds krug_enabled boolean NOT NULL DEFAULT true to notification_preferences', () => {
    expect(SRC).toMatch(
      /ALTER TABLE public\.notification_preferences[\s\S]*?ADD COLUMN[\s\S]*?krug_enabled boolean NOT NULL DEFAULT true/i,
    );
  });

  it('extends is_push_category_enabled to recognise "krug"', () => {
    const fn = extractFunctionBody(SRC, 'is_push_category_enabled');
    expect(fn).toMatch(/WHEN 'krug'\s+THEN\s+v_pref\.krug_enabled/);
  });

  it('adds member_snapshot uuid[] to krug_deletion_request', () => {
    expect(SRC).toMatch(
      /ALTER TABLE public\.krug_deletion_request[\s\S]*?ADD COLUMN[\s\S]*?member_snapshot uuid\[\]/i,
    );
  });

  it('recipient helpers UNION krug_ownership with krug_membership', () => {
    const full = extractFunctionBody(SRC, 'krug_notify_full_members');
    const all = extractFunctionBody(SRC, 'krug_notify_all_members');
    expect(full).toMatch(/krug_ownership/);
    expect(full).toMatch(/krug_membership/);
    expect(full).toMatch(/'punopravni'/);
    expect(full).toMatch(/UNION/);
    expect(all).toMatch(/krug_ownership/);
    expect(all).toMatch(/krug_membership/);
    expect(all).toMatch(/UNION/);
  });

  it('krug_emit_notification is SECURITY DEFINER and uses net.http_post', () => {
    const fn = extractFunctionBody(SRC, 'krug_emit_notification');
    expect(fn).toMatch(/SECURITY DEFINER/);
    expect(fn).toMatch(/net\.http_post/);
    expect(fn).toMatch(/notify-krug-event/);
  });

  it('krug_emit_notification presents the service role key from vault (not anon)', () => {
    // Corrected variant must exist in the migration history. It reads the
    // service_role key from vault.decrypted_secrets and forwards it as
    // Bearer so the edge fn internal-auth guard accepts the call.
    const CORRECTED = loadMigrationWith(
      "SELECT decrypted_secret\n    INTO _service_key\n    FROM vault.decrypted_secrets",
    );
    const fn = extractFunctionBody(CORRECTED, 'krug_emit_notification');
    expect(fn).toMatch(/vault\.decrypted_secrets/);
    expect(fn).toMatch(/email_queue_service_role_key/);
    expect(fn).toMatch(/'Bearer '\s*\|\|\s*_service_key/);
    // Anon-key JWT must not be embedded in the corrected helper.
    expect(fn).not.toMatch(/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9/);
  });


  it('krug_set_privacy emits proposed only on shared+predlozena transition', () => {
    const fn = extractFunctionBody(SRC, 'krug_set_privacy');
    expect(fn).toMatch(/krug_emit_notification\(\s*'krug_expense_proposed'/);
    // Emit gated on both privacy=shared and status=predlozena guards.
    expect(fn).toMatch(/'shared'::public\.krug_privacy/);
    expect(fn).toMatch(/'predlozena'::public\.krug_shared_status/);
  });

  it('krug_apply_act emits confirmed/rejected/proposed using krug_act_dedup.id', () => {
    const fn = extractFunctionBody(SRC, 'krug_apply_act');
    expect(fn).toMatch(/krug_emit_notification\(\s*'krug_expense_confirmed'/);
    expect(fn).toMatch(/krug_emit_notification\(\s*'krug_expense_rejected'/);
    expect(fn).toMatch(/krug_emit_notification\(\s*'krug_expense_proposed'/);
    // Dedup ref anchored on krug_act_dedup.id (no new predlozena_seq column).
    expect(fn).toMatch(/krug_act_dedup/);
    expect(fn).toMatch(/_dedup_id/);
    expect(SRC).not.toMatch(/predlozena_seq/);
  });

  it('krug_request_deletion captures member_snapshot and emits deletion_requested', () => {
    const fn = extractFunctionBody(SRC, 'krug_request_deletion');
    expect(fn).toMatch(/member_snapshot/);
    expect(fn).toMatch(/krug_emit_notification\(\s*'krug_deletion_requested'/);
  });

  it('krug_purge_deleted emits krug_deleted per purged krug via snapshot', () => {
    const fn = extractFunctionBody(SRC, 'krug_purge_deleted');
    expect(fn).toMatch(/krug_emit_notification\(\s*'krug_deleted'/);
    // Loop-based (not a bulk DELETE ... RETURNING) so snapshots can be read
    // before the row disappears.
    expect(fn).toMatch(/FOR\s+\w+\s+IN/i);
    expect(fn).toMatch(/member_snapshot/);
  });
});
