import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useExpenses } from '@/hooks/useExpenses';
import { useBudgets } from '@/hooks/useBudgets';
import { useRecurringTransactions } from '@/hooks/useRecurringTransactions';
import { useWalletViewMode } from '@/contexts/WalletViewModeContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { Button } from '@/components/ui/button';
import { ObradaSection } from '@/components/obrada/ObradaSection';
import { TransactionListDialog } from '@/components/TransactionListDialog';
import {
  growthByGroup,
  monthKeyOf,
  monthSummary,
  overBudgetItems,
  recurringMerchants,
  type ObradaRow,
} from '@/lib/obrada/monthlyReview';
import { logObradaError } from '@/lib/obrada/obradaError';
import { buildLoanSummary, monthRange, sumTaggedSpend } from '@/lib/expenseMarkers';
import { matchesCategoryFilter } from '@/lib/categoryGroupMatch';
import { normalizeMerchant } from '@/lib/duplicateDetection';
import type { Expense } from '@/types/expense';

/** Expense tip ne nosi deleted_at; redci iz dohvata ga imaju. */
const isDeleted = (e: Expense): boolean =>
  (e as { deleted_at?: string | null }).deleted_at != null;

interface ListState {
  title: string;
  expenses: Expense[];
  total: number;
}

const Obrada = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { isBusinessView } = useWalletViewMode();
  const { expenses, updateExpense, deleteExpense } = useExpenses();
  const { budgets } = useBudgets({ externalExpenses: expenses });
  const { recurringTransactions } = useRecurringTransactions();
  const { formatAmount } = useCurrency();

  const [month, setMonth] = useState(() => new Date());
  const [list, setList] = useState<ListState | null>(null);

  const rows = expenses as unknown as ObradaRow[];

  const data = useMemo(() => {
    try {
      const range = monthRange(month);
      return {
        summary: monthSummary(rows, month),
        growth: growthByGroup(rows, month),
        recurring: recurringMerchants(rows, month, recurringTransactions),
        unnecessary: sumTaggedSpend(rows, 'unnecessary', range),
        luxury: sumTaggedSpend(rows, 'luxury', range),
        overBudget: overBudgetItems(budgets),
        loans: buildLoanSummary(rows),
      };
    } catch (err) {
      logObradaError('compute', err);
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, budgets, recurringTransactions, month]);

  if (isBusinessView) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted-foreground">{t('obrada.personalOnly')}</p>
        <Button variant="outline" onClick={() => navigate('/home')}>
          {t('common.back')}
        </Button>
      </div>
    );
  }

  const shiftMonth = (delta: number) =>
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));

  const monthLabel = new Intl.DateTimeFormat(i18n.language, {
    month: 'long',
    year: 'numeric',
  }).format(month);

  const openGroupList = (groupKey: string, label: string) => {
    const key = monthKeyOf(month);
    const filtered = expenses.filter(
      (e) =>
        e.type === 'expense' &&
        !isDeleted(e) &&
        matchesCategoryFilter(e.category, `group:${groupKey}`) &&
        `${e.date.getFullYear()}-${String(e.date.getMonth() + 1).padStart(2, '0')}` === key,
    );
    setList({
      title: label,
      expenses: filtered,
      total: filtered.reduce((s, e) => s + e.amount, 0),
    });
  };

  const openMerchantList = (merchantKey: string, name: string) => {
    const key = monthKeyOf(month);
    const filtered = expenses.filter((e) => {
      if (e.type !== 'expense' || isDeleted(e)) return false;
      const mk = `${e.date.getFullYear()}-${String(e.date.getMonth() + 1).padStart(2, '0')}`;
      if (mk !== key) return false;
      const raw =
        (e.merchant_name ?? '').trim() ||
        (e.counterparty_name_snapshot ?? '').trim() ||
        (e.description ?? '').trim();
      return normalizeMerchant(raw) === merchantKey;
    });
    setList({
      title: name,
      expenses: filtered,
      total: filtered.reduce((s, e) => s + e.amount, 0),
    });
  };

  const label = (key: string) => (key.includes('.') ? t(key) : key);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-3 px-4 pb-24 pt-4">
      <header className="flex items-center justify-between">
        <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => shiftMonth(-1)} aria-label={t('obrada.prevMonth')}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-base font-semibold capitalize">{monthLabel}</h1>
        <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => shiftMonth(1)} aria-label={t('obrada.nextMonth')}>
          <ChevronRight className="h-5 w-5" />
        </Button>
      </header>

      {!data ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('obrada.errors.loadFailed')}</p>
      ) : (
        <>
          <section className="grid grid-cols-3 gap-2" data-testid="obrada-summary">
            <div className="rounded-xl border border-border bg-card p-3 text-center">
              <p className="text-xs text-muted-foreground">{t('obrada.summary.in')}</p>
              <p className="text-sm font-semibold text-primary">{formatAmount(data.summary.income)}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3 text-center">
              <p className="text-xs text-muted-foreground">{t('obrada.summary.out')}</p>
              <p className="text-sm font-semibold text-foreground">{formatAmount(data.summary.spend)}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3 text-center">
              <p className="text-xs text-muted-foreground">{t('obrada.summary.left')}</p>
              <p className="text-sm font-semibold text-foreground">{formatAmount(data.summary.net)}</p>
            </div>
          </section>

          <ObradaSection title={t('obrada.leaks.title')} subtitle={t('obrada.leaks.subtitle')} defaultOpen testId="obrada-leaks">
            {data.growth.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('obrada.empty')}</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {data.growth.map((g) => (
                  <li key={g.key}>
                    <button
                      type="button"
                      className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-lg px-2 text-left"
                      onClick={() => openGroupList(g.key, label(g.labelKey))}
                    >
                      <span className="truncate text-sm">{label(g.labelKey)}</span>
                      <span className="shrink-0 text-sm font-medium">
                        {formatAmount(g.current)}{' '}
                        <span className="text-xs text-muted-foreground">
                          ({t('obrada.leaks.avg')} {formatAmount(g.average)})
                        </span>
                      </span>
                    </button>
                    {g.categories.length > 0 && (
                      <ul className="ml-4 flex flex-col">
                        {g.categories.map((c) => (
                          <li key={c.key} className="flex items-center justify-between gap-2 px-2 py-1 text-xs text-muted-foreground">
                            <span className="truncate">{label(c.labelKey)}</span>
                            <span className="shrink-0">{formatAmount(c.current)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </ObradaSection>

          <ObradaSection title={t('obrada.recurring.title')} subtitle={t('obrada.recurring.subtitle')} testId="obrada-recurring">
            {data.recurring.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('obrada.empty')}</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {data.recurring.map((r) => (
                  <li key={r.key}>
                    <button
                      type="button"
                      className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-lg px-2 text-left"
                      onClick={() => openMerchantList(r.key, r.name)}
                    >
                      <span className="min-w-0 truncate text-sm">
                        {r.name}
                        {r.isKnownSubscription && (
                          <span className="ml-1 text-xs text-muted-foreground">({t('obrada.recurring.subscription')})</span>
                        )}
                      </span>
                      <span className="shrink-0 text-sm font-medium">
                        {formatAmount(r.monthTotal)}{' '}
                        <span className="text-xs text-muted-foreground">
                          ≈ {formatAmount(r.yearlyProjection)}/{t('obrada.recurring.perYear')}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </ObradaSection>

          <ObradaSection title={t('obrada.markers.title')} testId="obrada-markers">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-border p-3 text-center">
                <p className="text-xs text-muted-foreground">{t('obrada.markers.unnecessary')}</p>
                <p className="text-sm font-semibold">{formatAmount(data.unnecessary.total)}</p>
              </div>
              <div className="rounded-lg border border-border p-3 text-center">
                <p className="text-xs text-muted-foreground">{t('obrada.markers.luxury')}</p>
                <p className="text-sm font-semibold">{formatAmount(data.luxury.total)}</p>
              </div>
            </div>
          </ObradaSection>

          <ObradaSection title={t('obrada.overBudget.title')} testId="obrada-overbudget">
            {data.overBudget.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('obrada.overBudget.none')}</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {data.overBudget.map((o) => (
                  <li key={`${o.budgetId}-${o.categoryKey}`} className="flex items-center justify-between gap-2 px-2 py-2">
                    <span className="min-w-0 truncate text-sm">
                      {label(o.labelKey)} <span className="text-xs text-muted-foreground">({o.budgetName})</span>
                    </span>
                    <span className="shrink-0 text-sm font-medium text-destructive">
                      +{formatAmount(o.overBy)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </ObradaSection>

          <ObradaSection title={t('obrada.loans.title')} testId="obrada-loans">
            {data.loans.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('obrada.loans.none')}</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {data.loans.map((l) => (
                  <li key={l.key} className="flex items-center justify-between gap-2 px-2 py-2">
                    <span className="min-w-0 truncate text-sm">{l.name}</span>
                    <span className="shrink-0 text-sm font-medium">
                      {l.owedToMe > 0 && <span className="text-primary">{t('obrada.loans.owedToMe')} {formatAmount(l.owedToMe)}</span>}
                      {l.owedToMe > 0 && l.iOwe > 0 && ' · '}
                      {l.iOwe > 0 && <span className="text-destructive">{t('obrada.loans.iOwe')} {formatAmount(l.iOwe)}</span>}
                      {l.owedToMe <= 0 && l.iOwe <= 0 && <span className="text-muted-foreground">{t('obrada.loans.settled')}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </ObradaSection>
        </>
      )}

      <TransactionListDialog
        open={list !== null}
        onOpenChange={(open) => !open && setList(null)}
        type="expense"
        expenses={list?.expenses ?? []}
        onUpdate={updateExpense}
        onDelete={deleteExpense}
        total={list?.total ?? 0}
      />
    </div>
  );
};

export default Obrada;
