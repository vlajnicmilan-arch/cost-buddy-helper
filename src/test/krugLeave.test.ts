/**
 * Guard: Krug samoizlazak ("Napusti Krug").
 *
 * Governance pravilo: asimetrični samoizlazak je UVIJEK dopušten, bez
 * ičijeg pristanka. Ovi testovi štite tri stvari koje su se lako gube:
 *   1) izlazak ide isključivo kroz RPC `krug_leave` (nikad direktan DELETE)
 *   2) vlasnik dobiva `owner_cannot_leave`, a povijest razračunavanja se
 *      ne briše u RPC-u
 *   3) obavijest `krug_member_left` postoji na edge i i18n strani (hr/en/de)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('Krug self-leave', () => {
  it('hook calls krug_leave RPC and never deletes membership directly', () => {
    const src = read('src/hooks/useKrugLeave.ts');
    expect(src).toMatch(/supabase\.rpc\('krug_leave'/);
    expect(src).not.toMatch(/from\('krug_membership'\)/);
  });

  it('UI exposes leave action for non-owners only', () => {
    const src = read('src/components/krug/KrugDetailScreen.tsx');
    expect(src).toMatch(/KrugLeaveDialog/);
    expect(src).toMatch(/!isOwner && !!detail\.myMembership/);
    const dialog = read('src/components/krug/KrugLeaveDialog.tsx');
    expect(dialog).toMatch(/krug\.leave\.body/);
  });

  it('migration defines krug_leave with owner guard and append-only audit', () => {
    const files = execSync("grep -rl 'krug_leave' supabase/migrations/ || true", {
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .filter(Boolean);
    expect(files.length).toBeGreaterThan(0);
    const sql = files.map((f) => readFileSync(f, 'utf8')).join('\n');
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.krug_leave/);
    expect(sql).toMatch(/owner_cannot_leave/);
    expect(sql).toMatch(/noop_not_member/);
    expect(sql).toMatch(/krug_membership_audit/);
    expect(sql).toMatch(/'member_left'/);
    expect(sql).toMatch(/krug_member_left/);
    // Leaving must never touch settlement history.
    expect(sql).not.toMatch(/DELETE FROM public\.krug_settlement/i);
  });

  it('notify-krug-event accepts krug_member_left', () => {
    const src = read('supabase/functions/notify-krug-event/index.ts');
    expect(src).toMatch(/"krug_member_left"/);
    expect(src).toMatch(/return "member_left"/);
  });

  it('i18n covers leave copy and notification in hr/en/de', () => {
    for (const locale of ['hr', 'en', 'de']) {
      const d = JSON.parse(read(`src/i18n/locales/${locale}.json`));
      expect(d.krug.leave.cta).toBeTruthy();
      expect(d.krug.leave.body).toBeTruthy();
      expect(d.krug.leave.errors.owner_cannot_leave).toBeTruthy();
      expect(d.notifications.krug.member_left.title).toBeTruthy();
    }
  });

  it('SQL harness for self-leave exists and is wired into the runner', () => {
    const test = read('supabase/tests/krug/member_leave.sql');
    expect(test).toMatch(/owner_cannot_leave/);
    expect(test).toMatch(/settlement history untouched/);
    expect(test).toMatch(/direct DELETE still blocked/);
    expect(read('supabase/tests/krug/run.sh')).toMatch(/member_leave\.sql/);
  });
});
