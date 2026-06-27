import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertOctagon, AlertTriangle, ChevronRight, Users, Activity } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { PulseMetricCard } from './PulseMetricCard';
import type { PulseTopIssue } from '@/hooks/usePulseMetrics';

interface Props {
  issues: PulseTopIssue[];
}

const severityConfig = {
  critical: {
    icon: AlertOctagon,
    label: 'Kritično',
    color: 'text-red-600 dark:text-red-400',
    bg: 'bg-red-500/10 border-red-500/30',
    badge: 'bg-red-500 text-white',
    emoji: '🔴',
  },
  error: {
    icon: AlertTriangle,
    label: 'Greška',
    color: 'text-orange-600 dark:text-orange-400',
    bg: 'bg-orange-500/10 border-orange-500/30',
    badge: 'bg-orange-500 text-white',
    emoji: '🟠',
  },
  warning: {
    icon: AlertTriangle,
    label: 'Upozorenje',
    color: 'text-yellow-600 dark:text-yellow-400',
    bg: 'bg-yellow-500/10 border-yellow-500/30',
    badge: 'bg-yellow-500 text-white',
    emoji: '🟡',
  },
  info: {
    icon: AlertTriangle,
    label: 'Info',
    color: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-500/10 border-blue-500/30',
    badge: 'bg-blue-500 text-white',
    emoji: '🔵',
  },
} as const;

const formatRelative = (iso: string, t: (k: string, d: string) => string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return t('admin.pulse.justNow', 'upravo');
  if (mins < 60) return `${t('admin.pulse.minAgo', 'prije')} ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${t('admin.pulse.minAgo', 'prije')} ${hrs} h`;
  const days = Math.floor(hrs / 24);
  return `${t('admin.pulse.minAgo', 'prije')} ${days} d`;
};

export const PulseTopIssuesSection = ({ issues }: Props) => {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<PulseTopIssue | null>(null);

  if (issues.length === 0) {
    return (
      <PulseMetricCard
        title={t('admin.pulse.topIssues', 'Top problemi (po važnosti)')}
        icon={<AlertOctagon className="w-3.5 h-3.5" />}
        isEmpty={true}
        empty={t('admin.pulse.noIssues', 'Nema kritičnih grešaka u odabranom razdoblju 🎉')}
      >
        <></>
      </PulseMetricCard>
    );
  }

  return (
    <>
      <PulseMetricCard
        title={t('admin.pulse.topIssues', 'Top problemi (po važnosti)')}
        icon={<AlertOctagon className="w-3.5 h-3.5" />}
      >
        <div className="space-y-2">
          {issues.map((issue) => {
            const cfg = severityConfig[issue.severity as keyof typeof severityConfig] ?? severityConfig.error;
            return (
              <button
                key={issue.signature}
                onClick={() => setSelected(issue)}
                className={`w-full text-left rounded-lg border p-2.5 ${cfg.bg} hover:opacity-80 transition-opacity`}
              >
                <div className="flex items-start gap-2">
                  <span className="text-base shrink-0">{cfg.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <code className={`text-[11px] font-semibold ${cfg.color}`}>{issue.event}</code>
                      <Badge variant="outline" className="text-[10px] h-4 px-1">
                        {issue.route}
                      </Badge>
                    </div>
                    <div className="text-xs text-foreground line-clamp-2 mb-1">
                      {issue.message || t('admin.pulse.noMessage', '(bez poruke)')}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Activity className="w-3 h-3" />
                        {issue.count}×
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {issue.affectedUsers || issue.affectedSessions} {t('admin.pulse.users', 'korisnika')}
                      </span>
                      <span>{formatRelative(issue.lastSeen, t as (k: string, d: string) => string)}</span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                </div>
              </button>
            );
          })}
        </div>
      </PulseMetricCard>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-lg max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              {selected && (severityConfig[selected.severity as keyof typeof severityConfig]?.emoji ?? '⚠️')}
              <code className="text-sm">{selected?.event}</code>
            </DialogTitle>
            <DialogDescription className="text-xs">
              {selected?.route} · {selected && formatRelative(selected.lastSeen, t as (k: string, d: string) => string)}
            </DialogDescription>
          </DialogHeader>

          {selected && (
            <ScrollArea className="max-h-[60vh] pr-3">
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-muted p-2">
                    <div className="text-lg font-bold">{selected.count}</div>
                    <div className="text-[10px] text-muted-foreground">{t('admin.pulse.occurrences', 'pojava')}</div>
                  </div>
                  <div className="rounded-lg bg-muted p-2">
                    <div className="text-lg font-bold">{selected.affectedUsers}</div>
                    <div className="text-[10px] text-muted-foreground">{t('admin.pulse.users', 'korisnika')}</div>
                  </div>
                  <div className="rounded-lg bg-muted p-2">
                    <div className="text-lg font-bold">{selected.affectedSessions}</div>
                    <div className="text-[10px] text-muted-foreground">{t('admin.pulse.sessions', 'sesija')}</div>
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-muted-foreground mb-1">
                    {t('admin.pulse.message', 'Poruka')}
                  </div>
                  <div className="rounded-lg bg-muted p-2 text-xs whitespace-pre-wrap break-words">
                    {selected.message || '(none)'}
                  </div>
                </div>

                {selected.sampleDetails && (
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground mb-1">
                      {t('admin.pulse.details', 'Detalji')}
                    </div>
                    <pre className="rounded-lg bg-muted p-2 text-[10px] overflow-x-auto whitespace-pre-wrap break-words">
                      {JSON.stringify(selected.sampleDetails, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
