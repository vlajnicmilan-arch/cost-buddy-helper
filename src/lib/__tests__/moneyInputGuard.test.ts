import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

/**
 * Grep-guard: no money-input dialog should sneak back to raw
 * `Input type="number"` + `parseFloat/Number(...)` for currency fields.
 *
 * We whitelist known non-money numeric inputs (hours, quantity, VAT%,
 * days, count, share %). Everything else on the "money" surface must go
 * through MoneyInput + parseLocaleAmount / parseMoneyStrict.
 */

// Files that intentionally use type="number" for non-money integers/quantities/percentages.
const NON_MONEY_ALLOWLIST = new Set<string>([
  'src/components/projects/WorkerScheduleDialog.tsx',
  'src/components/projects/WorkLogDialog.tsx',
  'src/components/projects/WorkCalendarOverview.tsx',
  'src/components/projects/WeeklyWorkEntryForm.tsx',
  'src/components/projects/ProjectShareDialog.tsx',
  'src/components/installments/InstallmentToggle.tsx',
  'src/components/recurring/RecurringTransactionDialog.tsx', // day-of-month integer
  'src/components/projects/ProjectMilestonesTab.tsx',        // reminderDays integer (budget now MoneyInput)
  'src/components/projects/InvoiceDialog.tsx',               // qty & vat% (unit_price now MoneyInput)
  'src/components/projects/EstimateDialog.tsx',              // qty & vat% (unit_price now MoneyInput)
  'src/components/add-expense/ExpenseItemsList.tsx',         // qty (unit_price & total now MoneyInput)
  'src/components/projects/ProjectWorkerDialog.tsx',         // work_hours (hourly_rate now MoneyInput)
  'src/pages/Dashboard.tsx',                                 // recharts XAxis type="number"
  'src/components/reports/ReportsDialog.tsx',                // recharts XAxis
  'src/components/reports/ItemsAnalysisTab.tsx',             // recharts XAxis
  'src/components/projects/ProjectReportsDialog.tsx',        // recharts XAxis
  'src/components/TransactionFilters.tsx',                   // (now MoneyInput; residual matches are recharts)
]);

const findFiles = (): string[] => {
  const out = execSync(
    `git ls-files 'src/components/**/*.tsx' 'src/pages/**/*.tsx' 2>/dev/null || rg --files src/components src/pages -g '*.tsx'`,
    { encoding: 'utf8' },
  );
  return out.split('\n').filter(Boolean);
};

describe('money-input grep guard', () => {
  it('no non-allowlisted file uses `Input type="number"` for currency fields', () => {
    const offenders: string[] = [];
    for (const file of findFiles()) {
      if (NON_MONEY_ALLOWLIST.has(file)) continue;
      let src: string;
      try {
        src = readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      if (!/type="number"/.test(src)) continue;
      // If the file has `type="number"` outside of recharts <XAxis> usage,
      // require it to also import MoneyInput (proof it uses the wrapper for money).
      const nonAxisMatches = src
        .split('\n')
        .filter((line) => /type="number"/.test(line) && !/XAxis|YAxis|ZAxis|Radar/.test(line));
      if (nonAxisMatches.length === 0) continue;
      offenders.push(file);
    }
    expect(offenders, `Convert money fields in these files to <MoneyInput>: \n${offenders.join('\n')}`).toEqual([]);
  });

  it('no money-form file calls `parseFloat(<amount-like>)` directly', () => {
    const suspects = /\bparseFloat\s*\(\s*(amount|editAmount|totalAmount|balance|newBalance|hourlyRate|totalPrice|paidAmount|totalWithTip|targetAmount|currentAmount|contractValue|totalBudget|budget|amendmentAmount|formAmount)\s*\)/;
    const offenders: string[] = [];
    for (const file of findFiles()) {
      let src: string;
      try {
        src = readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      if (suspects.test(src)) offenders.push(file);
    }
    expect(offenders, `Replace parseFloat(...) with parseLocaleAmount(...).value in:\n${offenders.join('\n')}`).toEqual([]);
  });
});
