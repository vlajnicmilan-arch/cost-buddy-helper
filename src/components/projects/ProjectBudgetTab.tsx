import { Wallet, AlertTriangle, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Project } from '@/types/project';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { ContractAmendmentsBadge } from './ContractAmendmentsBadge';

interface ProjectBudgetTabProps {
  project: Project;
  /** Effective contract value (contract_value || total_budget) */
  budget: number;
  /** Original contract minus amendments */
  originalContract: number;
  totalReceived: number;
  totalSpent: number;
  costPct: number;
  collectionPct: number;
  marginPct: number | null;
  marginStatusKey: 'healthy' | 'attention' | 'critical' | 'neutral';
  showBudgetAlarm: boolean;
  showCollectionAlarm: boolean;
  canAccessBusinessTabs: boolean;
  onOpenBudgetHistory?: () => void;
  /** Lite Quick Start CTA when no budget set */
  onRequestEdit?: () => void;
}

/**
 * Self-contained Budget tab — extracted from the inline budget overview block
 * in ProjectFullScreenView. Renders the same KPIs / progress bars / alarms,
 * plus an empty-state CTA when no budget is set yet.
 *
 * Used by both Lite (as a dedicated tab) and Full mode (inline above tabs).
 */
export const ProjectBudgetTab = ({
  project,
  budget,
  originalContract,
  totalReceived,
  totalSpent,
  costPct,
  collectionPct,
  marginPct,
  marginStatusKey,
  showBudgetAlarm,
  showCollectionAlarm,
  canAccessBusinessTabs,
  onOpenBudgetHistory,
  onRequestEdit,
}: ProjectBudgetTabProps) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();

  const marginDotClass = {
    healthy: 'bg-income',
    attention: 'bg-warning',
    critical: 'bg-destructive',
    neutral: 'bg-muted-foreground',
  }[marginStatusKey];
  const marginTextClass = {
    healthy: 'text-income',
    attention: 'text-warning',
    critical: 'text-destructive',
    neutral: 'text-muted-foreground',
  }[marginStatusKey];
  const marginBarClass = {
    healthy: '[&>div]:bg-income',
    attention: '[&>div]:bg-warning',
    critical: '[&>div]:bg-destructive',
    neutral: '',
  }[marginStatusKey];
  const marginStatusLabel = t(
    `projects.marginStatus.${marginStatusKey}`,
    marginStatusKey === 'healthy'
      ? 'Zdrav'
      : marginStatusKey === 'attention'
      ? 'Pažnja'
      : marginStatusKey === 'critical'
      ? 'Kritično'
      : '—'
  );

  const hasAnyFinancials = budget > 0 || totalReceived > 0 || totalSpent > 0;

  if (!hasAnyFinancials) {
    return (
      <div className="p-6 rounded-lg bg-muted/50 text-center space-y-3">
        <Wallet className="w-10 h-10 mx-auto text-muted-foreground" />
        <div className="space-y-1">
          <p className="font-medium">{t('projects.budgetEmptyTitle', 'Postavi budžet projekta')}</p>
          <p className="text-sm text-muted-foreground">
            {t(
              'projects.budgetEmptyDesc',
              'Unesi ugovorenu vrijednost ili ukupan budžet kako bi pratio maržu i naplatu.'
            )}
          </p>
        </div>
        {onRequestEdit && (
          <Button size="sm" onClick={onRequestEdit} className="mt-1">
            {t('projects.budgetEmptyCta', 'Postavi budžet')}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 rounded-lg bg-muted/50 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="w-5 h-5 text-muted-foreground" />
          <span className="font-medium">{t('projects.budgetOverview', 'Pregled budžeta')}</span>
        </div>
        {canAccessBusinessTabs && onOpenBudgetHistory && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onOpenBudgetHistory}
            title={t('projects.budgetHistory', 'Povijest budžeta')}
          >
            <History className="w-4 h-4 text-muted-foreground" />
          </Button>
        )}
      </div>

      {/* 4 KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <div className="p-2 sm:p-3 rounded-lg bg-muted text-center">
          <p className="text-base sm:text-xl font-bold tabular-nums truncate">
            {formatAmount(originalContract)}
          </p>
          <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
            {t('projects.contracted', 'Ugovoreno')}
          </p>
          <ContractAmendmentsBadge projectId={project.id} />
        </div>
        <div className="p-2 sm:p-3 rounded-lg bg-income/10 text-center">
          <p className="text-base sm:text-xl font-bold text-income tabular-nums truncate">
            {formatAmount(totalReceived)}
          </p>
          <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
            {t('projects.received', 'Primljeno')}
          </p>
          {budget > 0 && (
            <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
              {t('projects.receivedOfContract', '{{pct}}% od ugovorenog', {
                pct: collectionPct.toFixed(0),
              })}
            </p>
          )}
        </div>
        <div className="p-2 sm:p-3 rounded-lg bg-expense/10 text-center">
          <p className="text-base sm:text-xl font-bold text-expense tabular-nums truncate">
            {formatAmount(totalSpent)}
          </p>
          <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
            {t('projects.spent', 'Potrošeno')}
          </p>
        </div>
        <div className="p-2 sm:p-3 rounded-lg bg-muted text-center">
          <p className={cn('text-base sm:text-xl font-bold tabular-nums truncate', marginTextClass)}>
            {marginPct !== null ? `${marginPct.toFixed(0)}%` : '—'}
          </p>
          <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
            {t('projects.margin', 'Marža')}
          </p>
          <div className="flex items-center justify-center gap-1 mt-1">
            <span className={cn('w-1.5 h-1.5 rounded-full', marginDotClass)} />
            <span className={cn('text-[10px]', marginTextClass)}>{marginStatusLabel}</span>
          </div>
        </div>
      </div>

      {/* Dual progress bars */}
      {budget > 0 && (
        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between text-[11px] sm:text-xs mb-1">
              <span className="text-muted-foreground">
                {t('projects.progress.cost', 'Trošak')} · {costPct.toFixed(0)}%
              </span>
              <span className="text-muted-foreground tabular-nums">
                {formatAmount(totalSpent)} / {formatAmount(budget)}
              </span>
            </div>
            <Progress value={Math.min(costPct, 100)} className={cn('h-2', marginBarClass)} />
          </div>
          <div>
            <div className="flex items-center justify-between text-[11px] sm:text-xs mb-1">
              <span className="text-muted-foreground">
                {t('projects.progress.collection', 'Naplata')} · {collectionPct.toFixed(0)}%
              </span>
              <span className="text-muted-foreground tabular-nums">
                {formatAmount(totalReceived)} / {formatAmount(budget)}
              </span>
            </div>
            <Progress value={Math.min(collectionPct, 100)} className="h-2 [&>div]:bg-primary" />
          </div>
        </div>
      )}

      {(showBudgetAlarm || showCollectionAlarm) && (
        <div className="space-y-2">
          {showBudgetAlarm && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-destructive/10 text-destructive text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                {t('projects.alerts.budgetHigh', '⚠️ Potrošio si {{pct}}% ugovorenog budžeta', {
                  pct: costPct.toFixed(0),
                })}
              </span>
            </div>
          )}
          {showCollectionAlarm && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-warning/10 text-warning text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                {t(
                  'projects.alerts.collectionLow',
                  '💰 Naplaćeno samo {{pct}}%. Razmisli o podsjetniku klijentu.',
                  { pct: collectionPct.toFixed(0) }
                )}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
