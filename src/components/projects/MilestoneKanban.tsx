import { ProjectMilestone, MilestoneStatus, MILESTONE_STATUS_LABELS } from '@/types/project';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { AlertTriangle, Pencil, Trash2, Bell, Link2, GripVertical, Shield, FileSignature, Gavel, Ban } from 'lucide-react';
import { getMilestoneDecisionBadge } from '@/lib/milestoneDecisionSource';
import { format, differenceInDays } from 'date-fns';
import { hr } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { useMilestoneRevisions } from '@/hooks/useMilestoneRevisions';
import { MilestoneRevisionTrendBadge } from './MilestoneRevisionTrendBadge';

interface MilestoneKanbanProps {
  milestones: ProjectMilestone[];
  isManager: boolean;
  projectId: string;
  onEdit: (m: ProjectMilestone) => void;
  onDelete: (id: string) => void;
  onStatusChange: (m: ProjectMilestone, status: MilestoneStatus) => void;
  onShowRevisions?: (m: ProjectMilestone) => void;
}

const COLUMNS: { id: MilestoneStatus; bg: string; border: string }[] = [
  { id: 'pending',     bg: 'bg-muted/40',          border: 'border-muted-foreground/20' },
  { id: 'in_progress', bg: 'bg-primary/5',         border: 'border-primary/30' },
  { id: 'completed',   bg: 'bg-income/5',          border: 'border-income/30' },
  { id: 'overdue',     bg: 'bg-destructive/5',     border: 'border-destructive/30' },
];

export const MilestoneKanban = ({ milestones, isManager, projectId, onEdit, onDelete, onStatusChange, onShowRevisions }: MilestoneKanbanProps) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const { getRevisionCount, getRecentTrend } = useMilestoneRevisions(projectId);
  void getRevisionCount; void getRecentTrend; // typescript hush (referenced below)
  const _decisionBadge = getMilestoneDecisionBadge;
  void _decisionBadge;

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, m: ProjectMilestone) => {
    if (!isManager) return;
    e.dataTransfer.setData('text/milestone-id', m.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, status: MilestoneStatus) => {
    e.preventDefault();
    if (!isManager) return;
    const id = e.dataTransfer.getData('text/milestone-id');
    const m = milestones.find(x => x.id === id);
    if (m && m.status !== status) {
      onStatusChange(m, status);
    }
  };

  return (
    <div className="overflow-x-auto -mx-4 px-4 pb-2 scrollbar-hide">
      <div className="flex gap-3 min-w-max">
        {COLUMNS.map((col) => {
          const items = milestones.filter(m => m.status === col.id);
          return (
            <div
              key={col.id}
              className={cn('w-[260px] sm:w-[280px] shrink-0 rounded-xl border', col.bg, col.border)}
              onDragOver={(e) => { if (isManager) e.preventDefault(); }}
              onDrop={(e) => handleDrop(e, col.id)}
            >
              <div className="px-3 py-2.5 border-b border-border/40 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t(`projectMilestoneStatus.${col.id}`, MILESTONE_STATUS_LABELS[col.id])}
                </span>
                <Badge variant="secondary" className="h-5 text-[10px]">{items.length}</Badge>
              </div>

              <div className="p-2 space-y-2 min-h-[120px]">
                {items.length === 0 && (
                  <p className="text-[11px] text-muted-foreground text-center py-4">
                    {t('projects.kanban.empty', 'Nema faza')}
                  </p>
                )}

                {items.map((m) => {
                  const used = m.budget > 0 ? Math.min(((m.spent || 0) / m.budget) * 100, 100) : 0;
                  const isOverBudget = m.budget > 0 && (m.spent || 0) > m.budget;
                  const daysLeft = m.due_date ? differenceInDays(new Date(m.due_date), new Date()) : null;

                  return (
                    <motion.div
                      key={m.id}
                      layout
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      draggable={isManager}
                      onDragStart={(e: any) => handleDragStart(e, m)}
                      className={cn(
                        'group p-2.5 rounded-lg border bg-card text-card-foreground',
                        'hover:shadow-sm transition-shadow cursor-grab active:cursor-grabbing',
                        isOverBudget && 'border-destructive/40'
                      )}
                      style={{ borderLeft: `3px solid ${m.color || '#3b82f6'}` }}
                    >
                      <div className="flex items-start gap-1.5">
                        {isManager && (
                          <GripVertical className="w-3.5 h-3.5 text-muted-foreground/60 mt-0.5 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate flex items-center gap-1">
                            {m.is_contingency && <Shield className="w-3 h-3 text-muted-foreground shrink-0" />}
                            {m.is_vtr && <FileSignature className="w-3 h-3 text-warning shrink-0" />}
                            {m.name}
                            {m.is_vtr && (
                              <Badge variant="outline" className="h-4 px-1 text-[9px] border-warning text-warning ml-0.5">
                                {t('projects.vtr.badge', 'VTR')}
                              </Badge>
                            )}
                          </p>
                          {m.description && (
                            <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{m.description}</p>
                          )}
                        </div>
                      </div>

                      {m.budget > 0 && (
                        <div className="mt-2 space-y-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-medium text-primary">{formatAmount(m.budget)}</span>
                            {(m.spent || 0) > 0 && (
                              <span className={cn(isOverBudget ? 'text-destructive' : 'text-muted-foreground')}>
                                {formatAmount(m.spent || 0)}
                              </span>
                            )}
                          </div>
                          {(m.spent || 0) > 0 && (
                            <Progress value={used} className={cn('h-1', isOverBudget && '[&>div]:bg-destructive')} />
                          )}
                        </div>
                      )}

                      <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          {m.due_date && (
                            <span className={cn(
                              'flex items-center gap-0.5',
                              daysLeft !== null && daysLeft < 0 ? 'text-destructive font-medium' :
                              daysLeft !== null && daysLeft <= 3 ? 'text-warning font-medium' : ''
                            )}>
                              {format(new Date(m.due_date), 'd. MMM', { locale: hr })}
                              {daysLeft !== null && daysLeft < 0 && (
                                <AlertTriangle className="w-3 h-3" />
                              )}
                            </span>
                          )}
                          {m.depends_on_milestone_id && (
                            <Link2 className="w-3 h-3 text-primary" />
                          )}
                          {m.reminder_days_before && m.due_date && (
                            <Bell className="w-3 h-3" />
                          )}
                          <MilestoneRevisionTrendBadge
                            revisionCount={getRevisionCount(m.id)}
                            recentTrend={getRecentTrend(m.id, 30)}
                            isContingency={!!m.is_contingency}
                            contingencyOriginal={m.is_contingency ? m.budget + (m.spent || 0) : undefined}
                            contingencyRemaining={m.is_contingency ? m.budget : undefined}
                            usagePct={!m.is_contingency && m.budget > 0 ? ((m.spent || 0) / m.budget) * 100 : undefined}
                            onClick={(e) => { e.stopPropagation(); onShowRevisions?.(m); }}
                            compact
                          />
                        </div>
                        {isManager && (
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onEdit(m)}>
                              <Pencil className="w-3 h-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => onDelete(m.id)}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
