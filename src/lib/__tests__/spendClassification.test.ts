import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { isRealSpend, isRealIncome, isExpenseType, isIncomeType } from '@/lib/spendClassification';

const START = '// ---------------- SHARED CORE START ----------------';
const END = '// ---------------- SHARED CORE END ----------------';
const core = (p: string) => {
  const s = readFileSync(join(process.cwd(), p), 'utf8');
  return s.slice(s.indexOf(START), s.indexOf(END) + END.length);
};

describe('spendClassification — pravilo', () => {
  it('zrcalo je doslovno isto', () => {
    const a = core('src/lib/spendClassification.ts');
    expect(a.length).toBeGreaterThan(START.length + END.length);
    expect(core('supabase/functions/_shared/spendClassification.ts')).toBe(a);
  });

  it.each([
    [{ type: 'expense' }, true, false],
    [{ type: 'expense', expense_nature: 'regular' }, true, false],
    [{ type: 'expense', expense_nature: 'extraordinary' }, true, false],
    [{ type: 'expense', expense_nature: null }, true, false],
    [{ type: 'income' }, false, true],
    [{ type: 'transfer' }, false, false],
    [{ type: 'expense', expense_nature: 'correction' }, false, false],
    [{ type: 'income', expense_nature: 'correction' }, false, false],
    [{ type: 'expense', deleted_at: '2026-09-01T00:00:00Z' }, false, false],
    [{ type: 'income', deleted_at: '2026-09-01T00:00:00Z' }, false, false],
    // rezervirano
    [{ type: 'expense', expense_nature: 'krug_settlement' }, false, false],
    [{ type: 'income', movement_kind: 'loan' }, false, false],
  ])('%o → spend=%s income=%s', (row, spend, income) => {
    expect(isRealSpend(row)).toBe(spend);
    expect(isRealIncome(row)).toBe(income);
  });

  it('null/undefined nisu ništa', () => {
    expect(isRealSpend(null)).toBe(false);
    expect(isRealIncome(undefined)).toBe(false);
  });

  it('smjer ne gleda prirodu (korekcija je i dalje odljev za saldo)', () => {
    expect(isExpenseType({ type: 'expense' })).toBe(true);
    expect(isIncomeType({ type: 'income' })).toBe(true);
  });
});

/**
 * Brana: izravna provjera `<redak>.type === 'expense' | 'income'` smije postojati
 * samo u helperu i u kratkom popisu upisnih putova / motora salda.
 * Sva ostala mjesta koriste isRealSpend/isRealIncome (zbrajanje) ili
 * isExpenseType/isIncomeType (samo smjer: predznak, boja).
 */
const ALLOWED = new Set([
  'src/lib/spendClassification.ts',
  'supabase/functions/_shared/spendClassification.ts',
  // generirani MCP paket nosi ugrađenu kopiju helpera
  'supabase/functions/mcp/index.ts',
  // motor salda — korekcija MORA mijenjati saldo
  'src/lib/balance/anchorBalance.ts',
  'src/lib/balance/balanceEngineMirror.ts',
  'src/hooks/useBalanceUpdater.ts',
  // upisni putevi: forme
  'src/hooks/useExpenseCRUD.ts',
  'src/components/add-expense/ManualExpenseForm.tsx',
  'src/components/add-expense/AddExpenseDialog.tsx',
  'src/components/add-expense/ScannedDataPreview.tsx',
  'src/components/add-expense/PaymentSourceSelector.tsx',
  'src/components/add-expense/AdvanceLinkSection.tsx',
  'src/components/EditTransactionDialog.tsx',
  'src/components/onboarding/OnboardingManualSheet.tsx',
  'src/components/recurring/RecurringTransactionDialog.tsx',
  // upisni putevi: uvoz i sync
  'src/components/CSVImportDialog.tsx',
  'src/components/pdf-import/GlobalPDFImportHost.tsx',
  'src/pages/ImportReview.tsx',
  'src/lib/importReview/transferDirection.ts',
  'src/lib/importReview/patternSelection.ts',
  'src/lib/pdfPostProcess.ts',
  'src/components/BankConnection.tsx',
  'supabase/functions/parse-pdf-statement/index.ts',
  'supabase/functions/bank-sync-transactions/index.ts',
]);
const PAT = /[\w)\]]\.type\s*[!=]==?\s*['"](expense|income)['"]/;

function walk(dir: string, out: string[]) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) {
      if (n === 'node_modules' || n === '__tests__' || n === 'test') continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n)) out.push(p);
  }
}

describe('brana: nema izravne provjere vrste izvan helpera', () => {
  it('src i supabase/functions', () => {
    const files: string[] = [];
    walk('src', files);
    walk('supabase/functions', files);
    const offenders: string[] = [];
    for (const f of files) {
      const rel = f.replace(/\\/g, '/');
      if (ALLOWED.has(rel)) continue;
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        if (PAT.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
