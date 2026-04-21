import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useTranslation } from 'react-i18next';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useMilestoneRevisions } from '@/hooks/useMilestoneRevisions';
import { ProjectMilestone } from '@/types/project';
import { MilestoneRevisionType, REVISION_TYPE_META } from '@/types/milestoneRevision';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { Loader2, TrendingUp, TrendingDown, Shield, ArrowRightLeft, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  milestone: ProjectMilestone | null;
  allMilestones: ProjectMilestone[];
}

export const MilestoneRevisionsDialog = ({ open, onOpenChange, projectId, milestone, allMilestones }: Props) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const { revisions, loading } = useMilestoneRevisions(projectId, milestone?.id || null);
  const [filter, setFilter] = useState<MilestoneRevisionType | 'all'>('all');

  const filtered = useMemo(
    () => (filter === 'all' ? revisions : revisions.filter((r) => r.change_type === filter)),
    [revisions, filter]
  );

  const milestoneNameById = useMemo(() => {
    const map = new Map<string, string>();
    allMilestones.forEach((m) => map.set(m.id, m.name));
    return map;
  }, [allMilestones]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            {t('projects.revisions.historyTitle', 'Povijest promjena budžeta')}
          </DialogTitle>
          {milestone && (
            <p className="text-xs text-muted-foreground">{milestone.name}</p>
          )}
        </DialogHeader>

        <div className="space-y-3">
          <ToggleGroup
            type="single"
            value={filter}
            onValueChange={(v) => v && setFilter(v as any)}
            size="sm"
            className="flex-wrap justify-start"
          >
            <ToggleGroupItem value="all" className="h-7 px-2 text-xs">
              {t('common.all', 'Sve')}
            </ToggleGroupItem>
            {(['overrun', 'saving', 'scope_change', 'correction'] as MilestoneRevisionType[]).map((type) => (
              <ToggleGroupItem key={type} value={type} className="h-7 px-2 text-xs">
                {REVISION_TYPE_META[type].emoji} {t(`projects.revisions.types.${type}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              {t('projects.revisions.empty', 'Nema zabilježenih promjena.')}
            </p>
          ) : (
            <div className="space-y-2">
              {filtered.map((rev) => {
                const isIncrease = rev.delta > 0;
                const typeMeta = rev.change_type ? REVISION_TYPE_META[rev.change_type] : null;
                const linkedName = rev.linked_milestone_id ? milestoneNameById.get(rev.linked_milestone_id) : null;

                const CoverageIcon = rev.coverage === 'contingency' ? Shield : rev.coverage === 'transfer' ? ArrowRightLeft : Plus;

                return (
                  <div key={rev.id} className="p-3 rounded-lg border bg-card space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(rev.created_at), 'd. MMM yyyy, HH:mm', { locale: hr })}
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          'gap-1 text-xs',
                          isIncrease ? 'text-destructive border-destructive/40' : 'text-income border-income/40'
                        )}
                      >
                        {isIncrease ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {isIncrease ? '+' : ''}{formatAmount(rev.delta)}
                      </Badge>
                    </div>

                    <div className="text-xs text-muted-foreground">
                      {formatAmount(rev.previous_amount)} → <span className="font-semibold text-foreground">{formatAmount(rev.new_amount)}</span>
                    </div>

                    <p className="text-sm">{rev.reason}</p>

                    <div className="flex items-center gap-2 flex-wrap pt-0.5">
                      {typeMeta && rev.change_type && (
                        <Badge variant="outline" className={cn('text-[10px] h-5', typeMeta.colorClass)}>
                          {typeMeta.emoji} {t(`projects.revisions.types.${rev.change_type}`)}
                        </Badge>
                      )}
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <CoverageIcon className="w-3 h-3" />
                        {t(`projects.revisions.coverageShort.${rev.coverage}`)}
                        {linkedName ? ` — ${linkedName}` : ''}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
