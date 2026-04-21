import { useTranslation } from 'react-i18next';
import { Gauge, Clock } from 'lucide-react';
import { format } from 'date-fns';

interface Props {
  perfByRoute: Array<{ route: string; samples: number; p50: number; p95: number }>;
  slowestActions: Array<{ action: string; duration_ms: number; route: string | null; created_at: string }>;
}

export const PulsePerformanceSection = ({ perfByRoute, slowestActions }: Props) => {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="bg-card border rounded-xl p-3 space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          <Gauge className="w-3.5 h-3.5" />
          <span>{t('admin.pulse.perfTitle', 'Brzina po ruti (P50 / P95)')}</span>
        </div>
        {perfByRoute.length === 0 ? (
          <p className="text-xs text-muted-foreground py-3 text-center">
            {t('admin.pulse.perfEmpty', 'Nema podataka o brzini.')}
          </p>
        ) : (
          <div className="space-y-1.5">
            {perfByRoute.map((p) => (
              <div key={p.route} className="flex items-center justify-between text-xs">
                <code className="text-foreground truncate flex-1 mr-2">{p.route}</code>
                <span className="text-muted-foreground shrink-0">
                  {p.p50}ms / <span className="text-foreground font-semibold">{p.p95}ms</span>
                  <span className="text-[10px] ml-1">({p.samples})</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-card border rounded-xl p-3 space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          <Clock className="w-3.5 h-3.5" />
          <span>{t('admin.pulse.slowActions', 'Najsporije akcije')}</span>
        </div>
        {slowestActions.length === 0 ? (
          <p className="text-xs text-muted-foreground py-3 text-center">
            {t('admin.pulse.slowEmpty', 'Nema sporih akcija.')}
          </p>
        ) : (
          <div className="space-y-1.5">
            {slowestActions.map((a, i) => (
              <div key={i} className="flex items-center justify-between text-xs gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-foreground truncate">{a.action}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {a.route ?? '?'} · {format(new Date(a.created_at), 'HH:mm')}
                  </div>
                </div>
                <span className="text-foreground font-semibold shrink-0">
                  {a.duration_ms}ms
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
