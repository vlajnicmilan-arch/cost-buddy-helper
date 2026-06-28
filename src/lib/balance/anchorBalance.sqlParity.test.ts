/**
 * Val 3 — SQL ↔ TS contract smoke test for the anchor engine.
 *
 * Read-only check that the migration defining the Val 3 engine still
 * contains the contract `anchorBalance.ts` mirrors. Intentionally NOT a
 * SQL parser — just a tripwire so a silent edit to the engine SQL is
 * caught in CI.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

function findMigrationContaining(needle: string): string {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
  for (const f of files) {
    const body = readFileSync(join(MIGRATIONS_DIR, f), 'utf8');
    if (body.includes(needle)) return body;
  }
  throw new Error(`No migration contains "${needle}"`);
}

describe('SQL contract: Val 3 engine (recompute_custom_source_balance)', () => {
  const sql = findMigrationContaining('recompute_custom_source_balance_preview');

  it('declares both the production and preview engine functions', () => {
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.recompute_custom_source_balance\s*\(/i);
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.recompute_custom_source_balance_preview\s*\(/i);
  });

  it('preview function is STABLE (read-only contract)', () => {
    // The preview path must never write — STABLE is the marker we rely on.
    expect(sql).toMatch(/recompute_custom_source_balance_preview[\s\S]{0,400}STABLE/i);
  });

  it('production engine is gated by app_settings.anchor_engine_mode', () => {
    expect(sql).toMatch(/anchor_engine_mode/);
    expect(sql).toMatch(/app_settings/);
  });

  it('hybrid branch cuts C1/C2 by event_at and others by day', () => {
    // Precise tiers use event_at strict >
    expect(sql).toMatch(/time_confidence\s+IN\s*\(\s*'C1'\s*,\s*'C2'\s*\)[\s\S]{0,200}event_at\s*>\s*v_anchor_date/i);
    // Fallback uses day-level cut on date
    expect(sql).toMatch(/time_confidence\s+IS\s+NULL\s+OR\s+time_confidence\s+IN\s*\(\s*'C3'\s*,\s*'C4'\s*\)[\s\S]{0,400}\(e\.date\s+AT\s+TIME\s+ZONE\s+'UTC'\)::date\s*>\s*\(v_anchor_date\s+AT\s+TIME\s+ZONE\s+'UTC'\)::date/i);
  });

  it('day_cut branch keeps the legacy Rule B day comparison', () => {
    expect(sql).toMatch(/\(e\.date\s+AT\s+TIME\s+ZONE\s+'UTC'\)::date\s*>\s*\(v_anchor_date\s+AT\s+TIME\s+ZONE\s+'UTC'\)::date/i);
  });

  it('both modes filter out corrections and soft-deleted rows', () => {
    // Two occurrences expected (one per mode block); assert at least one of each pattern present.
    expect(sql).toMatch(/deleted_at\s+IS\s+NULL/i);
    expect(sql).toMatch(/expense_nature[^<]*<>\s*'correction'/i);
  });

  it('preview function rejects modes other than day_cut or hybrid', () => {
    expect(sql).toMatch(/p_mode\s+NOT\s+IN\s*\(\s*'day_cut'\s*,\s*'hybrid'\s*\)/i);
  });
});
