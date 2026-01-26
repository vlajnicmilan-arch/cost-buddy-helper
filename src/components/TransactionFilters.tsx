import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, X, CalendarIcon, Filter, Users, CreditCard, FolderKanban, User } from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { hr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { DateRange } from 'react-day-picker';
import { PaymentSourceCard } from '@/types/customPaymentSource';

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
  scope: TransactionScope;
}

interface TransactionFiltersProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  showAmountFilter?: boolean;
  showMemberFilter?: boolean;
  showCardFilter?: boolean;
  showScopeFilter?: boolean;
  members?: MemberOption[];
  cards?: PaymentSourceCard[];
  className?: string;
}

const presetRanges = [
  {
    label: 'Ovaj mjesec',
    getValue: () => ({
      from: startOfMonth(new Date()),
      to: endOfMonth(new Date()),
    }),
  },
  {
    label: 'Prošli mjesec',
    getValue: () => ({
      from: startOfMonth(subMonths(new Date(), 1)),
      to: endOfMonth(subMonths(new Date(), 1)),
    }),
  },
  {
    label: 'Zadnja 3 mjeseca',
    getValue: () => ({
      from: startOfMonth(subMonths(new Date(), 2)),
      to: endOfMonth(new Date()),
    }),
  },
];

export const TransactionFilters = ({
  filters,
  onFiltersChange,
  showAmountFilter = true,
  showMemberFilter = false,
  showCardFilter = false,
  showScopeFilter = false,
  members = [],
  cards = [],
  className,
}: TransactionFiltersProps) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const hasActiveFilters =
    filters.searchTerm ||
    filters.dateRange?.from ||
    filters.minAmount !== undefined ||
    filters.maxAmount !== undefined ||
    filters.memberId !== undefined ||
    filters.cardId !== undefined ||
    filters.scope !== 'all';

  const clearFilters = () => {
    onFiltersChange({
      searchTerm: '',
      dateRange: undefined,
      minAmount: undefined,
      maxAmount: undefined,
      memberId: undefined,
      cardId: undefined,
      scope: 'all',
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
          placeholder="Pretraži po nazivu..."
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
          Filteri
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
              Sve
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
              Osobno
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
              Projekti
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
            Očisti
          </Button>
        )}
      </div>

      {/* Advanced Filters */}
      {showAdvanced && (
        <div className="flex flex-wrap gap-2 p-3 rounded-lg bg-muted/50 border">
          {/* Date Range */}
          <Popover>
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
                      {format(filters.dateRange.from, 'dd.MM.yy', { locale: hr })} -{' '}
                      {format(filters.dateRange.to, 'dd.MM.yy', { locale: hr })}
                    </>
                  ) : (
                    format(filters.dateRange.from, 'dd.MM.yyyy', { locale: hr })
                  )
                ) : (
                  'Odaberi period'
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                selected={filters.dateRange}
                onSelect={(range) => updateFilter('dateRange', range)}
                numberOfMonths={1}
                locale={hr}
                initialFocus
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
                <SelectValue placeholder="Svi članovi" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Svi članovi</SelectItem>
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
                <SelectValue placeholder="Sve kartice" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Sve kartice</SelectItem>
                {cards.map((card) => (
                  <SelectItem key={card.id} value={card.id}>
                    {card.card_name} (•••• {card.last_four_digits})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}
    </div>
  );
};

// Helper function to apply filters to expenses
export const applyFilters = <T extends { description: string; date: Date; amount: number; merchant_name?: string | null; user_id?: string; submitted_by?: string | null; payment_source_card_id?: string | null; project_id?: string | null }>(
  items: T[],
  filters: FilterState,
  currentUserId?: string
): T[] => {
  return items.filter((item) => {
    // Scope filter
    if (filters.scope !== 'all') {
      if (filters.scope === 'personal') {
        // Personal = no project_id AND (user owns it or no project association)
        if (item.project_id) return false;
      } else if (filters.scope === 'project') {
        // Project = has project_id AND user is owner
        if (!item.project_id) return false;
        // Only show project transactions that belong to the current user
        if (currentUserId && item.user_id !== currentUserId) return false;
      }
    }

    // Search filter
    if (filters.searchTerm) {
      const search = filters.searchTerm.toLowerCase();
      const matchesDescription = item.description.toLowerCase().includes(search);
      const matchesMerchant = item.merchant_name?.toLowerCase().includes(search);
      if (!matchesDescription && !matchesMerchant) return false;
    }

    // Date range filter
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

    // Min amount filter
    if (filters.minAmount !== undefined && item.amount < filters.minAmount) {
      return false;
    }

    // Max amount filter
    if (filters.maxAmount !== undefined && item.amount > filters.maxAmount) {
      return false;
    }

    // Member filter
    if (filters.memberId !== undefined) {
      const transactionMemberId = item.submitted_by || item.user_id;
      if (transactionMemberId !== filters.memberId) return false;
    }

    // Card filter
    if (filters.cardId !== undefined) {
      if (item.payment_source_card_id !== filters.cardId) return false;
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
  scope: 'all',
};
