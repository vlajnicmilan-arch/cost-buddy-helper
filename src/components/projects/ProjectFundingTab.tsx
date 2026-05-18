import { ProjectFunding, ProjectMilestone } from '@/types/project';
import { ProjectIncomeSource } from '@/hooks/useProjectFunding';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useTranslation } from 'react-i18next';
import { Wallet, Loader2, TrendingUp, TrendingDown, PiggyBank, CheckCircle2, Clock, FileText } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useProjectEstimates } from '@/hooks/useProjectEstimates';
import { useProjectInvoices } from '@/hooks/useProjectInvoices';
import { ProjectEstimatesPanel } from './ProjectEstimatesPanel';
import { ProjectInvoicesPanel } from './ProjectInvoicesPanel';

interface ProjectFundingTabProps {
  projectId: string;
  funding: ProjectFunding[];
  incomeSources: ProjectIncomeSource[];
  milestones: ProjectMilestone[];
  totalAllocated: number;
  totalSpent?: number;
  projectBudget: number;
  isManager: boolean;
  loading: boolean;
  onRefetch: () => void;
}

export const ProjectFundingTab = ({
  projectId,
  funding,
  incomeSources,
  milestones,
  totalAllocated,
  totalSpent = 0,
  projectBudget,
  isManager,
  loading,
  onRefetch
}: ProjectFundingTabProps) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const { estimates: allEstimates } = useProjectEstimates();
  const { invoices: allInvoices } = useProjectInvoices();
  const projectEstimates = allEstimates.filter(e => e.accepted_project_id === projectId);
  const projectInvoices = allInvoices.filter(i => i.project_id === projectId);


  const completedMilestones = milestones.filter(m => m.status === 'completed');
  
  // Pending milestones (in progress or pending)
  const pendingMilestones = milestones.filter(m => m.status === 'in_progress' || m.status === 'pending');
  const reservedForPending = pendingMilestones.reduce((sum, m) => sum + (m.budget || 0), 0);

  const hasAnySource = funding.length > 0 || incomeSources.length > 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totalIncome = incomeSources.reduce((sum, inc) => sum + inc.amount, 0);
  const remaining = totalAllocated - totalSpent;

  return (
    <div className="space-y-6">
      {/* Compact money summary */}
      <div className="grid grid-cols-3 gap-2 p-3 rounded-lg border bg-card">
        <div className="text-center">
          <p className="text-[10px] sm:text-xs text-muted-foreground mb-0.5">{t('projects.funding.summaryAllocated', 'Alocirano')}</p>
          <p className="text-sm sm:text-base font-semibold tabular-nums truncate">{formatAmount(totalAllocated)}</p>
        </div>
        <div className="text-center border-x border-border/50">
          <p className="text-[10px] sm:text-xs text-muted-foreground mb-0.5">{t('projects.funding.summaryIncome', 'Primljeno')}</p>
          <p className="text-sm sm:text-base font-semibold tabular-nums truncate text-income">{formatAmount(totalIncome)}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] sm:text-xs text-muted-foreground mb-0.5">{t('projects.funding.summaryRemaining', 'Preostalo')}</p>
          <p className={cn(
            "text-sm sm:text-base font-semibold tabular-nums truncate",
            remaining < 0 ? "text-destructive" : "text-foreground"
          )}>{formatAmount(remaining)}</p>
        </div>
      </div>

      {/* Reserved for pending milestones */}
      {reservedForPending > 0 && (
        <div className="flex items-center justify-between text-sm p-3 rounded-lg bg-warning/10 border border-warning/20">
          <span className="flex items-center gap-2 text-muted-foreground">
            <Clock className="w-4 h-4" />
            {t('projects.reservedForPending', 'Rezervirano za aktivne faze')}:
          </span>
          <span className="font-medium">{formatAmount(reservedForPending)}</span>
        </div>
      )}

      {/* Completed milestones breakdown */}
      {completedMilestones.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-income" />
            {t('projects.completedMilestones', 'Završene faze')} ({completedMilestones.length})
          </h4>
          {completedMilestones.map((m) => (
            <div 
              key={m.id}
              className="p-3 rounded-lg border bg-income/5 border-income/20 flex items-center gap-3"
            >
              <CheckCircle2 className="w-5 h-5 text-income shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{m.name}</p>
                {m.completed_at && (
                  <p className="text-xs text-muted-foreground">
                    {t('projects.completedOn', 'Završeno')}: {format(new Date(m.completed_at), 'd. MMM yyyy', { locale: hr })}
                  </p>
                )}
              </div>
              <p className="text-lg font-semibold tabular-nums">
                {formatAmount(m.budget || 0)}
              </p>
              <p className="text-[10px] text-muted-foreground sr-only">{t('projects.funding.plannedCost', 'Planirani trošak')}</p>
            </div>
          ))}
        </div>
      )}

      {/* Sources list */}
      {!hasAnySource ? (
        <div className="text-center py-8 text-muted-foreground">
          <Wallet className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>{t('projects.noFunding')}</p>
          <p className="text-sm">{t('projects.noFundingHint')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Project income transactions (e.g., advances from clients) */}
          {incomeSources.length > 0 && (
            <>
              <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                {t('projects.projectIncome', 'Prihodi projekta')}
              </h4>
              {incomeSources.map((inc) => (
                <div 
                  key={inc.id}
                  className="p-4 rounded-lg border bg-card flex items-center gap-3"
                >
                  <div 
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-xl shrink-0 bg-income/20"
                  >
                    💵
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{inc.description}</p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(inc.date), 'd. MMM yyyy', { locale: hr })}
                    </p>
                  </div>
                  
                  <p className="text-lg font-semibold text-income">
                    +{formatAmount(inc.amount)}
                  </p>
                </div>
              ))}
            </>
          )}

          {/* Linked income sources from project_funding table */}
          {funding.length > 0 && (
            <>
              <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2 mt-4">
                <Wallet className="w-4 h-4" />
                {t('projects.linkedSources', 'Povezani izvori')}
              </h4>
              {funding.map((f) => (
                <div 
                  key={f.id}
                  className="p-4 rounded-lg border bg-card flex items-center gap-3"
                >
                  <div 
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-xl shrink-0"
                    style={{ backgroundColor: `${f.income_source_color}20` }}
                  >
                    {f.income_source_icon || '💰'}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{f.income_source_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatAmount(f.allocated_amount)}
                      {f.percentage && ` (${f.percentage}%)`}
                    </p>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Estimates linked to this project */}
      {projectEstimates.length > 0 && (
        <div className="space-y-2 pt-2">
          <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <FileText className="w-4 h-4" />
            {t('estimates.forProject', 'Ponude za ovaj projekt')} ({projectEstimates.length})
          </h4>
          <ProjectEstimatesPanel projectId={projectId} compact />
        </div>
      )}
    </div>
  );
};
