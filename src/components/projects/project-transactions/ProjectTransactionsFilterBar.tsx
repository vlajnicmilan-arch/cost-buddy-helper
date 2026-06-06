import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Search, X, Filter, CalendarIcon, Milestone, CreditCard, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import type { Locale } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { makeCalendarDisabled } from '@/lib/dateValidation';
import { resolveCategory } from '@/hooks/useResolvedCategory';
import type { ProjectMilestone } from '@/types/project';
import type { DateRange } from 'react-day-picker';
import type { ProjectExpense } from './types';

interface ProjectTransactionsFilterBarProps {
  // controlled
  searchTerm: string;
  onSearchTermChange: (v: string) => void;
  showFilters: boolean;
  onShowFiltersChange: (v: boolean) => void;
  filterMilestoneId: string;
  onFilterMilestoneIdChange: (v: string) => void;
  filterDateRange: DateRange | undefined;
  onFilterDateRangeChange: (v: DateRange | undefined) => void;
  filterPaymentSource: string;
  onFilterPaymentSourceChange: (v: string) => void;
  filterExpenseNature: string;
  onFilterExpenseNatureChange: (v: string) => void;
  filterCategory: string;
  onFilterCategoryChange: (v: string) => void;
  filterWorkType: string;
  onFilterWorkTypeChange: (v: string) => void;
  filterDateOpen: boolean;
  onFilterDateOpenChange: (v: boolean) => void;
  // data
  expenses: ProjectExpense[];
  milestones: ProjectMilestone[];
  customCategories: any[];
  getPaymentSourceLabel: (s: string) => string;
  dateLocale: Locale;
  reportDateLimits: { minDate?: Date; maxDate?: Date };
  // actions
  onClearAll: () => void;
}

