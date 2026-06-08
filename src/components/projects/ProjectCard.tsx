import { Project, ProjectWithOwnership, PROJECT_STATUS_LABELS, PROJECT_ROLE_LABELS } from '@/types/project';
import { Pencil, Trash2, Users, Calendar, Target, Briefcase, Activity, Clock, Archive, ArchiveRestore, MoreVertical } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useCurrency } from '@/contexts/CurrencyContext';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { hr, enUS, de } from 'date-fns/locale';
import { motion } from 'framer-motion';
import { calculateProjectHealth, getHealthBgClass } from '@/lib/projectHealthScore';
import { useMemo, useState } from 'react';
import { clickableProps } from '@/lib/a11y';
import { useProjectWriteGuard } from '@/hooks/useProjectWriteGuard';
import { useProjectAccessLevel, isReadOnlyAccess } from '@/hooks/useProjectAccessLevel';
import { ProjectDeleteDialog } from './ProjectDeleteDialog';

interface ProjectCardProps {
  project: ProjectWithOwnership;
  spent: number;
  income: number;
  memberCount: number;
  milestoneCount: number;
  milestones?: Array<{ status: any; due_date?: string | null }>;
  onEdit: (project: Project) => void;
  onDelete: (id: string) => void;
  onArchive?: (id: string) => void;
  isArchived?: boolean;
  onClick: (project: ProjectWithOwnership) => void;
  onMigrateToBusiness?: (project: ProjectWithOwnership) => void;
  /**
   * Owner-readonly (downgrade): owner action items in dropdown become disabled + toast.
   * When omitted, the card auto-derives read-only state from `project` via useProjectAccessLevel.
   */
  isReadOnly?: boolean;
}

