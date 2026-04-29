import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { RefreshCw, Loader2, AlertOctagon, Smartphone, Activity } from 'lucide-react';
import { usePulseMetrics, type PulseRange } from '@/hooks/usePulseMetrics';
import { PulseStatusBar } from './PulseStatusBar';
import { PulseMetricCard } from './PulseMetricCard';
import { PulseLiveFeed } from './PulseLiveFeed';
import { PulseAlertsSection } from './PulseAlertsSection';
import { PulsePerformanceSection } from './PulsePerformanceSection';
import { PulseAISummary } from './PulseAISummary';
import { PulseTopIssuesSection } from './PulseTopIssuesSection';
import { PulseActivationFunnel } from './PulseActivationFunnel';
import { SentryControlsCard } from './SentryControlsCard';

export const PulseTab = () => {
  const { t } = useTranslation();
  const [range, setRange] = useState<PulseRange>('24h');
  const m = usePulseMetrics(range);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Select value={range} onValueChange={(v) => setRange(v as PulseRange)}>
          <SelectTrigger className="h-8 text-xs w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="5min">{t('admin.pulse.range5min', 'Zadnjih 5 min')}</SelectItem>
            <SelectItem value="1h">{t('admin.pulse.range1h', 'Zadnji sat')}</SelectItem>
            <SelectItem value="24h">{t('admin.pulse.range24h', 'Zadnja 24 h')}</SelectItem>
            <SelectItem value="7d">{t('admin.pulse.range7d', 'Zadnjih 7 dana')}</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={m.refresh} disabled={m.loading} className="h-8 text-xs">
          {m.loading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
          {t('admin.pulse.refresh', 'Osvježi')}
        </Button>
      </div>

      <PulseStatusBar
        errors1h={m.errors1h}
        activeSessions={m.activeSessions}
        errors24h={m.errors24h}
        bySeverity1h={m.bySeverity1h}
      />

      <PulseActivationFunnel />

      <PulseTopIssuesSection issues={m.topIssues} />

      {m.error && (
        <div className="text-xs text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-2">
          {m.error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <PulseMetricCard
          title={t('admin.pulse.topRoutes', 'Top problematične rute')}
          icon={<AlertOctagon className="w-3.5 h-3.5" />}
          isEmpty={m.topRoutes.length === 0}
          empty={t('admin.pulse.noRoutes', 'Nema podataka o rutama.')}
        >
          <div className="space-y-1.5">
            {m.topRoutes.map((r) => (
              <div key={r.route} className="flex items-center justify-between text-xs">
                <code className="text-foreground truncate flex-1 mr-2">{r.route}</code>
                <span className="text-muted-foreground shrink-0">
                  {r.errorCount > 0 && (
                    <span className="text-red-600 dark:text-red-400 font-semibold mr-1">
                      {r.errorCount} err
                    </span>
                  )}
                  <span>{r.eventCount}</span>
                </span>
              </div>
            ))}
          </div>
        </PulseMetricCard>

        <PulseMetricCard
          title={t('admin.pulse.versions', 'Verzije aplikacije')}
          icon={<Smartphone className="w-3.5 h-3.5" />}
          isEmpty={m.versions.length === 0}
          empty={t('admin.pulse.noVersions', 'Nema podataka o verzijama.')}
        >
          <div className="space-y-1.5">
            {m.versions.map((v) => (
              <div key={v.version} className="flex items-center justify-between text-xs">
                <span className="text-foreground">v{v.version}</span>
                <span className="text-muted-foreground">{v.sessions}</span>
              </div>
            ))}
          </div>
        </PulseMetricCard>
      </div>

      <PulsePerformanceSection
        perfByRoute={m.perfByRoute}
        slowestActions={m.slowestActions}
      />

      <PulseAlertsSection />

      <SentryControlsCard />

      <PulseAISummary />

      <PulseMetricCard
        title={t('admin.pulse.liveFeed', 'Live feed događaja')}
        icon={<Activity className="w-3.5 h-3.5" />}
      >
        <PulseLiveFeed />
      </PulseMetricCard>
    </div>
  );
};
