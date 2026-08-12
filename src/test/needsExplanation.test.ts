import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import {
  buildInitialDecisions,
  isNeedsExplanation,
  setNeedsExplanation,
} from '@/lib/importReview/state';
import { applyFilters, defaultFilters } from '@/components/TransactionFilters';

/**
 * OZNAKA "BEZ OBJAŠNJENJA".
 *
 * Željezno pravilo: oznaka NIKAD ne nastaje sama. Nema heuristike, nema
 * "nije odabrana kategorija", nema AI-a. Postoji samo korisnikova kvačica.
 * Oznaka ne dira upis, saldo ni fingerprint — transakcija se upisuje normalno.
 */

const ROOT = process.cwd();

function collectSources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      collectSources(p, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(p);
    }
  }
  return out;
}

describe('odluke uvoza — oznaka po retku', () => {
  const rows = [0, 1, 2];

  const makeDecisions = () =>
    buildInitialDecisions({
      rows: rows.map(index => ({
        index,
        classification: { kind: 'new' as const, candidateIds: [] as string[] },
      })),
    } as never);

  it('nijedan redak ne dolazi označen', () => {
    const d = makeDecisions();
    for (const i of rows) expect(isNeedsExplanation(d, i)).toBe(false);
  });

  it('kvačica označava točno taj redak i nijedan drugi', () => {
    let d = makeDecisions();
    d = setNeedsExplanation(d, 0, true);
    d = setNeedsExplanation(d, 2, true);

    expect(isNeedsExplanation(d, 0)).toBe(true);
    expect(isNeedsExplanation(d, 1)).toBe(false);
    expect(isNeedsExplanation(d, 2)).toBe(true);
  });

  it('skidanje kvačice vraća redak u neoznačeno', () => {
    let d = setNeedsExplanation(makeDecisions(), 1, true);
    d = setNeedsExplanation(d, 1, false);
    expect(isNeedsExplanation(d, 1)).toBe(false);
  });

  it('stari nacrt bez polja čita se kao neoznačeno (nema pada)', () => {
    const legacy = { autoMerge: {}, questions: {}, newRows: {}, transfers: {} };
    expect(isNeedsExplanation(legacy as never, 0)).toBe(false);
  });

  it('kvačica ne dira ostale odluke retka', () => {
    const before = makeDecisions();
    const after = setNeedsExplanation(before, 0, true);
    expect(after.autoMerge).toEqual(before.autoMerge);
    expect(after.questions).toEqual(before.questions);
    expect(after.newRows).toEqual(before.newRows);
    expect(after.transfers).toEqual(before.transfers);
  });
});

describe('filter "Bez objašnjenja"', () => {
  const items = [
    { description: 'a', date: new Date('2026-08-01'), amount: 10, needs_explanation: true },
    { description: 'b', date: new Date('2026-08-02'), amount: 20, needs_explanation: false },
    { description: 'c', date: new Date('2026-08-03'), amount: 30 },
  ];

  it('ugašen filter ne mijenja popis', () => {
    expect(applyFilters(items, defaultFilters)).toHaveLength(3);
  });

  it('upaljen filter vraća točno označene retke', () => {
    const res = applyFilters(items, { ...defaultFilters, needsExplanationOnly: true });
    expect(res.map(r => r.description)).toEqual(['a']);
  });
});

describe('čuvar — oznaka se nigdje ne pali sama', () => {
  const sources = collectSources(resolve(ROOT, 'src')).filter(p => !p.includes('/test/'));

  it('svaki upis needs_explanation: true vezan je uz korisnikovo stanje', () => {
    const offenders: string[] = [];
    for (const file of sources) {
      const src = readFileSync(file, 'utf8');
      // Doslovna konstanta `true` u pisanju polja = automatika. Zabranjeno.
      if (/needs_explanation:\s*true\b/.test(src)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('executor oznaku uzima isključivo iz korisnikovih odluka', () => {
    const src = readFileSync(resolve(ROOT, 'src/lib/importReview/executor.ts'), 'utf8');
    const writes = src.match(/needs_explanation:\s*[^,\n]+/g) ?? [];
    expect(writes.length).toBeGreaterThan(0);
    for (const w of writes) {
      expect(w).toContain('isNeedsExplanation(input.decisions');
    }
  });

  it('ručni unos oznaku uzima iz kvačice, ne iz kategorije', () => {
    const src = readFileSync(
      resolve(ROOT, 'src/components/add-expense/AddExpenseDialog.tsx'),
      'utf8',
    );
    const writes = src.match(/needs_explanation:\s*[^,\n]+/g) ?? [];
    expect(writes.length).toBeGreaterThan(0);
    for (const w of writes) expect(w).toContain('needsExplanation');
    // Nema veze s odabirom kategorije.
    expect(src).not.toMatch(/needs_explanation:\s*!category/);
  });
});

describe('biljeg u popisu — prigušen, nikad crven ni jantaran', () => {
  const src = readFileSync(resolve(ROOT, 'src/components/TransactionItem.tsx'), 'utf8');

  it('uskličnik je vezan uz oznaku i nosi text-muted-foreground', () => {
    const block = src.slice(src.indexOf("expense.needs_explanation === true"));
    expect(block).toContain('AlertCircle');
    expect(block.slice(0, 600)).toContain('text-muted-foreground');
  });

  it('biljeg ne koristi destructive ni amber boju', () => {
    const start = src.indexOf('expense.needs_explanation === true');
    const block = src.slice(start, start + 600);
    expect(block).not.toMatch(/destructive|text-red|amber/);
  });
});
