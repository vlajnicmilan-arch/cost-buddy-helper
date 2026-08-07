/**
 * STRAŽA — smjer novca ide isključivo kroz `moneyDirection`.
 *
 * Dva pravila, oba nastala iz stvarnih kvarova (7.8.2026):
 *
 *  1) Nitko izvan zajedničkog modula ne smije tumačiti `credit_debit_indicator`
 *     (bankovna sinkronizacija je kupnje upisivala kao priljev).
 *  2) Nitko izvan `buildTransferPair()` ne smije sam slagati par
 *     `payment_source` + `income_source_id` u insert/upsert (uvoz izvoda je
 *     nadoplate upisivao kao odljev).
 *
 * Allowlist je zamrznut snimak — NOVI prekršaj ruši test, što je i svrha.
 */
import { describe, it, expect, vi } from 'vitest';

vi.setConfig({ testTimeout: 30000, hookTimeout: 30000 });

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import allowlist from './moneyDirectionAllowlist.json';

const ROOT = process.cwd();
const SCAN_DIRS = ['src', 'supabase/functions'];
const EXT = /\.(ts|tsx)$/;

const walk = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (EXT.test(entry)) acc.push(full);
  }
  return acc;
};

const files = (): string[] => SCAN_DIRS.flatMap(d => walk(join(ROOT, d)));
const rel = (f: string) => relative(ROOT, f).replace(/\\/g, '/');

const isTestFile = (p: string) => /\.(test|spec)\.tsx?$/.test(p) || p.includes('/__tests__/');

const DIRECTION_MODULES = [
  'src/lib/moneyDirection.ts',
  'supabase/functions/_shared/moneyDirection.ts',
];

describe('moneyDirection guard', () => {
  it('samo zajednički modul tumači credit_debit_indicator / CRDT', () => {
    const offenders: string[] = [];
    for (const f of files()) {
      const p = rel(f);
      if (DIRECTION_MODULES.includes(p) || isTestFile(p)) continue;
      const src = readFileSync(f, 'utf8');
      // Dozvoljeno: deklaracija tipa i prosljeđivanje polja modulu.
      // Zabranjeno: usporedba (tumačenje smjera) bilo gdje drugdje.
      if (/credit_debit_indicator\s*(===|==|!==|!=)/.test(src)) offenders.push(`${p}:compare`);
      if (/(===|==|!==|!=)\s*["']CRDT["']/.test(src)) offenders.push(`${p}:crdt-literal`);
    }
    expect(offenders).toEqual([]);
  });

  it('par payment_source + income_source_id slaže samo buildTransferPair', () => {
    const allowed = allowlist as Record<string, string>;
    const offenders: string[] = [];
    for (const f of files()) {
      const p = rel(f);
      if (DIRECTION_MODULES.includes(p) || isTestFile(p)) continue;
      const src = readFileSync(f, 'utf8');
      const writesPair =
        /(?<![\w_])income_source_id\s*:/.test(src) &&
        /\.\s*(insert|upsert|update)\s*\(/.test(src);
      if (!writesPair) continue;
      if (src.includes('buildTransferPair')) continue;
      if (p in allowed) continue;
      offenders.push(p);
    }
    expect(offenders).toEqual([]);
  });
});
