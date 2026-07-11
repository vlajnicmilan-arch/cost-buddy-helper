/**
 * Krug Shared Payment Source — permission matrix guard.
 *
 * Zaključana permission matrica (owner + punopravni mogu attachati vlastite
 * izvore; delete može owner uvijek, ostali samo linkove koje su sami postavili;
 * obicni član ne može ništa):
 *
 *   INSERT  →  linked_by = auth.uid()  AND  krug_can_manage_shared_source(...)
 *              gdje helper koristi krug_is_full_member (ne više krug_is_owner).
 *   DELETE  →  krug_is_owner  OR  (linked_by = auth.uid() AND krug_is_full_member).
 *
 * Ovaj guard čita najnoviju migraciju koja re-definira helper + policyje i
 * verificira da se semantika ne vrati na owner-only regresijom.
 *
 * UI guard: `KrugSharedSourcesSection` mora eksponirati attach UI za
 * `isFullMember` (ne isključivo `isOwner`) i pokazivati detach samo kad je
 * korisnik owner ili je link sam postavio.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const MIGRATIONS_DIR = resolve(__dirname, '../../supabase/migrations');
const COMPONENT = resolve(__dirname, '../components/krug/KrugSharedSourcesSection.tsx');

function loadLatestMigrationMatching(re: RegExp): string {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  let latest = '';
  for (const f of files) {
    const src = readFileSync(join(MIGRATIONS_DIR, f), 'utf8');
    if (re.test(src)) latest = src;
  }
  if (!latest) throw new Error(`No migration matched ${re}`);
  return latest;
}

describe('Krug Shared Source — permission matrix', () => {
  const helperSrc = loadLatestMigrationMatching(
    /FUNCTION\s+public\.krug_can_manage_shared_source/i,
  );

  it('helper uses krug_is_full_member (widened from owner-only)', () => {
    expect(helperSrc).toMatch(/krug_is_full_member\s*\(\s*_krug\s*,\s*_user\s*\)/);
    // Regression guard: helper must not gate on krug_is_owner as the sole check.
    const helperBody = helperSrc.match(
      /FUNCTION\s+public\.krug_can_manage_shared_source[\s\S]*?\$function\$/i,
    )?.[0] ?? '';
    expect(/IF NOT public\.krug_is_owner\(/.test(helperBody)).toBe(false);
  });

  it('helper still requires source ownership for custom: sources', () => {
    expect(helperSrc).toMatch(/is_payment_source_owner\(_src_uuid,\s*_user\)/);
  });

  const policySrc = loadLatestMigrationMatching(
    /CREATE POLICY\s+krug_sps_delete_owner_or_linker/i,
  );

  it('DELETE policy allows owner OR self-linked full member', () => {
    const match = policySrc.match(
      /CREATE POLICY\s+krug_sps_delete_owner_or_linker[\s\S]*?;/i,
    )?.[0] ?? '';
    expect(match).toMatch(/krug_is_owner\(krug_id,\s*auth\.uid\(\)\)/);
    expect(match).toMatch(/linked_by\s*=\s*auth\.uid\(\)/);
    expect(match).toMatch(/krug_is_full_member\(krug_id,\s*auth\.uid\(\)\)/);
    // The old owner-only DELETE policy must be dropped in the same migration.
    expect(policySrc).toMatch(
      /DROP POLICY IF EXISTS\s+krug_sps_delete_owner_and_source_owner/i,
    );
  });

  it('INSERT policy still enforces linked_by = auth.uid()', () => {
    const insertSrc = loadLatestMigrationMatching(
      /CREATE POLICY\s+krug_sps_insert_full_member_and_source_owner/i,
    );
    const match = insertSrc.match(
      /CREATE POLICY\s+krug_sps_insert_full_member_and_source_owner[\s\S]*?;/i,
    )?.[0] ?? '';
    expect(match).toMatch(/linked_by\s*=\s*auth\.uid\(\)/);
    expect(match).toMatch(/krug_can_manage_shared_source/);
  });
});

describe('KrugSharedSourcesSection — UI gate matrix', () => {
  const src = readFileSync(COMPONENT, 'utf8');

  it('exposes isFullMember prop separate from isOwner', () => {
    expect(src).toMatch(/isFullMember:\s*boolean/);
    expect(src).toMatch(/isOwner:\s*boolean/);
  });

  it('attach UI is gated on isFullMember (owner OR punopravni)', () => {
    expect(src).toMatch(/\{isFullMember\s*&&/);
    expect(src).toMatch(/if\s*\(!isFullMember\s*\|\|\s*!user\)/);
  });

  it('detach button visibility gated on owner OR self-linked row', () => {
    expect(src).toMatch(/isOwner\s*\|\|\s*\(user\s*&&\s*s\.linked_by\s*===\s*user\.id\)/);
  });
});
