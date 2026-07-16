import { useMemo } from 'react';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Calendar, Scale, Target } from 'lucide-react';
import { useCurrency } from '@/contexts/CurrencyContext';
import type { ProjectMilestone } from '@/types/project';
import { MILESTONE_STATUS_LABELS } from '@/types/project';

interface Props {
  milestones: ProjectMilestone[];
  loading?: boolean;
}

/**
 * Investor-only pregled faza projekta.
 *
 * NAMJERNO ne prikazuje: milestone.budget, milestone.spent, is_contingency
 * rezervu, ni bilo koji drugi INTERNI trošak izvođača. Prikazani su isključivo
 * podaci koji su dogovoreni prema investitoru:
 *   - naziv i opis
 *   - status
 *   - datumi (planirani i stvarni)
 *   - "Prema investitoru" iznos (investor_price) — snapshot iz odobrene odluke
 */
export const InvestorPhasesView = ({ milestones, loading }: Props) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();

  const sorted = useMemo(
    () => [...milestones].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [milestones],
  );
  const completed = sorted.filter((m) => m.status === 'completed').length;

  if (loading) {
    return <div className="text-sm text-muted-foreground py-8 text-center">{t('common.loading', 'Učitavanje...')}</div>;
  }

  if (sorted.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-8 text-center">
        {t('projects.investor.noPhases', 'Faze još nisu definirane.')}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="p-4 rounded-lg border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-module-muted" />
            <span className="font-medium">{t('projects.milestonesProgress', 'Napredak faza')}</span>
          </div>
          <span className="text-sm text-muted-foreground">
            {completed} / {sorted.length}
          </span>
        </div>
        <Progress value={(completed / sorted.length) * 100} className="h-2" />
      </div>

      {sorted.map((m) => {
        const statusKey = m.status;
        const statusLabel = t(`milestoneStatus.${statusKey}`, MILESTONE_STATUS_LABELS[statusKey]);
        return (
          <div key={m.id} className="p-4 rounded-lg border space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{m.name}</div>
                {m.description && (
                  <p className="text-sm text-muted-foreground mt-0.5">{m.description}</p>
                )}
              </div>
              <Badge variant="secondary" className="shrink-0">{statusLabel}</Badge>
            </div>

            {(m.start_date || m.due_date || m.actual_start_date || m.actual_end_date) && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {m.start_date && (
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {t('projects.start', 'Početak')}: {format(new Date(m.start_date), 'd.M.yyyy', { locale: hr })}
                  </span>
                )}
                {m.due_date && (
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {t('projects.end', 'Kraj')}: {format(new Date(m.due_date), 'd.M.yyyy', { locale: hr })}
                  </span>
                )}
                {m.actual_end_date && (
                  <span className="inline-flex items-center gap-1 text-income">
                    ✓ {format(new Date(m.actual_end_date), 'd.M.yyyy', { locale: hr })}
                  </span>
                )}
              </div>
            )}

            {m.investor_price != null && m.investor_price > 0 && (
              <div className="pt-2 border-t flex items-center justify-between text-sm">
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <Scale className="w-3.5 h-3.5" />
                  {t('projects.investor.priceLabel', 'Prema investitoru')}
                </span>
                <span className="font-medium">{formatAmount(m.investor_price)}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