export const ProjectTransactionsFilterBar = ({
  searchTerm,
  onSearchTermChange,
  showFilters,
  onShowFiltersChange,
  filterMilestoneId,
  onFilterMilestoneIdChange,
  filterDateRange,
  onFilterDateRangeChange,
  filterPaymentSource,
  onFilterPaymentSourceChange,
  filterExpenseNature,
  onFilterExpenseNatureChange,
  filterCategory,
  onFilterCategoryChange,
  filterWorkType,
  onFilterWorkTypeChange,
  filterDateOpen,
  onFilterDateOpenChange,
  expenses,
  milestones,
  customCategories,
  getPaymentSourceLabel,
  dateLocale,
  reportDateLimits,
  onClearAll,
}: ProjectTransactionsFilterBarProps) => {
  const { t } = useTranslation();

  const sources = [...new Set(expenses.map((e) => e.payment_source).filter(Boolean))] as string[];
  const usedCategories = [...new Set(expenses.map((e) => e.category))];

  return (
    <div className="space-y-2">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder={t('transactions.searchByName', 'Pretraži transakcije...')}
          value={searchTerm}
          onChange={(e) => onSearchTermChange(e.target.value)}
          className="pl-9 pr-9 h-9 text-sm"
        />
        {searchTerm && (
          <button
            onClick={() => onSearchTermChange('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Filter Toggle */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          className={cn('h-8 text-xs gap-1.5', showFilters && 'bg-primary/10 border-primary')}
          onClick={() => onShowFiltersChange(!showFilters)}
        >
          <Filter className="w-3.5 h-3.5" />
          {t('filters.filters', 'Filteri')}
          {(filterMilestoneId !== 'all' ||
            filterDateRange?.from ||
            filterPaymentSource !== 'all' ||
            filterExpenseNature !== 'all') && <span className="w-2 h-2 rounded-full bg-primary" />}
        </Button>

        {(filterMilestoneId !== 'all' ||
          filterDateRange?.from ||
          filterPaymentSource !== 'all' ||
          filterExpenseNature !== 'all' ||
          searchTerm) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs px-2 text-muted-foreground hover:text-destructive"
            onClick={onClearAll}
          >
            <X className="w-3 h-3 mr-1" />
            {t('filters.clear', 'Očisti')}
          </Button>
        )}
      </div>

      {/* Advanced Filters */}
      {showFilters && (
        <div className="flex flex-wrap gap-2 p-3 rounded-lg bg-muted/50 border">
          {milestones.length > 0 && (
            <Select value={filterMilestoneId} onValueChange={onFilterMilestoneIdChange}>
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <Milestone className="w-3.5 h-3.5 mr-1.5" />
                <SelectValue placeholder={t('projects.allMilestones', 'Sve faze')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('projects.allMilestones', 'Sve faze')}</SelectItem>
                <SelectItem value="none">{t('transactions.noMilestone', 'Bez faze')}</SelectItem>
                {milestones.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Popover open={filterDateOpen} onOpenChange={onFilterDateOpenChange}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  'h-8 text-xs gap-1.5 justify-start',
                  filterDateRange?.from && 'bg-primary/10 border-primary',
                )}
              >
                <CalendarIcon className="w-3.5 h-3.5" />
                {filterDateRange?.from ? (
                  filterDateRange?.to ? (
                    <>
                      {format(filterDateRange.from, 'dd.MM.yy', { locale: dateLocale })} -{' '}
                      {format(filterDateRange.to, 'dd.MM.yy', { locale: dateLocale })}
                    </>
                  ) : (
                    format(filterDateRange.from, 'dd.MM.yyyy', { locale: dateLocale })
                  )
                ) : (
                  t('filters.selectPeriod', 'Odaberi period')
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                selected={filterDateRange}
                onSelect={(range) => {
                  onFilterDateRangeChange(range);
                  if (range?.from && range?.to) onFilterDateOpenChange(false);
                }}
                numberOfMonths={1}
                locale={dateLocale}
                disabled={makeCalendarDisabled(reportDateLimits)}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          {sources.length > 0 && (
            <Select value={filterPaymentSource} onValueChange={onFilterPaymentSourceChange}>
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <CreditCard className="w-3.5 h-3.5 mr-1.5" />
                <SelectValue placeholder={t('filters.allSources', 'Svi izvori')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('filters.allSources', 'Svi izvori')}</SelectItem>
                {sources.map((source) => (
                  <SelectItem key={source} value={source}>
                    {getPaymentSourceLabel(source)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select value={filterExpenseNature} onValueChange={onFilterExpenseNatureChange}>
            <SelectTrigger className="w-[160px] h-8 text-xs">
              <AlertCircle className="w-3.5 h-3.5 mr-1.5" />
              <SelectValue placeholder={t('filters.allNatures', 'Sve vrste')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filters.allNatures', 'Sve vrste')}</SelectItem>
              <SelectItem value="regular">{t('projects.regular', 'Redovni')}</SelectItem>
              <SelectItem value="extraordinary">{t('projects.extraordinary', 'Vanredni')}</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterWorkType} onValueChange={onFilterWorkTypeChange}>
            <SelectTrigger className="w-[160px] h-8 text-xs">
              <Filter className="w-3.5 h-3.5 mr-1.5" />
              <SelectValue placeholder={t('filters.allWorkTypes', 'Materijal/Rad')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filters.allWorkTypes', 'Materijal/Rad')}</SelectItem>
              <SelectItem value="material">🧱 {t('workType.material', 'Materijal')}</SelectItem>
              <SelectItem value="labor">👷 {t('workType.labor', 'Rad')}</SelectItem>
              <SelectItem value="equipment">🛠️ {t('workType.equipment', 'Oprema')}</SelectItem>
              <SelectItem value="other">📦 {t('workType.other', 'Ostalo')}</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterCategory} onValueChange={onFilterCategoryChange}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <Filter className="w-3.5 h-3.5 mr-1.5" />
              <SelectValue placeholder={t('filters.allCategories', 'Sve kategorije')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filters.allCategories', 'Sve kategorije')}</SelectItem>
              {usedCategories.map((catId) => {
                const catInfo = resolveCategory(catId, customCategories);
                return (
                  <SelectItem key={catId} value={catId}>
                    {catInfo.icon} {catInfo.name}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
};
