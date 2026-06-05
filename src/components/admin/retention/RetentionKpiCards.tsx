import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Info } from 'lucide-react';
import {
  weightedRetentionAt,
  weightedActivation,
  type CohortRow,
  type ActivationRow,
} from '@/lib/retentionMath';

interface Props {
  cohorts: CohortRow[];
  activation: ActivationRow[];
}

export const RetentionKpiCards = ({ cohorts, activation }: Props) => {
  const { t } = useTranslation();
  const w1 = weightedRetentionAt(cohorts, 1);
  const w4 = weightedRetentionAt(cohorts, 4);
  const act = weightedActivation(activation);

  const fmtPct = (v: number) => `${v.toFixed(1)}%`;

  const cards = [
    {
      label: t('adminRetention.kpi.w1'),
      value: fmtPct(w1.pct),
      sub: t('adminRetention.kpi.basedOn', { cohorts: w1.cohortsUsed, users: w1.usersTotal }),
      tooltip: t('adminRetention.kpi.w1Tooltip'),
    },
    {
      label: t('adminRetention.kpi.w4'),
      value: fmtPct(w4.pct),
      sub: t('adminRetention.kpi.basedOn', { cohorts: w4.cohortsUsed, users: w4.usersTotal }),
      tooltip: t('adminRetention.kpi.w4Tooltip'),
    },
    {
      label: t('adminRetention.kpi.activation'),
      value: fmtPct(act.activatedPct),
      sub: t('adminRetention.kpi.basedOn', { cohorts: act.cohortsUsed, users: act.usersTotal }),
      tooltip: t('adminRetention.kpi.activationTooltip'),
    },
    {
      label: t('adminRetention.kpi.medianExpenses'),
      value: act.medianExpenses.toFixed(1),
      sub: t('adminRetention.kpi.perActiveUser'),
      tooltip: t('adminRetention.kpi.medianTooltip'),
    },
  ];

  return (
    <TooltipProvider delayDuration={150}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <Card key={c.label} className="p-3">
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs text-muted-foreground">{c.label}</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                    aria-label={t('adminRetention.kpi.infoAria')}
                  >
                    <Info className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[260px] text-xs">
                  {c.tooltip}
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="text-2xl font-bold mt-1 tabular-nums">{c.value}</div>
            <div className="text-[11px] text-muted-foreground mt-1">{c.sub}</div>
          </Card>
        ))}
      </div>
    </TooltipProvider>
  );
};
