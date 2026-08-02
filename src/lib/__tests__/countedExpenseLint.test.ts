/**
 * Korak E — counted-expense lint.
 *
 * Every READ against `expenses` must either
 *   a) filter by review status in the query (`.eq('status', ...)`,
 *      `.in('status', COUNTED_EXPENSE_STATUSES)`, `applyCountedFilter(...)`), or
 *   b) select the `status` column so the caller can apply the shared in-memory
 *      predicate (`isCountedExpenseRow` / `isCountedProjectTransaction`), or
 *   c) be listed in `countedExpenseAllowlist.json` with an explicit reason.
 *
 * Writes (insert/update/upsert/delete) are out of scope.
 *
 * The allowlist is a frozen snapshot: a NEW unfiltered read makes this test
 * fail, which is the whole point — the rule must not leak on the next change.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import allowlist from './countedExpenseAllowlist.json';

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

const FROM_EXPENSES = /\.from\(\s*['"]expenses['"]\s*\)/g;

const isWrite = (chunk: string) =>
  /^\s*\.\s*(insert|update|upsert|delete)\s*\(/.test(chunk) ||
  /\)\s*\.\s*(insert|update|upsert|delete)\s*\(/.test(chunk.slice(0, 60));

const isFiltered = (chunk: string) =>
  chunk.includes('applyCountedFilter') ||
  chunk.includes('COUNTED_EXPENSE_STATUSES') ||
  /\.(eq|in|neq)\(\s*['"]status['"]/.test(chunk) ||
  /select\([^)]*\bstatus\b/.test(chunk);

/** file → number of tolerated unfiltered reads */
const ALLOWED = allowlist as Record<string, number>;

const collect = (): Record<string, number> => {
  const found: Record<string, number> = {};
  for (const dir of SCAN_DIRS) {
    for (const file of walk(join(ROOT, dir))) {
      const src = readFileSync(file, 'utf8');
      const rel = relative(ROOT, file).split('\\').join('/');
      let match: RegExpExecArray | null;
      FROM_EXPENSES.lastIndex = 0;
      while ((match = FROM_EXPENSES.exec(src)) !== null) {
        const chunk = src.slice(match.index, match.index + 700);
        const statement = chunk.split(';')[0];
        if (isWrite(statement)) continue;
        if (isFiltered(statement)) continue;
        found[rel] = (found[rel] ?? 0) + 1;
      }
    }
  }
  return found;
};

describe('counted-expense lint', () => {
  it('has no unfiltered `expenses` read outside the frozen allowlist', () => {
    const found = collect();
    const offenders: string[] = [];

    for (const [file, count] of Object.entries(found)) {
      const allowed = ALLOWED[file] ?? 0;
      if (count > allowed) {
        offenders.push(
          `${file}: ${count} unfiltered expenses read(s), allowlist permits ${allowed}. ` +
            `Add the counted filter (applyCountedFilter / .in('status', COUNTED_EXPENSE_STATUSES)) ` +
            `or select the status column and use isCountedExpenseRow.`,
        );
      }
    }

    expect(offenders).toEqual([]);
  });

  it('allowlist has no stale entries', () => {
    const found = collect();
    const stale = Object.keys(ALLOWED).filter(f => (found[f] ?? 0) < ALLOWED[f]);
    expect(stale, 'shrink the allowlist counts for these files').toEqual([]);
  });
});
