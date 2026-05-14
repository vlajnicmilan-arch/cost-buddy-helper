import { useState, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, X, ArrowUpRight, ArrowDownRight, ArrowLeftRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Expense } from '@/types/expense';
import { useCurrency } from '@/contexts/CurrencyContext';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface LookupItem { id: string; name: string }
interface PaymentSourceLookup extends LookupItem {
  cards?: { id: string; last_four_digits?: string | null }[];
}

interface GlobalSearchProps {
  expenses: Expense[];
  onSelectExpense: (expense: Expense) => void;
  alwaysExpanded?: boolean;
  paymentSources?: PaymentSourceLookup[];
  projects?: LookupItem[];
  budgets?: LookupItem[];
  customCategories?: LookupItem[];
}

const PAGE_SIZE = 50;

export const GlobalSearch = ({
  expenses,
  onSelectExpense,
  alwaysExpanded = false,
  paymentSources = [],
  projects = [],
  budgets = [],
  customCategories = [],
}: GlobalSearchProps) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const [open, setOpen] = useState(alwaysExpanded);
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Lookup maps
  const lookups = useMemo(() => {
    const sources = new Map<string, string>();
    const cards = new Map<string, string>(); // card_id -> last4
    paymentSources.forEach((s) => {
      sources.set(s.id, s.name);
      s.cards?.forEach((c) => {
        if (c.last_four_digits) cards.set(c.id, c.last_four_digits);
      });
    });
    const projectMap = new Map(projects.map((p) => [p.id, p.name]));
    const budgetMap = new Map(budgets.map((b) => [b.id, b.name]));
    const customCatMap = new Map(customCategories.map((c) => [c.id, c.name]));
    return { sources, cards, projects: projectMap, budgets: budgetMap, customCats: customCatMap };
  }, [paymentSources, projects, budgets, customCategories]);

  // Localized type label
  const typeLabel = (type: string) => {
    if (type === 'income') return t('common.income', 'Prihod');
    if (type === 'transfer') return t('common.transfer', 'Prijenos');
    return t('common.expense', 'Trošak');
  };

  // Build searchable text blob per expense
  const searchableExpenses = useMemo(() => {
    return expenses.map((e) => {
      const parts: string[] = [];
      if (e.description) parts.push(e.description);
      if (e.merchant_name) parts.push(e.merchant_name);
      if (e.note) parts.push(e.note);
      // Category: raw + localized standard + custom name
      if (e.category) {
        parts.push(e.category);
        // try standard category translation
        const tr = t(`categories.${e.category}`, { defaultValue: '' });
        if (tr) parts.push(tr);
        // custom category lookup
        const custom = lookups.customCats.get(e.category);
        if (custom) parts.push(custom);
      }
      // Payment source name (custom:UUID)
      if (e.payment_source) {
        parts.push(e.payment_source);
        if (e.payment_source.startsWith('custom:')) {
          const id = e.payment_source.slice(7);
          const name = lookups.sources.get(id);
          if (name) parts.push(name);
        }
      }
      // Card last 4
      if (e.payment_source_card_id) {
        const last4 = lookups.cards.get(e.payment_source_card_id);
        if (last4) parts.push(last4);
      }
      // Project / Budget
      if (e.project_id) {
        const name = lookups.projects.get(e.project_id);
        if (name) parts.push(name);
      }
      if (e.budget_id) {
        const name = lookups.budgets.get(e.budget_id);
        if (name) parts.push(name);
      }
      // Type label
      parts.push(typeLabel(e.type));
      // Amount in multiple formats
      const amt = e.amount;
      parts.push(String(amt));
      parts.push(amt.toFixed(2));
      parts.push(amt.toFixed(2).replace('.', ','));
      // Date
      try {
        parts.push(format(e.date, 'dd.MM.yyyy'));
        parts.push(format(e.date, 'yyyy-MM-dd'));
        parts.push(format(e.date, 'dd.MM.'));
      } catch {
        // ignore invalid dates
      }
      // Currency code
      if (e.currency) parts.push(e.currency);
      return { expense: e, blob: parts.join(' ').toLowerCase() };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, lookups, t]);

  const results = useMemo(() => {
    if (!query.trim() || query.length < 2) return [];
    // Normalize query: support both decimal separators
    const raw = query.toLowerCase().trim();
    const variants = new Set([raw]);
    if (raw.includes(',')) variants.add(raw.replace(',', '.'));
    if (raw.includes('.')) variants.add(raw.replace('.', ','));
    return searchableExpenses
      .filter(({ blob }) => {
        for (const v of variants) {
          if (blob.includes(v)) return true;
        }
        return false;
      })
      .map((x) => x.expense)
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [searchableExpenses, query]);

  // Reset pagination when query changes
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query]);

  // Close on click outside (only for non-always-expanded)
  useEffect(() => {
    if (alwaysExpanded) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, alwaysExpanded]);

  const typeIcon = (type: string) => {
    if (type === 'income') return <ArrowUpRight className="w-3.5 h-3.5 text-income" />;
    if (type === 'transfer') return <ArrowLeftRight className="w-3.5 h-3.5 text-muted-foreground" />;
    return <ArrowDownRight className="w-3.5 h-3.5 text-destructive" />;
  };

  const visibleResults = results.slice(0, visibleCount);
  const hasMore = results.length > visibleCount;

  const renderResultsPanel = (panelClass: string) => (
    <AnimatePresence>
      {query.length >= 2 && (
        <motion.div
          initial={{ opacity: 0, y: 4, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.2 }}
          className={panelClass}
        >
          {results.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              {t('search.noResults', 'Nema rezultata')}
            </div>
          ) : (
            <div className="py-1">
              <p className="px-3 py-1.5 text-xs text-muted-foreground font-medium">
                {t('search.results', '{{count}} rezultata', { count: results.length })}
              </p>
              {visibleResults.map((expense) => (
                <button
                  key={expense.id}
                  className="w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors flex items-center gap-2.5 active:scale-[0.98]"
                  onClick={() => {
                    onSelectExpense(expense);
                    if (!alwaysExpanded) setOpen(false);
                    setQuery('');
                  }}
                >
                  {typeIcon(expense.type)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{expense.description}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {expense.category} • {format(expense.date, 'dd.MM.yyyy')}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'text-sm font-mono font-medium shrink-0',
                      expense.type === 'income'
                        ? 'text-income'
                        : expense.type === 'transfer'
                          ? 'text-muted-foreground'
                          : 'text-destructive'
                    )}
                  >
                    {expense.type === 'income' ? '+' : expense.type === 'expense' ? '-' : ''}
                    {formatAmount(expense.amount)}
                  </span>
                </button>
              ))}
              {hasMore && (
                <button
                  onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                  className="w-full text-center px-3 py-2.5 text-sm text-primary hover:bg-muted/50 transition-colors font-medium"
                >
                  {t('search.showMore', 'Prikaži više ({{count}})', {
                    count: results.length - visibleCount,
                  })}
                </button>
              )}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );

  // Always-expanded mode: render inline search bar
  if (alwaysExpanded) {
    return (
      <div ref={containerRef} className="relative w-full">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('search.placeholder', 'Pretraži transakcije...')}
          className="pl-9 pr-8 h-9 text-sm rounded-xl w-full"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted/60 transition-colors"
            aria-label={t('common.clear', 'Očisti')}
          >
            <X className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        )}
        {renderResultsPanel(
          'absolute top-full mt-1 left-0 right-0 max-h-[60vh] overflow-y-auto rounded-xl border border-border bg-popover shadow-lg z-50'
        )}
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl h-8 w-8 sm:h-9 sm:w-9 flex items-center justify-center border border-border/50 bg-background hover:bg-muted/60 transition-colors active:scale-95"
        aria-label={t('search.global', 'Pretraži')}
      >
        <Search className="w-4 h-4 text-muted-foreground" />
      </button>
    );
  }

  return (
    <div ref={containerRef} className="relative z-50">
      <motion.div
        initial={{ width: 36, opacity: 0.8 }}
        animate={{ width: 240, opacity: 1 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="relative"
      >
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('search.placeholder', 'Pretraži transakcije...')}
          className="pl-8 pr-8 h-9 text-sm rounded-xl"
        />
        <button
          onClick={() => {
            setOpen(false);
            setQuery('');
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted/60 transition-colors"
          aria-label={t('common.close', 'Zatvori')}
        >
          <X className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </motion.div>
      {renderResultsPanel(
        'absolute top-full mt-1 right-0 w-72 sm:w-80 max-h-[60vh] overflow-y-auto rounded-xl border border-border bg-popover shadow-lg'
      )}
    </div>
  );
};
