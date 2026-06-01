import { useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { hr } from 'date-fns/locale';
import { useCurrency } from '@/contexts/CurrencyContext';
import type { FamilyActivity } from '@/hooks/useFamilyGroups';

const PAGE_SIZE = 30;

const ACTION_ICONS: Record<string, string> = {
  added_source: '💳',
  removed_source: '🗑️',
  added_budget: '💰',
  removed_budget: '🗑️',
  added_project: '📁',
  removed_project: '🗑️',
  added_savings: '🐖',
  removed_savings: '🗑️',
  invited_member: '✉️',
  member_joined: '👋',
  member_left: '👤',
  expense_added: '💸',
  income_added: '💵',
  transfer_added: '↔️',
};

const TYPE_GROUP: Record<string, 'finance' | 'membership' | 'resources'> = {
  expense_added: 'finance',
  income_added: 'finance',
  transfer_added: 'finance',
  invited_member: 'membership',
  member_joined: 'membership',
  member_left: 'membership',
  added_source: 'resources',
  removed_source: 'resources',
  added_budget: 'resources',
  removed_budget: 'resources',
  added_project: 'resources',
  removed_project: 'resources',
  added_savings: 'resources',
  removed_savings: 'resources',
};

interface Props {
  activities: FamilyActivity[];
  loading: boolean;
  members: { user_id: string; display_name?: string }[];
  limit?: number; // when provided, hide filters/pagination (preview mode)
  showFilters?: boolean;
}

export const FamilyActivityFeed = ({ activities, loading, members, limit, showFilters = true }: Props) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();

  const [memberFilter, setMemberFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'finance' | 'membership' | 'resources'>('all');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Reset pagination when filters change.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [memberFilter, typeFilter]);

  const filtered = useMemo(() => {
    return activities.filter((a) => {
      if (memberFilter !== 'all' && a.user_id !== memberFilter) return false;
      if (typeFilter !== 'all' && TYPE_GROUP[a.action_type] !== typeFilter) return false;
      return true;
    });
  }, [activities, memberFilter, typeFilter]);

  const sliced = limit ? filtered.slice(0, limit) : filtered.slice(0, visibleCount);
  const canLoadMore = !limit && filtered.length > visibleCount;

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {showFilters && !limit && (
        <div className="flex items-center gap-2">
          <Select value={memberFilter} onValueChange={setMemberFilter}>
            <SelectTrigger className="h-8 text-xs flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('family.activityFilters.allMembers')}</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.user_id} value={m.user_id}>
                  {m.display_name || '?'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
            <SelectTrigger className="h-8 text-xs flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('family.activityFilters.allTypes')}</SelectItem>
              <SelectItem value="finance">{t('family.activityFilters.finance')}</SelectItem>
              <SelectItem value="membership">{t('family.activityFilters.membership')}</SelectItem>
              <SelectItem value="resources">{t('family.activityFilters.resources')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {sliced.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">{t('family.noActivity')}</p>
      ) : (
        <div className="space-y-1">
          {sliced.map((activity) => {
            const amountLabel = activity.amount != null
              ? formatAmount(Number(activity.amount), activity.currency as any)
              : null;
            return (
              <div key={activity.id} className="flex items-start gap-2.5 p-2.5 rounded-lg hover:bg-muted/30 transition-colors">
                <span className="text-sm mt-0.5">{ACTION_ICONS[activity.action_type] || '📝'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">
                    <span className="font-medium">{activity.display_name}</span>{' '}
                    <span className="text-muted-foreground">{activity.action_description}</span>
                    {amountLabel && (
                      <span
                        className={
                          activity.action_type === 'expense_added'
                            ? ' text-expense font-medium ml-1'
                            : activity.action_type === 'income_added'
                            ? ' text-income font-medium ml-1'
                            : ' text-muted-foreground font-medium ml-1'
                        }
                      >
                        {activity.action_type === 'expense_added' ? '−' : activity.action_type === 'income_added' ? '+' : '↔'}
                        {amountLabel}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true, locale: hr })}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {canLoadMore && (
        <div className="flex justify-center pt-1">
          <Button variant="ghost" size="sm" onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}>
            {t('family.activityFilters.loadMore')}
          </Button>
        </div>
      )}
    </div>
  );
};
