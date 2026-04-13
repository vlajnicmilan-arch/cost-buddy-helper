import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useTimeClock } from '@/hooks/useTimeClock';
import { useProjectWorkers } from '@/hooks/useProjectWorkers';
import { useAuth } from '@/hooks/useAuth';
import { TimeClockDailyView } from './TimeClockDailyView';
import { TimeClockAbsenceDialog } from './TimeClockAbsenceDialog';
import { useTranslation } from 'react-i18next';
import { format, addDays, subDays } from 'date-fns';
import { hr } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Calendar, Loader2 } from 'lucide-react';

interface TimeClockTabProps {
  projectId: string;
  isManager: boolean;
}

export const TimeClockTab = ({ projectId, isManager }: TimeClockTabProps) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { workers, loading: workersLoading } = useProjectWorkers(projectId);
  const {
    loading: entriesLoading,
    selectedDate,
    setSelectedDate,
    getWorkerStatuses,
    clockIn,
    clockOut,
    startBreak,
    endBreak,
    addAbsence,
    deleteEntry
  } = useTimeClock(projectId);

  const [absenceWorkerId, setAbsenceWorkerId] = useState<string | null>(null);

  const loading = workersLoading || entriesLoading;
  const statuses = getWorkerStatuses(workers);
  const isToday = format(selectedDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');

  const absenceWorker = workers.find(w => w.id === absenceWorkerId);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Date navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => setSelectedDate(subDays(selectedDate, 1))}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <span className="font-medium">
            {format(selectedDate, 'EEEE, d. MMMM yyyy', { locale: hr })}
          </span>
          {isToday && (
            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
              {t('timeClock.today', 'Danas')}
            </span>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={() => setSelectedDate(addDays(selectedDate, 1))}>
          <ChevronRight className="w-5 h-5" />
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-2 text-center">
        {(['working', 'on_break', 'finished', 'absent'] as const).map(status => {
          const count = statuses.filter(s => s.status === status).length;
          return (
            <div key={status} className="p-2 rounded-lg bg-muted/50">
              <p className="text-lg font-bold">{count}</p>
              <p className="text-xs text-muted-foreground">{t(`timeClock.${status}`, status)}</p>
            </div>
          );
        })}
      </div>

      {/* Worker cards */}
      <TimeClockDailyView
        statuses={statuses}
        onClockIn={(workerId) => user && clockIn(workerId, user.id)}
        onClockOut={clockOut}
        onStartBreak={startBreak}
        onEndBreak={endBreak}
        onAddAbsence={setAbsenceWorkerId}
        onDeleteEntry={deleteEntry}
        isManager={isManager}
      />

      {/* Absence dialog */}
      {absenceWorker && (
        <TimeClockAbsenceDialog
          open={!!absenceWorkerId}
          onOpenChange={(open) => !open && setAbsenceWorkerId(null)}
          workerName={`${absenceWorker.first_name} ${absenceWorker.last_name}`}
          onSubmit={(absenceType, note) => {
            if (user && absenceWorkerId) {
              addAbsence(absenceWorkerId, user.id, absenceType, note);
            }
          }}
        />
      )}
    </div>
  );
};
