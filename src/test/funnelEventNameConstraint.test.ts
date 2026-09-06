/**
 * BRANA: tip `FunnelEventName` i CHECK ograničenje `funnel_events_name_check`
 * moraju biti usklađeni. Ranije su tri naziva (`guided_home_entered`,
 * `guided_home_exited`, `worker_payout_attributed`) postojali u tipu, ali ne i
 * u bazi — svaki upis je padao na 23514 i tiho se gubio.
 *
 * Čita SVE migracije i uzima ZADNJU DEFINICIJU ograničenja (ne zadnju
 * migraciju koja ga spominje) — isti obrazac kao `lastDefinitionOf` u
 * `mailImportJobLifecycle.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

const allMigrations = (): string[] =>
  readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(join(MIGRATIONS_DIR, f), 'utf8'));

/** Zadnja migracija koja ograničenje DEFINIRA (ADD CONSTRAINT ... CHECK). */
const lastConstraintDefinition = (): string => {
  const definitionRe = /funnel_events_name_check[\s\S]{0,200}?CHECK/i;
  return (
    allMigrations()
      .filter((sql) => definitionRe.test(sql))
      .slice(-1)[0] ?? ''
  );
};

/** Nazivi iz `event_name = ANY (ARRAY['a'::text, ...])` u toj definiciji. */
const allowedNamesFromMigrations = (): string[] => {
  const sql = lastConstraintDefinition();
  const idx = sql.search(/funnel_events_name_check/i);
  const tail = sql.slice(idx);
  const arrayMatch = tail.match(/ARRAY\s*\[([\s\S]*?)\]/i);
  if (!arrayMatch) return [];
  return Array.from(arrayMatch[1].matchAll(/'([a-z0-9_]+)'/gi)).map((m) => m[1]);
};

/** Nazivi iz union tipa `FunnelEventName`. */
const typeNames = (): string[] => {
  const src = readFileSync(join(process.cwd(), 'src', 'lib', 'funnelTracking.ts'), 'utf8');
  const start = src.indexOf('export type FunnelEventName =');
  expect(start).toBeGreaterThan(-1);
  const block = src.slice(start, src.indexOf(';', start));
  return Array.from(block.matchAll(/'([a-z0-9_]+)'/gi)).map((m) => m[1]);
};

describe('funnel_events_name_check ↔ FunnelEventName', () => {
  it('u migracijama postoji definicija ograničenja s popisom naziva', () => {
    expect(allowedNamesFromMigrations().length).toBeGreaterThan(0);
  });

  it('svaki naziv iz tipa postoji u dopuštenom popisu u bazi', () => {
    const allowed = new Set(allowedNamesFromMigrations());
    const missing = typeNames().filter((n) => !allowed.has(n));
    expect(missing).toEqual([]);
  });

  it('tri ranije izgubljena naziva su sada dopuštena', () => {
    const allowed = new Set(allowedNamesFromMigrations());
    for (const n of ['guided_home_entered', 'guided_home_exited', 'worker_payout_attributed']) {
      expect(allowed.has(n)).toBe(true);
    }
  });
});
