/**
 * Regresija: krug_request_deletion je koristio `RETURNING id INTO ...` nad
 * public.krug_deletion_request koja nema `id` kolonu (PK je krug_id), pa je
 * multi-member deletion path pucao s "column id does not exist".
 *
 * Fix: koristi krug_id (PK, max 1 pending po krugu) kao identifikator u
 * krug_emit_notification payloadu. Ovaj guard osigurava da se problematičan
 * `RETURNING id` obrazac ne vrati u kasnijoj migraciji nad tom funkcijom.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const MIGRATIONS_DIR = resolve(__dirname, '../../../supabase/migrations');

function loadLatestDefOf(fnName: string): string {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  let latest = '';
  for (const f of files) {
    const src = readFileSync(join(MIGRATIONS_DIR, f), 'utf8');
    if (new RegExp(`FUNCTION\\s+public\\.${fnName}\\s*\\(`, 'i').test(src)) {
      latest = src;
    }
  }
  if (!latest) throw new Error(`No migration defines ${fnName}`);
  return latest;
}

describe('krug_request_deletion — RETURNING id fix', () => {
  const src = loadLatestDefOf('krug_request_deletion');

  it('does not reference non-existent id column on krug_deletion_request', () => {
    expect(/RETURNING\s+id\s+INTO/i.test(src)).toBe(false);
  });

  it('passes krug_id as deletion-request identifier to krug_emit_notification', () => {
    expect(src).toMatch(/krug_deletion_requested/);
    expect(src).toMatch(/'krug_deletion_requested:'\s*\|\|\s*p_krug_id::text/);
  });
});
