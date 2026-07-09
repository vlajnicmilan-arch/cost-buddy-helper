/**
 * Krug Notifications MVP — server-side migration guard.
 *
 * Source-level provjera nove migracije da MVP invariante ne odu tiho:
 *  - `notification_preferences.krug_enabled` boolean NOT NULL DEFAULT true
 *  - `is_push_category_enabled` prepoznaje kategoriju 'krug'
 *  - `krug_deletion_request.member_snapshot` uuid[] postoji (za `krug_deleted`
 *    audience nakon purgea, bez novog audit modela)
 *  - Recipient helperi UNION-aju `krug_ownership` i `krug_membership`
 *    (owner mora biti eksplicitno uključen).
 *  - `krug_set_privacy` emitira `krug_expense_proposed` SAMO na prijelazu
 *    u `shared` + `predlozena` (privacy i status ne miješamo).
 *  - `krug_apply_act` emitira `krug_expense_confirmed` (A1), `_rejected` (A2)
 *    i `_proposed` (A5) — dedup ide preko `krug_act_dedup.id`, bez novog
 *    `predlozena_seq` polja.
 *  - `krug_request_deletion` snima `member_snapshot` i emitira
 *    `krug_deletion_requested`.
 *  - `krug_purge_deleted` emitira `krug_deleted` po Krugu koristeći
 *    snapshot recipient listu.
 *
 * Nije integracijski; svrha je zaključati oblik migracije da regresija
 * padne prije deploya.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const MIGRATIONS_DIR = resolve(__dirname, '../../../supabase/migrations');
const CANDIDATES = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => ({
    name: f,
    src: readFileSync(join(MIGRATIONS_DIR, f), 'utf8'),
  }));

function findMigration(marker: string): string {
  const hit = CANDIDATES.find((m) => m.src.includes(marker));
  if (!hit) throw new Error(`No migration contains marker: ${marker}`);
  return hit.src;
}

describe('Krug Notifications MVP migration', () => {
  const SRC = (() => {
    // Marker is unique to the MVP migration file.
    return findMigration('krug_notify_full_members');
  })();

  it('adds krug_enabled boolean NOT NULL DEFAULT true to notification_preferences', () => {
    expect(SRC).toMatch(
      /ALTER TABLE public\.notification_preferences[\s\S]*ADD COLUMN[\s\S]*krug_enabled boolean NOT NULL DEFAULT true/i,
    );
  });

  it('extends is_push_category_enabled to recognise "krug"', () => {
    expect(SRC).toMatch(/CREATE OR REPLACE FUNCTION public\.is_push_category_enabled/);
    expect(SRC).toMatch(/WHEN 'krug'\s+THEN\s+v_pref\.krug_enabled/);
  });

  it('adds member_snapshot uuid[] to krug_deletion_request', () => {
    expect(SRC).toMatch(
      /ALTER TABLE public\.krug_deletion_request[\s\S]*ADD COLUMN[\s\S]*member_snapshot uuid\[\]/i,
    );
  });

  it('recipient helpers UNION krug_ownership with krug_membership', () => {
    expect(SRC).toMatch(/CREATE OR REPLACE FUNCTION public\.krug_notify_full_members/);
    expect(SRC).toMatch(/CREATE OR REPLACE FUNCTION public\.krug_notify_all_members/);
    // Both must pull from ownership AND membership tables.
    const fullFn = SRC.match(/krug_notify_full_members[\s\S]*?\$\$/)?.[0] ?? '';
    const allFn = SRC.match(/krug_notify_all_members[\s\S]*?\$\$/)?.[0] ?? '';
    expect(fullFn).toMatch(/krug_ownership/);
    expect(fullFn).toMatch(/krug_membership/);
    expect(fullFn).toMatch(/'punopravni'/);
    expect(allFn).toMatch(/krug_ownership/);
    expect(allFn).toMatch(/krug_membership/);
  });

  it('krug_emit_notification is SECURITY DEFINER and uses net.http_post', () => {
    expect(SRC).toMatch(/CREATE OR REPLACE FUNCTION public\.krug_emit_notification/);
    const fn = SRC.match(/krug_emit_notification[\s\S]*?\$\$;/)?.[0] ?? '';
    expect(fn).toMatch(/SECURITY DEFINER/);
    expect(fn).toMatch(/net\.http_post/);
    expect(fn).toMatch(/notify-krug-event/);
  });

  it('krug_set_privacy emits proposed only on shared+predlozena transition', () => {
    // The rewritten RPC must contain the emit call gated on the new status.
    expect(SRC).toMatch(/CREATE OR REPLACE FUNCTION public\.krug_set_privacy/);
    const fn = SRC.match(/krug_set_privacy[\s\S]*?\$\$;/g)?.slice(-1)[0] ?? '';
    expect(fn).toMatch(/krug_emit_notification\(\s*'krug_expense_proposed'/);
    // Gate: must reference both privacy=shared and status=predlozena.
    expect(fn).toMatch(/'shared'::public\.krug_privacy/);
    expect(fn).toMatch(/'predlozena'::public\.krug_shared_status/);
  });

  it('krug_apply_act emits confirmed/rejected/proposed using krug_act_dedup.id', () => {
    expect(SRC).toMatch(/CREATE OR REPLACE FUNCTION public\.krug_apply_act/);
    const fn = SRC.match(/krug_apply_act[\s\S]*?\$\$;/g)?.slice(-1)[0] ?? '';
    expect(fn).toMatch(/krug_emit_notification\(\s*'krug_expense_confirmed'/);
    expect(fn).toMatch(/krug_emit_notification\(\s*'krug_expense_rejected'/);
    expect(fn).toMatch(/krug_emit_notification\(\s*'krug_expense_proposed'/);
    // Dedup ref must reference the krug_act_dedup row (no predlozena_seq).
    expect(fn).toMatch(/krug_act_dedup/);
    expect(SRC).not.toMatch(/predlozena_seq/);
  });

  it('krug_request_deletion captures member_snapshot and emits deletion_requested', () => {
    expect(SRC).toMatch(/CREATE OR REPLACE FUNCTION public\.krug_request_deletion/);
    const fn = SRC.match(/krug_request_deletion[\s\S]*?\$\$;/g)?.slice(-1)[0] ?? '';
    expect(fn).toMatch(/member_snapshot/);
    expect(fn).toMatch(/krug_emit_notification\(\s*'krug_deletion_requested'/);
  });

  it('krug_purge_deleted emits krug_deleted per purged krug', () => {
    expect(SRC).toMatch(/CREATE OR REPLACE FUNCTION public\.krug_purge_deleted/);
    const fn = SRC.match(/krug_purge_deleted[\s\S]*?\$\$;/g)?.slice(-1)[0] ?? '';
    expect(fn).toMatch(/krug_emit_notification\(\s*'krug_deleted'/);
    // Must read snapshot before deleting (loop, not raw DELETE ... RETURNING).
    expect(fn).toMatch(/FOR\s+\w+\s+IN/i);
  });
});
