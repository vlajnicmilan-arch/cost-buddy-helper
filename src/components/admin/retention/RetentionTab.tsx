import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import {
  useCohortRetention,
  useActivationByCohort,
  useFunnelSummary30d,
} from '@/hooks/useCohortRetention';
import { pivotCohortRows } from '@/lib/retentionMath';
import { RetentionKpiCards } from './RetentionKpiCards';
import { CohortHeatmap } from './CohortHeatmap';
import { FunnelSparkline } from './FunnelSparkline';

interface Props {
  enabled?: boolean;
}

export const RetentionTab = ({ enabled = true }: Props) => {
  const { t } = useTranslation();
  const cohortQ = useCohortRetention(enabled);
  const activationQ = useActivationByCohort(enabled);
  const funnelQ = useFunnelSummary30d(enabled);

  const loading = cohortQ.isLoading || activationQ.isLoading || funnelQ.isLoading;
  const error = cohortQ.error || activationQ.error || funnelQ.error;

  const cohorts = pivotCohortRows(cohortQ.data ?? []);

  return (
    <div className="space-y-4 mt-4">
      <div>
        <h2 className="text-base font-semibold">{t('adminRetention.title')}</h2>
        <p className="text-xs text-muted-foreground mt-1">{t('adminRetention.subtitle')}</p>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>{t('adminRetention.loading')}</span>
        </div>
      )}

      {error && !loading && (
        <div className="text-sm text-destructive">
          {t('adminRetention.error')}: {String((error as Error).message ?? error)}
        </div>
      )}

      {!loading && !error && (
        <>
          <RetentionKpiCards cohorts={cohorts} activation={activationQ.data ?? []} />
          <FunnelSparkline rows={funnelQ.data ?? []} />
          <CohortHeatmap cohorts={cohorts} />
        </>
      )}
    </div>
  );
};
