import { Project, ProjectWithOwnership, PROJECT_STATUS_LABELS, PROJECT_ROLE_LABELS } from '@/types/project';
import { Pencil, Trash2, Users, Calendar, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useCurrency } from '@/contexts/CurrencyContext';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { motion } from 'framer-motion';

interface ProjectCardProps {
  project: ProjectWithOwnership;
  spent: number;
  memberCount: number;
  milestoneCount: number;
  onEdit: (project: Project) => void;
  onDelete: (id: string) => void;
  onClick: (project: ProjectWithOwnership) => void;
}

export const ProjectCard = ({
  project,
  spent,
  memberCount,
  milestoneCount,
  onEdit,
  onDelete,
  onClick
}: ProjectCardProps) => {
  const { formatAmount } = useCurrency();
  const { t } = useTranslation();

  const projectColor = project.color || '#3b82f6';
  const projectIcon = project.icon || '📁';
  const budget = project.total_budget || 0;
  const budgetUsed = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
  const remaining = budget - spent;

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'active': return 'default';
      case 'completed': return 'secondary';
      case 'paused': return 'outline';
      case 'cancelled': return 'destructive';
      default: return 'outline';
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ 
        scale: 1.01,
        boxShadow: `0 8px 25px -5px ${projectColor}30`
      }}
      className="relative group p-4 rounded-xl border bg-card cursor-pointer transition-colors"
      style={{ borderLeftColor: projectColor, borderLeftWidth: 4 }}
      onClick={() => onClick(project)}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div 
          className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
          style={{ backgroundColor: `${projectColor}20` }}
        >
          {projectIcon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold truncate">{project.name}</h3>
            <Badge variant={getStatusBadgeVariant(project.status)} className="text-xs">
              {PROJECT_STATUS_LABELS[project.status]}
            </Badge>
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

          {/* Meta info */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {project.start_date && (
              <div className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {format(new Date(project.start_date), 'd. MMM yyyy', { locale: hr })}
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
              <Badge variant="secondary" className="text-xs">
                {PROJECT_ROLE_LABELS[project.role]}
              </Badge>
            )}
          </div>
        </div>

        {/* Actions - Only show for owners */}
        {project.isOwner && (
          <div className={cn(
            "flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity",
            "absolute top-2 right-2"
          )}>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(project);
              }}
            >
              <Pencil className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(project.id);
              }}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </motion.div>
  );
};
