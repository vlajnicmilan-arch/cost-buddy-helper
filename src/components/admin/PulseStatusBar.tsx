import { useTranslation } from 'react-i18next';
import { CheckCircle2, AlertTriangle, AlertOctagon } from 'lucide-react';

interface Props {
  errors1h: number;
  activeSessions: number;
  errors24h: number;
}

export const PulseStatusBar = ({ errors1h, activeSessions, errors24h }: Props) => {
  const { t } = useTranslation();

  let level: 'ok' | 'warn' | 'crit' = 'ok';
  if (errors1h >= 10) level = 'crit';
  else if (errors1h >= 3) level = 'warn';

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
          <div className="text-center">
            <div className="font-bold text-base">{errors1h}</div>
            <div className="text-muted-foreground">{t('admin.pulse.err1h', 'Err 1h')}</div>
          </div>
          <div className="text-center">
            <div className="font-bold text-base">{errors24h}</div>
            <div className="text-muted-foreground">{t('admin.pulse.err24h', 'Err 24h')}</div>
          </div>
        </div>
      </div>
    </div>
  );
};
