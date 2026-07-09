/**
 * notify-krug-event — source-level guards for the two blocking corrections.
 *
 * We can't spin up Deno inside vitest, so these are string-level invariants
 * against the compiled function source. They catch regressions where either
 * of the two P1 corrections is silently reverted.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(
  resolve(__dirname, '../../../supabase/functions/notify-krug-event/index.ts'),
  'utf8',
);


describe('notify-krug-event internal auth guard', () => {
  it('rejects requests whose Bearer token does not match SUPABASE_SERVICE_ROLE_KEY', () => {
    // Constant-time compare of presented token vs service role key.
    expect(SRC).toMatch(/timingSafeEqual\s*\(/);
    expect(SRC).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    // Guard MUST return 401 before any admin work.
    expect(SRC).toMatch(/"unauthorized"\s*\},\s*401/);
  });

  it('extracts the Bearer token from the Authorization header', () => {
    expect(SRC).toMatch(/authHeader\.startsWith\("Bearer "\)/);
  });

  it('does not rely on "internal only" comments alone (guard actually runs)', () => {
    // Ensure the 401 branch appears BEFORE the admin client is used for
    // any DB reads (recipient resolver / notifications insert).
    const guardIdx = SRC.indexOf('"unauthorized"');
    const adminUseIdx = SRC.indexOf('admin.from("krug_ownership"');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(adminUseIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(adminUseIdx);
  });
});

describe('notify-krug-event actor exclusion is event-aware', () => {
  it('does NOT drop actor_id for krug_deleted', () => {
    // The exclusion line must be gated on event_type !== 'krug_deleted'.
    expect(SRC).toMatch(
      /if\s*\(\s*event_type\s*!==\s*"krug_deleted"\s*\)\s*\{\s*recipients\.delete\(actor_id\);\s*\}/,
    );
  });

  it('has no unconditional recipients.delete(actor_id) call', () => {
    // Regex tolerates whitespace/comments but forbids a bare statement.
    const bare = /^\s*recipients\.delete\(actor_id\);\s*$/m;
    expect(SRC).not.toMatch(bare);
  });
});