export const ProjectCard = ({
  project,
  spent,
  income,
  memberCount,
  milestoneCount,
  milestones = [],
  onEdit,
  onDelete,
  onArchive,
  isArchived,
  onClick,
  onMigrateToBusiness,
  isReadOnly: isReadOnlyProp
}: ProjectCardProps) => {
  const { formatAmount } = useCurrency();
  const { t, i18n } = useTranslation();
  const [actionsOpen, setActionsOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const dateLocale = i18n.language === 'de' ? de : i18n.language === 'en' ? enUS : hr;
  // Auto-derive access level from project so list views don't have to wire isReadOnly per card.
  const derivedAccessLevel = useProjectAccessLevel(
    project ? { user_id: project.user_id, isParticipant: !project.isOwner } : null
  );
  const isReadOnly = isReadOnlyProp ?? isReadOnlyAccess(derivedAccessLevel);
  const { guard } = useProjectWriteGuard({ isReadOnly });

  const projectColor = project.color || '#3b82f6';
  const projectIcon = project.icon || '📁';
  const budget = project.total_budget || 0;
  const budgetUsed = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
  const remaining = budget - spent;
  const netBalance = income - spent;

  const health = useMemo(() => calculateProjectHealth({
    spent,
    budget,
    contractValue: project.contract_value || project.total_budget,
    startDate: project.start_date,
    endDate: project.end_date,
    milestones: milestones as any,
  }), [spent, budget, project.contract_value, project.start_date, project.end_date, milestones]);

  const healthLabel = t(`projects.health.${health.level}`,
    health.level === 'on_track' ? 'Na vrijeme' :
    health.level === 'at_risk' ? 'Pod rizikom' :
    health.level === 'critical' ? 'Kritično' : 'Nepoznato'
  );

  const remainingDaysLabel = (() => {
    if (health.daysRemaining === null) return null;
    if (health.daysRemaining < 0) {
      return t('projects.health.overdueDays', { count: Math.abs(health.daysRemaining), defaultValue: '{{count}} d kašnjenja' });
    }
    if (health.daysRemaining === 0) return t('projects.health.dueToday', 'Rok danas');
    return t('projects.health.daysLeft', { count: health.daysRemaining, defaultValue: '{{count}} d do roka' });
  })();

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'active': return 'default';
      case 'completed': return 'secondary';
      case 'paused': return 'outline';
      case 'cancelled': return 'destructive';
      default: return 'outline';
    }
  };

  // Worker role: minimal card (icon + name only). No financial data, no actions.
  const isWorkerOnly = !project.isOwner && project.role === 'worker';

  if (isWorkerOnly) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ scale: 1.01 }}
        data-highlight-id={`project:${project.id}`}
        className="relative p-4 rounded-2xl border border-border/50 backdrop-blur-md transition-all duration-300 overflow-hidden"
        style={{
          borderLeftColor: projectColor,
          borderLeftWidth: 3,
          background: `linear-gradient(135deg, ${projectColor}0A 0%, ${projectColor}04 50%, transparent 100%)`,
        }}
      >
        <div
          {...clickableProps(() => onClick(project), {
            label: project.name,
            className: 'flex items-center gap-3 cursor-pointer rounded-xl',
          })}
        >
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0 shadow-sm"
            style={{ background: `linear-gradient(135deg, ${projectColor}25, ${projectColor}15)` }}
          >
            {projectIcon}
          </div>
          <h3 className="font-semibold truncate flex-1 text-[hsl(217_91%_60%)]">{project.name}</h3>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ 
        scale: 1.01,
        boxShadow: `0 4px 20px ${projectColor}18`
      }}
      data-highlight-id={`project:${project.id}`}
      className="relative group p-4 rounded-2xl border border-border/50 backdrop-blur-md transition-all duration-300 overflow-hidden"
      style={{ 
        borderLeftColor: projectColor, 
        borderLeftWidth: 3,
        background: `linear-gradient(135deg, ${projectColor}0A 0%, ${projectColor}04 50%, transparent 100%)`,
        boxShadow: `0 2px 12px ${projectColor}08`,
      }}
    >
      {/* Subtle radial glow */}
      <div
        className="absolute -top-8 -right-8 w-24 h-24 rounded-full opacity-[0.07] group-hover:opacity-[0.12] transition-opacity duration-300 pointer-events-none"
        style={{ background: `radial-gradient(circle, ${projectColor} 0%, transparent 70%)` }}
      />

      <div
        {...clickableProps(() => onClick(project), {
          label: project.name,
          className: "flex items-start gap-3 cursor-pointer rounded-xl pr-10",
        })}
      >
        {/* Icon */}
        <div 
          className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0 shadow-sm"
          style={{ background: `linear-gradient(135deg, ${projectColor}25, ${projectColor}15)` }}
        >
          {projectIcon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="font-semibold truncate text-[hsl(217_91%_60%)]">{project.name}</h3>
            <Badge variant={getStatusBadgeVariant(project.status)} className="text-xs">
              {t(`projectStatus.${project.status}`, PROJECT_STATUS_LABELS[project.status])}
            </Badge>
            {health.level !== 'unknown' && (
              <Badge
                variant="outline"
                className={cn("text-[10px] gap-1 h-5 border", getHealthBgClass(health.level))}
                title={`${t('projects.health.score', 'Stanje projekta')}: ${health.score}/100`}
              >
                <Activity className="w-2.5 h-2.5" />
                {healthLabel} · {health.score}
              </Badge>
            )}
          </div>

          {project.description && (
            <p className="text-sm text-muted-foreground truncate mb-2">{project.description}</p>
          )}

          {/* Budget progress */}
          {budget > 0 && (
            <div className="mb-3">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-muted-foreground">{t('projects.budgetUsed')}</span>
                <span className={cn(
                  "font-medium",
                  budgetUsed >= 90 ? "text-destructive" : budgetUsed >= 70 ? "text-warning" : "text-muted-foreground"
                )}>
                  {budgetUsed.toFixed(0)}%
                </span>
              </div>
              <Progress 
                value={budgetUsed} 
                className="h-2"
              />
              <div className="flex items-center justify-between text-xs mt-1">
                <span className="text-muted-foreground">
                  {formatAmount(spent)} / {formatAmount(budget)}
                </span>
                <span className={cn(
                  "font-medium",
                  remaining < 0 ? "text-destructive" : "text-income"
                )}>
                  {remaining >= 0 ? '+' : ''}{formatAmount(remaining)} {t('projects.remaining')}
                </span>
              </div>
            </div>
          )}

          {/* Income/Expense summary when no budget */}
          {budget === 0 && (income > 0 || spent > 0) && (
            <div className="mb-3 flex items-center gap-4 text-sm">
              {income > 0 && (
                <span className="text-income font-medium">+{formatAmount(income)}</span>
              )}
              {spent > 0 && (
                <span className="text-expense font-medium">-{formatAmount(spent)}</span>
              )}
              <span className={cn(
                "font-medium",
                netBalance >= 0 ? "text-income" : "text-destructive"
              )}>
                = {netBalance >= 0 ? '+' : ''}{formatAmount(netBalance)}
              </span>
            </div>
          )}

          {/* Show income if budget exists and income > 0 */}
          {budget > 0 && income > 0 && (
            <div className="mb-2 text-xs text-income font-medium">
              {t('projects.incomeReceived', 'Primljeno')}: +{formatAmount(income)}
            </div>
          )}

          {/* Meta info */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
            {project.start_date && (
              <div className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {format(new Date(project.start_date), 'd. MMM yyyy', { locale: dateLocale })}
              </div>
            )}
            {remainingDaysLabel && (
              <div className={cn(
                "flex items-center gap-1 font-medium",
                health.daysRemaining !== null && health.daysRemaining < 0 ? "text-destructive" :
                health.daysRemaining !== null && health.daysRemaining <= 7 ? "text-warning" : ""
              )}>
                <Clock className="w-3 h-3" />
                {remainingDaysLabel}
              </div>
            )}
            <div className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              {memberCount}
            </div>
            <div className="flex items-center gap-1">
              <Target className="w-3 h-3" />
              {milestoneCount} {t('projects.milestones')}
            </div>
            {!project.isOwner && (
              <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-muted-foreground border-border/50">
                {t(`projectRoles.${project.role}`, PROJECT_ROLE_LABELS[project.role])}
              </Badge>
            )}
          </div>

          {/* Timeline progress (only when there's a deadline) */}
          {health.timeProgressPct !== null && budget > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 h-1 rounded-full bg-muted/50 overflow-hidden">
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${Math.min(100, health.timeProgressPct)}%`,
                    backgroundColor: health.daysRemaining !== null && health.daysRemaining < 0
                      ? 'hsl(var(--destructive))'
                      : projectColor + '99'
                  }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground">
                {Math.round(health.timeProgressPct)}% {t('projects.health.timeUsed', 'vremena')}
              </span>
            </div>
          )}
        </div>

      </div>

      {/* Actions - sibling of clickable content so menu clicks never open the project */}
      {project.isOwner && (
        <div
          className="absolute top-2 right-2 z-10"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <DropdownMenu open={actionsOpen} onOpenChange={setActionsOpen}>
            <DropdownMenuTrigger
              asChild
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11"
                aria-label={t('common.actions', 'Akcije')}
                aria-expanded={actionsOpen}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setActionsOpen((open) => !open);
                }}
              >
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-[70]" onCloseAutoFocus={(e) => e.preventDefault()}>
              <DropdownMenuItem
                disabled={isReadOnly}
                onSelect={(e) => {
                  e.preventDefault();
                  setActionsOpen(false);
                  if (!guard()) return;
                  onEdit(project);
                }}
              >
                <Pencil className="w-4 h-4 mr-2" />
                {t('common.edit', 'Uredi')}
              </DropdownMenuItem>
              {onMigrateToBusiness && !project.business_profile_id && (
                <DropdownMenuItem
                  disabled={isReadOnly}
                  onSelect={(e) => {
                    e.preventDefault();
                    setActionsOpen(false);
                    if (!guard()) return;
                    onMigrateToBusiness(project);
                  }}
                >
                  <Briefcase className="w-4 h-4 mr-2" />
                  {t('projects.migrateToBusiness', 'Premjesti u poslovni mod')}
                </DropdownMenuItem>
              )}
              {onArchive && (
                <DropdownMenuItem
                  disabled={isReadOnly}
                  onSelect={(e) => {
                    e.preventDefault();
                    setActionsOpen(false);
                    if (!guard()) return;
                    onArchive(project.id);
                  }}
                >
                  {isArchived ? (
                    <ArchiveRestore className="w-4 h-4 mr-2" />
                  ) : (
                    <Archive className="w-4 h-4 mr-2" />
                  )}
                  {isArchived
                    ? t('projects.unarchive', 'Vrati iz arhive')
                    : t('projects.archive', 'Arhiviraj')}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={isReadOnly}
                className="text-destructive focus:text-destructive"
                onSelect={(e) => {
                  e.preventDefault();
                  setActionsOpen(false);
                  if (!guard()) return;
                  setDeleteDialogOpen(true);
                }}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {isArchived
                  ? t('projects.menu.deletePermanently', 'Obriši trajno')
                  : t('projects.menu.delete', 'Obriši projekt…')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <ProjectDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        isArchived={!!isArchived}
        onArchive={onArchive ? () => onArchive(project.id) : undefined}
        onDelete={() => onDelete(project.id)}
      />
    </motion.div>
  );
};
