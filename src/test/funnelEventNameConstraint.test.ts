/**
 * BRANA: tri popisa naziva funnel događaja moraju biti usklađena:
 *
 *  1. TS unija `FunnelEventName`
 *  2. CHECK ograničenje `funnel_events_name_check` u bazi
 *  3. `with_check` izraz RLS INSERT politike "Anyone can insert funnel events"
 *     naspram TS popisa `ANONYMOUS_FUNNEL_EVENTS`
 *
 * Provjeravaju se OBA smjera. Ranije su tri naziva postojala samo u tipu
 * (upisi su padali na 23514), a `import_undone` samo u bazi.
 *
 * Popisi se čitaju iz ZADNJE DEFINICIJE u migracijama (ne zadnjeg spomena) —
 * isti obrazac kao `lastDefinitionOf` u `mailImportJobLifecycle.test.ts`.
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

/** Zadnja migracija koja odgovara definicijskom uzorku. */
const lastDefinitionOf = (definitionRe: RegExp): string =>
  allMigrations().filter((sql) => definitionRe.test(sql)).slice(-1)[0] ?? '';

/** Nazivi iz `ARRAY['a'::text, ...]` počevši od zadanog sidra. */
const namesFromArrayAfter = (sql: string, anchor: RegExp): string[] => {
  const idx = sql.search(anchor);
  if (idx < 0) return [];
  const arrayMatch = sql.slice(idx).match(/ARRAY\s*\[([\s\S]*?)\]/i);
  if (!arrayMatch) return [];
  return Array.from(arrayMatch[1].matchAll(/'([a-z0-9_]+)'/gi)).map((m) => m[1]);
};

/** Dopušteni nazivi iz CHECK ograničenja. */
const checkNames = (): string[] =>
  namesFromArrayAfter(
    lastDefinitionOf(/funnel_events_name_check[\s\S]{0,200}?CHECK/i),
    /funnel_events_name_check[\s\S]{0,200}?CHECK/i,
  );

/** Dopušteni anonimni nazivi iz `with_check` izraza RLS INSERT politike. */
const policyAnonNames = (): string[] =>
  namesFromArrayAfter(
    lastDefinitionOf(/CREATE POLICY\s+"Anyone can insert funnel events"/i),
    /CREATE POLICY\s+"Anyone can insert funnel events"/i,
  );

const readFunnelSource = (): string =>
  readFileSync(join(process.cwd(), 'src', 'lib', 'funnelTracking.ts'), 'utf8');

/** Nazivi iz union tipa `FunnelEventName`. */
const typeNames = (): string[] => {
  const src = readFunnelSource();
  const start = src.indexOf('export type FunnelEventName =');
  expect(start).toBeGreaterThan(-1);
  const block = src.slice(start, src.indexOf(';', start));
  return Array.from(block.matchAll(/'([a-z0-9_]+)'/gi)).map((m) => m[1]);
};

/** Nazivi iz `ANONYMOUS_FUNNEL_EVENTS`. */
const anonTypeNames = (): string[] => {
  const src = readFunnelSource();
  const start = src.indexOf('export const ANONYMOUS_FUNNEL_EVENTS');
  expect(start).toBeGreaterThan(-1);
  const block = src.slice(start, src.indexOf(']);', start));
  return Array.from(block.matchAll(/'([a-z0-9_]+)'/gi)).map((m) => m[1]);
};

/**
 * `install` je iznimka: dopušten je anonimno u RLS politici, ali se ne šalje
 * kroz `ANONYMOUS_FUNNEL_EVENTS` (logira se posebnim putem na bootu).
 */
const POLICY_ONLY = new Set(['install']);

describe('funnel_events_name_check ↔ FunnelEventName', () => {
  it('u migracijama postoji definicija ograničenja s popisom naziva', () => {
    expect(checkNames().length).toBeGreaterThan(0);
  });

  it('svaki naziv iz tipa postoji u dopuštenom popisu u bazi', () => {
    const allowed = new Set(checkNames());
    expect(typeNames().filter((n) => !allowed.has(n))).toEqual([]);
  });

  it('svaki naziv iz baze postoji u TS uniji', () => {
    const known = new Set(typeNames());
    expect(checkNames().filter((n) => !known.has(n))).toEqual([]);
  });

  it('ranije izgubljeni nazivi su dopušteni', () => {
    const allowed = new Set(checkNames());
    for (const n of [
      'guided_home_entered',
      'guided_home_exited',
      'worker_payout_attributed',
      'import_undone',
      'verify_screen_viewed',
      'verify_resend_clicked',
      'verify_already_confirmed_clicked',
      'verify_restart_registration',
    ]) {
      expect(allowed.has(n)).toBe(true);
    }
  });
});

describe('RLS INSERT politika ↔ ANONYMOUS_FUNNEL_EVENTS', () => {
  it('u migracijama postoji definicija politike s popisom naziva', () => {
    expect(policyAnonNames().length).toBeGreaterThan(0);
  });

  it('svaki anonimni naziv iz koda je dopušten politikom', () => {
    const allowed = new Set(policyAnonNames());
    expect(anonTypeNames().filter((n) => !allowed.has(n))).toEqual([]);
  });

  it('svaki naziv dopušten politikom postoji u kodu (uz iznimku install)', () => {
    const known = new Set(anonTypeNames());
    expect(policyAnonNames().filter((n) => !known.has(n) && !POLICY_ONLY.has(n))).toEqual([]);
  });
});
