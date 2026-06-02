import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, X, CalendarIcon, Filter, Users, CreditCard, FolderKanban, User, Tag, Landmark, Wallet } from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { hr, enUS, de } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { DateRange } from 'react-day-picker';
import { PaymentSourceCard, CustomPaymentSource } from '@/types/customPaymentSource';
import { useTranslation } from 'react-i18next';
import { CATEGORIES, INCOME_CATEGORIES, getCategoryInfo } from '@/types/expense';
import { useCustomCategories } from '@/hooks/useCustomCategories';

export interface MemberOption {
  userId: string;
  displayName: string;
}

export type TransactionScope = 'all' | 'personal' | 'project';

export interface FilterState {
  searchTerm: string;
  dateRange: DateRange | undefined;
  minAmount: number | undefined;
  maxAmount: number | undefined;
  memberId: string | undefined;
  cardId: string | undefined;
  categoryId: string | undefined;
  scope: TransactionScope;
  bankMatchStatus: string | undefined;
  paymentSource: string | undefined;
}

interface TransactionFiltersProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  showAmountFilter?: boolean;
  showMemberFilter?: boolean;
  showCardFilter?: boolean;
  showScopeFilter?: boolean;
  showPaymentSourceFilter?: boolean;
  members?: MemberOption[];
  cards?: PaymentSourceCard[];
  paymentSources?: CustomPaymentSource[];
  className?: string;
}

