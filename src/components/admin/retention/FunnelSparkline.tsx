import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { aggregateFunnel30d, type FunnelDayRow } from '@/lib/retentionMath';

interface Props {
  rows: FunnelDayRow[];
}

const W = 120;
const H = 28;

const buildPath = (series: Array<{ cnt: number }>): string => {
  if (series.length === 0) return '';
  const max = Math.max(1, ...series.map((s) => s.cnt));
  const step = W / Math.max(1, series.length - 1);
  return series
    .map((s, i) => {
      const x = i * step;
      const y = H - (s.cnt / max) * H;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
};

export const FunnelSparkline = ({ rows }: Props) => {
  const { t } = useTranslation();
  const events = aggregateFunnel30d(rows);

  return (
    <Card className="p-3">
      <div className="text-sm font-semibold mb-2">{t('adminRetention.funnel.title')}</div>
      <div className="text-[11px] text-muted-foreground mb-3">{t('adminRetention.funnel.subtitle')}</div>
      <div className="space-y-2">
        {events.map((e) => (
          <div key={e.eventName} className="grid grid-cols-[1fr_auto_auto] items-center gap-3">
            <span className="text-xs truncate">{t(`adminRetention.funnel.events.${e.eventName}`)}</span>
            <svg
              width={W}
              height={H}
              viewBox={`0 0 ${W} ${H}`}
              className="text-primary"
              aria-hidden="true"
            >
              <path
                d={buildPath(e.series)}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="text-xs font-semibold tabular-nums w-12 text-right">{e.total}</span>
          </div>
        ))}
      </div>
    </Card>
  );
};
