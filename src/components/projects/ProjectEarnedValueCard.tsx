import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TrendingUp, AlertCircle, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCurrency } from '@/contexts/CurrencyContext';
import { calculateProjectHealth, getHealthBgClass } from '@/lib/projectHealthScore';
import { exportEarnedValuePdf } from '@/lib/projectFinancePdfExport';
import { useStatusFeedback } from '@/hooks/useStatusFeedback';
import type { Project } from '@/types/project';
import type { ProjectMilestone } from '@/types/project';
import { cn } from '@/lib/utils';

interface Props {
  project: Project;
  spent: number;
  milestones: ProjectMilestone[];
  onEnterContract: () => void;
}

export const ProjectEarnedValueCard = ({ project, spent, milestones, onEnterContract }: Props) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();

  // Fallback to total_budget matches the hint in ProjectDialog: if contract_value
  // isn't set, total_budget is used as the expected revenue.
  const contractValue = Number(project.contract_value || project.total_budget || 0);
  const hasContract = contractValue > 0;

  const health = useMemo(() => calculateProjectHealth({
    spent,
    budget: project.total_budget || 0,
    contractValue: project.contract_value,
    startDate: project.start_date,
    endDate: project.end_date,
    milestones: milestones as any,
  }), [spent, project.total_budget, project.contract_value, project.start_date, project.end_date, milestones]);

  // Prompt card when contract not set
  if (!hasContract) {
    return (
      <div className="rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
            <AlertCircle className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm mb-1">
              {t('projects.earnedValue.promptTitle', 'Unesite ugovoreni iznos')}
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              {t('projects.earnedValue.promptDesc', 'Bez ugovorenog iznosa ne možemo izračunati maržu, EAC ni rizik gubitka.')}
            </p>
            <Button size="sm" onClick={onEnterContract} className="h-9">
              {t('projects.earnedValue.promptCta', 'Unesi ugovoreni iznos')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const marginAmount = health.marginAmount ?? 0;
  const marginPct = health.marginPct ?? 0;
  const eac = health.eac ?? spent;

  const statusKey: 'healthy' | 'risk' | 'loss' =
    marginPct < 0 ? 'loss' : marginPct < 10 ? 'risk' : 'healthy';
  const statusLabel = t(`projects.earnedValue.status.${statusKey}`,
    statusKey === 'healthy' ? 'Zdravo' : statusKey === 'risk' ? 'Rizik' : 'Gubitak'
  );

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          {t('projects.earnedValue.title', 'Earned Value')}
        </h3>
        <Badge
          variant="outline"
          className={cn('text-[10px] gap-1 h-5 border', getHealthBgClass(health.level))}
        >
          {statusLabel}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <Metric label={t('projects.earnedValue.contracted', 'Ugovoreno')} value={formatAmount(contractValue)} />
        <Metric label={t('projects.earnedValue.spent', 'Trošak')} value={formatAmount(spent)} />
        <Metric
          label={t('projects.earnedValue.marginAmount', 'Marža')}
          value={`${marginAmount >= 0 ? '+' : ''}${formatAmount(marginAmount)}`}
          tone={marginAmount < 0 ? 'destructive' : marginPct < 10 ? 'warning' : 'income'}
        />
        <Metric
          label={t('projects.earnedValue.marginPct', 'Marža %')}
          value={`${marginPct.toFixed(1)}%`}
          tone={marginPct < 0 ? 'destructive' : marginPct < 10 ? 'warning' : 'income'}
        />
        <Metric
          label={t('projects.earnedValue.eac', 'Predviđeni finalni trošak')}
          value={formatAmount(eac)}
          hint={t('projects.earnedValue.eacHint', 'Procjena na temelju trenutnog tempa potrošnje')}
          tone={eac > contractValue ? 'destructive' : 'muted'}
        />
        <Metric
          label={t('projects.earnedValue.scoreLabel', 'Zdravlje')}
          value={`${health.score}/100`}
          tone={health.level === 'critical' ? 'destructive' : health.level === 'at_risk' ? 'warning' : 'income'}
        />
      </div>
    </div>
  );
};

const Metric = ({
  label, value, tone = 'default', hint,
}: {
  label: string;
  value: string;
  tone?: 'default' | 'income' | 'warning' | 'destructive' | 'muted';
  hint?: string;
}) => (
  <div className="min-w-0" title={hint}>
    <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5 truncate">{label}</p>
    <p className={cn(
      'font-semibold tabular-nums truncate',
      tone === 'income' && 'text-income',
      tone === 'warning' && 'text-warning',
      tone === 'destructive' && 'text-destructive',
      tone === 'muted' && 'text-muted-foreground',
    )}>{value}</p>
  </div>
);
