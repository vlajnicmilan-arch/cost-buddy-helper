import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { useCurrency } from '@/contexts/CurrencyContext';
import { cn } from '@/lib/utils';
import type { ProjectMilestone } from '@/types/project';
import { getHealthLevel, type CostBaseline, type RemainderLevel } from '@/lib/projectCostBaseline';

interface Props {
  /** Osnovica iz getCostBaseline — nikad sirovi ugovoreni iznos. */
  baseline: CostBaseline;
  spent: number;
  milestones: ProjectMilestone[];
}

type MarginStatus = RemainderLevel;

const statusDot: Record<MarginStatus, string> = {
  healthy: 'bg-income',
  attention: 'bg-warning',
  critical: 'bg-destructive',
  neutral: 'bg-muted-foreground',
};

const statusText: Record<MarginStatus, string> = {
  healthy: 'text-income',
  attention: 'text-warning',
  critical: 'text-destructive',
  neutral: 'text-muted-foreground',
};

export const ProjectForecastCard = ({ baseline, spent, milestones }: Props) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();

  const total = milestones.length;
  const completed = milestones.filter((m) => m.status === 'completed').length;
  const completionPct = total > 0 ? (completed / total) * 100 : 0;

  const renderShell = (body: React.ReactNode) => (
    <div className="rounded-lg bg-muted/50 p-4 space-y-3 mb-6">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-module-muted" />
        <span className="font-medium text-sm text-module-muted">
          {t('projects.forecast.title', '🔮 Prognoza — po trenutnom tempu')}
        </span>
      </div>
      {body}
      {/* future: CPI/SPI/EAC variance */}
    </div>
  );

  if (total === 0) {
    return renderShell(
      <p className="text-sm text-muted-foreground">
        {t('projects.forecast.noMilestones', 'Dodaj faze projekta da vidiš prognozu')}
      </p>
    );
  }

  if (completionPct < 10) {
    return renderShell(
      <p className="text-sm text-muted-foreground">
        {t('projects.forecast.tooEarly', 'Prognoza dostupna nakon 10% dovršenosti projekta')}
      </p>
    );
  }

  const eac = spent / (completionPct / 100);
  const totalBudget = baseline.value;
  const forecastMarginAmount = totalBudget - eac;
  const forecastMarginPct = totalBudget > 0 ? (forecastMarginAmount / totalBudget) * 100 : null;
  // Prognoza koristi isti prag kao i sve ostalo, samo nad projiciranim troškom.
  const status = getHealthLevel(eac, baseline);

  return renderShell(
    <div className="space-y-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">
          {t('projects.forecast.eac', 'Predviđeni finalni trošak')}
        </span>
        <span className="font-semibold tabular-nums">{formatAmount(eac)}</span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">
          {t('projects.forecast.predictedRemainder', 'Predviđeno preostalo')}
        </span>
        <span className="flex items-center gap-2">
          <span className={cn('w-2 h-2 rounded-full', statusDot[status])} />
          <span className={cn('font-semibold tabular-nums', statusText[status])}>
            {forecastMarginPct !== null ? `${forecastMarginPct.toFixed(1)}%` : '—'}
            {' '}
            <span className="text-muted-foreground font-normal">
              ({formatAmount(forecastMarginAmount)})
            </span>
          </span>
        </span>
      </div>
    </div>
  );
};
