import { useState, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, X, Receipt, ArrowUpRight, ArrowDownRight, ArrowLeftRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Expense } from '@/types/expense';
import { useCurrency } from '@/contexts/CurrencyContext';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface GlobalSearchProps {
  expenses: Expense[];
  onSelectExpense: (expense: Expense) => void;
  alwaysExpanded?: boolean;
}

export const GlobalSearch = ({ expenses, onSelectExpense, alwaysExpanded = false }: GlobalSearchProps) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const [open, setOpen] = useState(alwaysExpanded);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    if (!query.trim() || query.length < 2) return [];
    const q = query.toLowerCase();
    return expenses
      .filter(e =>
        e.description.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        e.merchant_name?.toLowerCase().includes(q) ||
        e.note?.toLowerCase().includes(q) ||
        String(e.amount).includes(q)
      )
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 12);
  }, [expenses, query]);

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

  // Always-expanded mode: render inline search bar
  if (alwaysExpanded) {
    return (
      <div ref={containerRef} className="relative w-full">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={t('search.placeholder', 'Pretraži transakcije...')}
          className="pl-9 pr-8 h-9 text-sm rounded-xl w-full"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted/60 transition-colors"
          >
            <X className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        )}
        <AnimatePresence>
          {query.length >= 2 && (
            <motion.div
              initial={{ opacity: 0, y: 4, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.2 }}
              className="absolute top-full mt-1 left-0 right-0 max-h-80 overflow-y-auto rounded-xl border border-border bg-popover shadow-lg z-50"
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
                  {results.map(expense => (
                    <button
                      key={expense.id}
                      className="w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors flex items-center gap-2.5 active:scale-[0.98]"
                      onClick={() => {
                        onSelectExpense(expense);
                        setQuery('');
                      }}
                    >
                      {typeIcon(expense.type)}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{expense.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {expense.category} • {format(expense.date, 'dd.MM.yyyy')}
                        </p>
                      </div>
                      <span className={cn(
                        'text-sm font-mono font-medium shrink-0',
                        expense.type === 'income' ? 'text-income' : expense.type === 'transfer' ? 'text-muted-foreground' : 'text-destructive'
                      )}>
                        {expense.type === 'income' ? '+' : expense.type === 'expense' ? '-' : ''}
                        {formatAmount(expense.amount)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
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
          onChange={e => setQuery(e.target.value)}
          placeholder={t('search.placeholder', 'Pretraži transakcije...')}
          className="pl-8 pr-8 h-9 text-sm rounded-xl"
        />
        <button
          onClick={() => { setOpen(false); setQuery(''); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted/60 transition-colors"
        >
          <X className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </motion.div>

      <AnimatePresence>
        {query.length >= 2 && (
          <motion.div
            initial={{ opacity: 0, y: 4, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.2 }}
            className="absolute top-full mt-1 right-0 w-72 sm:w-80 max-h-80 overflow-y-auto rounded-xl border border-border bg-popover shadow-lg"
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
                {results.map(expense => (
                  <button
                    key={expense.id}
                    className="w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors flex items-center gap-2.5 active:scale-[0.98]"
                    onClick={() => {
                      onSelectExpense(expense);
                      setOpen(false);
                      setQuery('');
                    }}
                  >
                    {typeIcon(expense.type)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{expense.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {expense.category} • {format(expense.date, 'dd.MM.yyyy')}
                      </p>
                    </div>
                    <span className={cn(
                      'text-sm font-mono font-medium shrink-0',
                      expense.type === 'income' ? 'text-income' : expense.type === 'transfer' ? 'text-muted-foreground' : 'text-destructive'
                    )}>
                      {expense.type === 'income' ? '+' : expense.type === 'expense' ? '-' : ''}
                      {formatAmount(expense.amount)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
