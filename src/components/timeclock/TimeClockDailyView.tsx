import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { WorkerDayStatus, WorkerClockStatus } from '@/types/timeClock';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import {
  LogIn, LogOut, Coffee, CoffeeIcon, AlertCircle, Clock,
  Trash2, User, PenLine
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface TimeClockDailyViewProps {
  statuses: WorkerDayStatus[];
  onClockIn: (workerId: string) => void;
  onClockOut: (entryId: string) => void;
  onStartBreak: (entryId: string) => void;
  onEndBreak: (entryId: string) => void;
  onAddAbsence: (workerId: string) => void;
  onQuickEntry: (workerId: string) => void;
  onDeleteEntry: (entryId: string) => void;
  isManager: boolean;
}

const STATUS_CONFIG: Record<WorkerClockStatus, { label: string; color: string; icon: typeof Clock }> = {
  not_arrived: { label: 'timeClock.notArrived', color: 'bg-muted text-muted-foreground', icon: Clock },
  working: { label: 'timeClock.working', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400', icon: LogIn },
  on_break: { label: 'timeClock.onBreak', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400', icon: Coffee },
  finished: { label: 'timeClock.finished', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400', icon: LogOut },
  absent: { label: 'timeClock.absent', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400', icon: AlertCircle },
};

export const TimeClockDailyView = ({
  statuses,
  onClockIn,
  onClockOut,
  onStartBreak,
  onEndBreak,
  onAddAbsence,
  onQuickEntry,
  onDeleteEntry,
  isManager
}: TimeClockDailyViewProps) => {
  const { t } = useTranslation();

  if (statuses.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <User className="w-12 h-12 mx-auto mb-2 opacity-50" />
        <p>{t('timeClock.noWorkers', 'Nema radnika na projektu')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {statuses.map((ws) => {
        const config = STATUS_CONFIG[ws.status];
        const StatusIcon = config.icon;

        return (
          <Card key={ws.workerId} className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium truncate">{ws.workerName}</span>
                  <Badge className={cn('text-xs', config.color)} variant="secondary">
                    <StatusIcon className="w-3 h-3 mr-1" />
                    {t(config.label, config.label.split('.').pop())}
                  </Badge>
                </div>
                {ws.clockInTime && (
                  <p className="text-xs text-muted-foreground">
                    {t('timeClock.arrivedAt', 'Došao u')} {format(new Date(ws.clockInTime), 'HH:mm', { locale: hr })}
                    {ws.entry?.clock_out && (
                      <> → {format(new Date(ws.entry.clock_out), 'HH:mm', { locale: hr })}</>
                    )}
                    {ws.totalHours > 0 && (
                      <> · {ws.totalHours.toFixed(1)}h</>
                    )}
                    {ws.entry && ws.entry.break_minutes > 0 && (
                      <> · {t('timeClock.breakMin', 'pauza')} {ws.entry.break_minutes}min</>
                    )}
                  </p>
                )}
                {/* Show legal breakdown for completed entries */}
                {ws.entry && ws.status === 'finished' && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {Number(ws.entry.regular_hours) > 0 && (
                      <span className="text-xs text-muted-foreground">R:{ws.entry.regular_hours}h</span>
                    )}
                    {Number(ws.entry.overtime_hours) > 0 && (
                      <span className="text-xs text-orange-600 dark:text-orange-400">P:{ws.entry.overtime_hours}h</span>
                    )}
                    {Number(ws.entry.night_hours) > 0 && (
                      <span className="text-xs text-muted-foreground">N:{ws.entry.night_hours}h</span>
                    )}
                    {Number(ws.entry.sunday_hours) > 0 && (
                      <span className="text-xs text-muted-foreground">Ned:{ws.entry.sunday_hours}h</span>
                    )}
                  </div>
                )}
                {ws.entry?.absence_type && (
                  <p className="text-xs text-muted-foreground">
                    {t(`timeClock.absence.${ws.entry.absence_type}`, ws.entry.absence_type)}
                    {ws.entry.note && ` — ${ws.entry.note}`}
                  </p>
                )}
              </div>

              {isManager && (
                <div className="flex items-center gap-1 shrink-0">
                  {ws.status === 'not_arrived' && (
                    <>
                      <Button size="sm" variant="default" onClick={() => onClockIn(ws.workerId)}>
                        <LogIn className="w-4 h-4 mr-1" />
                        {t('timeClock.in', 'Dolazak')}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => onQuickEntry(ws.workerId)} title={t('timeClock.quickEntry', 'Brzi unos')}>
                        <PenLine className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => onAddAbsence(ws.workerId)}>
                        <AlertCircle className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                  {ws.status === 'working' && ws.entry && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => onStartBreak(ws.entry!.id)}>
                        <Coffee className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => onClockOut(ws.entry!.id)}>
                        <LogOut className="w-4 h-4 mr-1" />
                        {t('timeClock.out', 'Odlazak')}
                      </Button>
                    </>
                  )}
                  {ws.status === 'on_break' && ws.entry && (
                    <Button size="sm" variant="default" onClick={() => onEndBreak(ws.entry!.id)}>
                      <CoffeeIcon className="w-4 h-4 mr-1" />
                      {t('timeClock.endBreak', 'Nastavi')}
                    </Button>
                  )}
                  {ws.entry && (ws.status === 'finished' || ws.status === 'absent') && (
                    <Button size="sm" variant="ghost" onClick={() => onDeleteEntry(ws.entry!.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
};
