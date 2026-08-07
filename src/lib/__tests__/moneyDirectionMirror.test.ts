/**
 * Zrcalo `src/lib/moneyDirection.ts` ↔ `supabase/functions/_shared/moneyDirection.ts`.
 *
 * Edge funkcije ne mogu importati iz `src/`, pa postoji Deno kopija. Ovaj test
 * pada čim se jezgre raziđu — bez njega bi uvoz izvoda i bankovna
 * sinkronizacija tiho počeli odlučivati o smjeru različitim kodom.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const START = '// ---------------- SHARED CORE START ----------------';
const END = '// ---------------- SHARED CORE END ----------------';

const core = (path: string): string => {
  const src = readFileSync(join(ROOT, path), 'utf8');
  const a = src.indexOf(START);
  const b = src.indexOf(END);
  expect(a, `${path}: nedostaje SHARED CORE START`).toBeGreaterThanOrEqual(0);
  expect(b, `${path}: nedostaje SHARED CORE END`).toBeGreaterThan(a);
  return src.slice(a, b + END.length);
};

describe('moneyDirection mirror', () => {
  it('jezgra klijenta i edge kopije je identična', () => {
    expect(core('supabase/functions/_shared/moneyDirection.ts')).toBe(
      core('src/lib/moneyDirection.ts'),
    );
  });
});
