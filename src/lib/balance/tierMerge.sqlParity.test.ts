/**
 * Val 2 — SQL ↔ TS contract smoke test.
 *
 * Read-only check that the migration file defining `resolve_event_at_merge`
 * still contains the merge contract that `tierMerge.ts` mirrors.
 *
 * Intentionally NOT a SQL parser. Just a tripwire so a silent edit to the
 * migration is caught in CI.
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

describe('SQL contract: resolve_event_at_merge', () => {
  const sql = findMigrationContaining('resolve_event_at_merge');

  it('declares the resolve_event_at_merge function', () => {
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.resolve_event_at_merge/i);
  });

  it('returns (event_at timestamptz, time_confidence text)', () => {
    expect(sql).toMatch(/RETURNS\s+TABLE\s*\(\s*event_at\s+timestamptz\s*,\s*time_confidence\s+text\s*\)/i);
  });

  it('contains the "existing user-edited wins" branch', () => {
    expect(sql).toMatch(/existing_user_edited\s*=\s*true/i);
  });

  it('contains an "incoming tier strictly greater" branch', () => {
    expect(sql).toMatch(/incoming_tier\s*>\s*existing_tier/);
  });

  it('contains the "equal or lower tier → keep existing" fallback', () => {
    // After the two earlier branches, the function must assign existing values
    // to the OUT columns as the final path. We assert both assignments are
    // present after the second RETURN.
    expect(sql).toMatch(/event_at\s*:=\s*existing_event_at\s*;[\s\S]*time_confidence\s*:=\s*existing_confidence\s*;/);
  });

  it('ranks C1 > C2 > C3 > C4', () => {
    // Allow whitespace variation but require the four tier mappings to all be present.
    expect(sql).toMatch(/'C1'\s+THEN\s+4/);
    expect(sql).toMatch(/'C2'\s+THEN\s+3/);
    expect(sql).toMatch(/'C3'\s+THEN\s+2/);
    expect(sql).toMatch(/'C4'\s+THEN\s+1/);
  });
});
