import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  heatmapBgClass,
  heatmapTextClass,
  isFutureCell,
  isSmallSample,
  RETENTION_WEEKS,
  type CohortRow,
} from '@/lib/retentionMath';

interface Props {
  cohorts: CohortRow[];
}

export const CohortHeatmap = ({ cohorts }: Props) => {
  const { t } = useTranslation();
  const now = new Date();

  if (cohorts.length === 0) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        {t('adminRetention.heatmap.empty')}
      </Card>
    );
  }

  return (
    <Card className="p-3 overflow-x-auto">
      <div className="text-sm font-semibold mb-1">{t('adminRetention.heatmap.title')}</div>
      <div className="text-[11px] text-muted-foreground mb-3">{t('adminRetention.heatmap.subtitle')}</div>
      <table className="w-full text-xs border-separate border-spacing-1 min-w-[640px]">
        <thead>
          <tr>
            <th className="text-left font-medium text-muted-foreground sticky left-0 bg-card z-10">
              {t('adminRetention.heatmap.cohortHeader')}
            </th>
            <th className="text-right font-medium text-muted-foreground pr-2">
              {t('adminRetention.heatmap.sizeHeader')}
            </th>
            {Array.from({ length: RETENTION_WEEKS }, (_, i) => (
              <th key={i} className="font-medium text-muted-foreground text-center">
                W{i}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cohorts.map((c) => {
            const small = isSmallSample(c.cohortSize);
            return (
              <tr key={c.cohortWeek}>
                <td className="sticky left-0 bg-card z-10 pr-2 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <span className="font-mono">{c.cohortWeek}</span>
                    {small && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0">
                        {t('adminRetention.heatmap.smallSample')}
                      </Badge>
                    )}
                  </div>
                </td>
                <td className="text-right tabular-nums pr-2 text-muted-foreground">
                  {c.cohortSize}
                </td>
                {c.weeks.map((w, idx) => {
                  const future = isFutureCell(c.cohortStart, idx, now);
                  if (future) {
                    return (
                      <td
                        key={idx}
                        className="text-center bg-muted/20 text-muted-foreground rounded h-8"
                        title={t('adminRetention.heatmap.futureCell')}
                      >
                        ·
                      </td>
                    );
                  }
                  return (
                    <td
                      key={idx}
                      className={`text-center rounded h-8 tabular-nums ${heatmapBgClass(w.pct)} ${heatmapTextClass(w.pct)}`}
                      title={t('adminRetention.heatmap.cellTitle', {
                        count: w.count,
                        size: c.cohortSize,
                      })}
                    >
                      {w.pct > 0 ? `${Math.round(w.pct)}` : '·'}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
};
