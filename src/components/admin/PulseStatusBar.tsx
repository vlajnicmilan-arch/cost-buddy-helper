import { useTranslation } from 'react-i18next';
import { CheckCircle2, AlertTriangle, AlertOctagon } from 'lucide-react';

interface Props {
  errors1h: number;
  activeSessions: number;
  errors24h: number;
  bySeverity1h?: { critical: number; error: number; warning: number };
}

export const PulseStatusBar = ({ errors1h, activeSessions, errors24h, bySeverity1h }: Props) => {
  const { t } = useTranslation();

  const crit = bySeverity1h?.critical ?? 0;
  const err = bySeverity1h?.error ?? errors1h;
  const warn = bySeverity1h?.warning ?? 0;

  let level: 'ok' | 'warn' | 'crit' = 'ok';
  if (crit >= 1 || err >= 10) level = 'crit';
  else if (err >= 3 || warn >= 10) level = 'warn';

  const config = {
    ok: {
      icon: CheckCircle2,
      label: t('admin.pulse.statusOk', 'Sustav OK'),
      bg: 'bg-green-500/10 border-green-500/30',
      text: 'text-green-700 dark:text-green-400',
    },
    warn: {
      icon: AlertTriangle,
      label: t('admin.pulse.statusWarn', 'Pozor'),
      bg: 'bg-yellow-500/10 border-yellow-500/30',
      text: 'text-yellow-700 dark:text-yellow-400',
    },
    crit: {
      icon: AlertOctagon,
      label: t('admin.pulse.statusCrit', 'Kritično'),
      bg: 'bg-red-500/10 border-red-500/30',
      text: 'text-red-700 dark:text-red-400',
    },
  }[level];

  const Icon = config.icon;

  return (
    <div className={`rounded-xl border p-4 ${config.bg}`}>
      <div className="flex items-center justify-between gap-3">
        <div className={`flex items-center gap-2 ${config.text}`}>
          <Icon className="w-5 h-5" />
          <span className="font-bold">{config.label}</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <div className="text-center">
            <div className="font-bold text-base">{activeSessions}</div>
            <div className="text-muted-foreground">{t('admin.pulse.online', 'Online')}</div>
          </div>
          {bySeverity1h ? (
            <>
              <div className="text-center" title={t('admin.pulse.critical1h', 'Kritično 1h')}>
                <div className="font-bold text-base text-red-600 dark:text-red-400">🔴 {crit}</div>
                <div className="text-muted-foreground">1h</div>
              </div>
              <div className="text-center" title={t('admin.pulse.errors1h', 'Greške 1h')}>
                <div className="font-bold text-base text-orange-600 dark:text-orange-400">🟠 {err}</div>
                <div className="text-muted-foreground">1h</div>
              </div>
              <div className="text-center" title={t('admin.pulse.warnings1h', 'Upozorenja 1h')}>
                <div className="font-bold text-base text-yellow-600 dark:text-yellow-400">🟡 {warn}</div>
                <div className="text-muted-foreground">1h</div>
              </div>
            </>
          ) : (
            <>
              <div className="text-center">
                <div className="font-bold text-base">{errors1h}</div>
                <div className="text-muted-foreground">{t('admin.pulse.err1h', 'Err 1h')}</div>
              </div>
              <div className="text-center">
                <div className="font-bold text-base">{errors24h}</div>
                <div className="text-muted-foreground">{t('admin.pulse.err24h', 'Err 24h')}</div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