export const TransactionFilters = ({
  filters,
  onFiltersChange,
  showAmountFilter = true,
  showMemberFilter = false,
  showCardFilter = false,
  showScopeFilter = false,
  showPaymentSourceFilter = false,
  members = [],
  cards = [],
  paymentSources = [],
  className,
}: TransactionFiltersProps) => {
  const { t, i18n } = useTranslation();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const { customCategories } = useCustomCategories();

  // Build combined category list: default + custom
  const allCategories = [
    ...CATEGORIES.map(c => ({ id: c.id, name: c.name, icon: c.icon })),
    ...INCOME_CATEGORIES.map(c => ({ id: c.id, name: c.name, icon: c.icon })),
    ...customCategories.map(c => ({ id: c.id, name: c.name, icon: c.icon })),
  ];

  const dateLocale = i18n.language === 'de' ? de : i18n.language === 'en' ? enUS : hr;

  const presetRanges = [
    {
      label: t('filters.thisMonth'),
      getValue: () => ({
        from: startOfMonth(new Date()),
        to: endOfMonth(new Date()),
      }),
    },
    {
      label: t('filters.lastMonth'),
      getValue: () => ({
        from: startOfMonth(subMonths(new Date(), 1)),
        to: endOfMonth(subMonths(new Date(), 1)),
      }),
    },
    {
      label: t('filters.last3Months'),
      getValue: () => ({
        from: startOfMonth(subMonths(new Date(), 2)),
        to: endOfMonth(new Date()),
      }),
    },
  ];

  const hasActiveFilters =
    filters.searchTerm ||
    filters.dateRange?.from ||
    filters.minAmount !== undefined ||
    filters.maxAmount !== undefined ||
    filters.memberId !== undefined ||
    filters.cardId !== undefined ||
    filters.categoryId !== undefined ||
    filters.scope !== 'all' ||
    filters.bankMatchStatus !== undefined;

  const clearFilters = () => {
    onFiltersChange({
      searchTerm: '',
      dateRange: undefined,
      minAmount: undefined,
      maxAmount: undefined,
      memberId: undefined,
      cardId: undefined,
      categoryId: undefined,
      scope: 'all',
      bankMatchStatus: undefined,
    });
  };

  const updateFilter = (key: keyof FilterState, value: any) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  return (
    <div className={cn('space-y-2', className)}>
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder={t('transactions.searchByName')}
          value={filters.searchTerm}
          onChange={(e) => updateFilter('searchTerm', e.target.value)}
          className="pl-9 pr-9 h-9 text-sm"
        />
        {filters.searchTerm && (
          <button
            onClick={() => updateFilter('searchTerm', '')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Filter Toggle & Quick Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-8 text-xs gap-1.5',
            showAdvanced && 'bg-primary/10 border-primary'
          )}
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          <Filter className="w-3.5 h-3.5" />
          {t('filters.filters')}
          {hasActiveFilters && (
            <span className="w-2 h-2 rounded-full bg-primary" />
          )}
        </Button>

        {/* Scope Filter Buttons */}
        {showScopeFilter && (
          <div className="flex items-center rounded-lg border bg-muted/30 p-0.5">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-7 text-xs px-2.5 rounded-md',
                filters.scope === 'all' && 'bg-background shadow-sm'
              )}
              onClick={() => updateFilter('scope', 'all')}
            >
              {t('filters.all')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-7 text-xs px-2.5 rounded-md gap-1',
                filters.scope === 'personal' && 'bg-background shadow-sm'
              )}
              onClick={() => updateFilter('scope', 'personal')}
            >
              <User className="w-3 h-3" />
              {t('filters.personal')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-7 text-xs px-2.5 rounded-md gap-1',
                filters.scope === 'project' && 'bg-background shadow-sm'
              )}
              onClick={() => updateFilter('scope', 'project')}
            >
              <FolderKanban className="w-3 h-3" />
              {t('filters.projects')}
            </Button>
          </div>
        )}

        {/* Preset Date Buttons */}
        {presetRanges.map((preset) => (
          <Button
            key={preset.label}
            variant="ghost"
            size="sm"
            className={cn(
              'h-8 text-xs px-2 hidden sm:flex',
              filters.dateRange?.from?.getTime() === preset.getValue().from.getTime() &&
                'bg-primary/10 text-primary'
            )}
            onClick={() => updateFilter('dateRange', preset.getValue())}
          >
            {preset.label}
          </Button>
        ))}

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs px-2 text-muted-foreground hover:text-destructive"
            onClick={clearFilters}
          >
            <X className="w-3 h-3 mr-1" />
            {t('filters.clear')}
          </Button>
        )}
      </div>

      {/* Advanced Filters */}
      {showAdvanced && (
        <div className="flex flex-wrap gap-2 p-3 rounded-lg bg-muted/50 border">
          {/* Date Range */}
          <Popover open={dateOpen} onOpenChange={setDateOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  'h-8 text-xs gap-1.5 justify-start',
                  filters.dateRange?.from && 'bg-primary/10 border-primary'
                )}
              >
                <CalendarIcon className="w-3.5 h-3.5" />
                {filters.dateRange?.from ? (
                  filters.dateRange?.to ? (
                    <>
                      {format(filters.dateRange.from, 'dd.MM.yy', { locale: dateLocale })} -{' '}
                      {format(filters.dateRange.to, 'dd.MM.yy', { locale: dateLocale })}
                    </>
                  ) : (
                    format(filters.dateRange.from, 'dd.MM.yyyy', { locale: dateLocale })
                  )
                ) : (
                  t('filters.selectPeriod')
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                selected={filters.dateRange}
                onSelect={(range) => {
                  updateFilter('dateRange', range);
                  if (range?.from && range?.to) setDateOpen(false);
                }}
                numberOfMonths={1}
                locale={dateLocale}
                initialFocus
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>

          {/* Amount Range */}
          {showAmountFilter && (
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                placeholder="Min €"
                value={filters.minAmount ?? ''}
                onChange={(e) =>
                  updateFilter(
                    'minAmount',
                    e.target.value ? parseFloat(e.target.value) : undefined
                  )
                }
                className="w-20 h-8 text-xs"
              />
              <span className="text-muted-foreground text-xs">-</span>
              <Input
                type="number"
                placeholder="Max €"
                value={filters.maxAmount ?? ''}
                onChange={(e) =>
                  updateFilter(
                    'maxAmount',
                    e.target.value ? parseFloat(e.target.value) : undefined
                  )
                }
                className="w-20 h-8 text-xs"
              />
            </div>
          )}

          {/* Member Filter */}
          {showMemberFilter && members.length > 0 && (
            <Select
              value={filters.memberId || 'all'}
              onValueChange={(value) => updateFilter('memberId', value === 'all' ? undefined : value)}
            >
              <SelectTrigger className="w-[160px] h-8 text-xs">
                <Users className="w-3.5 h-3.5 mr-1.5" />
                <SelectValue placeholder={t('filters.allMembers')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('filters.allMembers')}</SelectItem>
                {members.map((member) => (
                  <SelectItem key={member.userId} value={member.userId}>
                    {member.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Card Filter */}
          {showCardFilter && cards.length > 0 && (
            <Select
              value={filters.cardId || 'all'}
              onValueChange={(value) => updateFilter('cardId', value === 'all' ? undefined : value)}
            >
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <CreditCard className="w-3.5 h-3.5 mr-1.5" />
                <SelectValue placeholder={t('filters.allCards')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('filters.allCards')}</SelectItem>
                {cards.map((card) => (
                  <SelectItem key={card.id} value={card.id}>
                    {card.card_name} (•••• {card.last_four_digits})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Category Filter */}
          <Select
            value={filters.categoryId || 'all'}
            onValueChange={(value) => updateFilter('categoryId', value === 'all' ? undefined : value)}
          >
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <Tag className="w-3.5 h-3.5 mr-1.5" />
              <SelectValue placeholder={t('filters.allCategories', 'Sve kategorije')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filters.allCategories', 'Sve kategorije')}</SelectItem>
              {allCategories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.icon} {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Bank Match Status Filter */}
          <Select
            value={filters.bankMatchStatus || 'all'}
            onValueChange={(value) => updateFilter('bankMatchStatus', value === 'all' ? undefined : value)}
          >
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <Landmark className="w-3.5 h-3.5 mr-1.5" />
              <SelectValue placeholder={t('filters.allBankMatchStatuses', 'Svi statusi')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filters.allBankMatchStatuses', 'Svi statusi')}</SelectItem>
              <SelectItem value="manual">{t('bankMatch.manual', 'Ručni unos')}</SelectItem>
              <SelectItem value="pending_bank">{t('bankMatch.pendingBank', 'Čeka potvrdu banke')}</SelectItem>
              <SelectItem value="confirmed">{t('bankMatch.confirmed', 'Potvrđeno bankom')}</SelectItem>
              <SelectItem value="bank_only">{t('bankMatch.bankOnly', 'Iz izvoda')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
};

// Helper function to apply filters to expenses
export const applyFilters = <T extends { description: string; date: Date; amount: number; merchant_name?: string | null; user_id?: string; submitted_by?: string | null; payment_source_card_id?: string | null; project_id?: string | null; category?: string; bank_match_status?: string | null }>(
  items: T[],
  filters: FilterState,
  currentUserId?: string
): T[] => {
  return items.filter((item) => {
    if (filters.scope !== 'all') {
      if (filters.scope === 'personal') {
        if (item.project_id) return false;
      } else if (filters.scope === 'project') {
        if (!item.project_id) return false;
        if (currentUserId && item.user_id !== currentUserId) return false;
      }
    }

    if (filters.searchTerm) {
      const search = filters.searchTerm.toLowerCase().trim();
      const matchesDescription = item.description.toLowerCase().includes(search);
      const matchesMerchant = item.merchant_name?.toLowerCase().includes(search);
      const searchNum = parseFloat(search);
      const matchesAmount = !isNaN(searchNum) && item.amount.toString().includes(search);
      if (!matchesDescription && !matchesMerchant && !matchesAmount) return false;
    }

    if (filters.dateRange?.from) {
      const itemDate = new Date(item.date);
      itemDate.setHours(0, 0, 0, 0);
      
      const from = new Date(filters.dateRange.from);
      from.setHours(0, 0, 0, 0);
      
      if (itemDate < from) return false;
      
      if (filters.dateRange.to) {
        const to = new Date(filters.dateRange.to);
        to.setHours(23, 59, 59, 999);
        if (itemDate > to) return false;
      }
    }

    if (filters.minAmount !== undefined && item.amount < filters.minAmount) return false;
    if (filters.maxAmount !== undefined && item.amount > filters.maxAmount) return false;

    if (filters.memberId !== undefined) {
      const transactionMemberId = item.submitted_by || item.user_id;
      if (transactionMemberId !== filters.memberId) return false;
    }

    if (filters.cardId !== undefined) {
      if (item.payment_source_card_id !== filters.cardId) return false;
    }

    if (filters.categoryId !== undefined) {
      if (item.category !== filters.categoryId) return false;
    }

    if (filters.bankMatchStatus !== undefined) {
      const itemStatus = item.bank_match_status || 'manual';
      if (itemStatus !== filters.bankMatchStatus) return false;
    }

    return true;
  });
};

// Default filter state
export const defaultFilters: FilterState = {
  searchTerm: '',
  dateRange: undefined,
  minAmount: undefined,
  maxAmount: undefined,
  memberId: undefined,
  cardId: undefined,
  categoryId: undefined,
  scope: 'all',
  bankMatchStatus: undefined,
};
