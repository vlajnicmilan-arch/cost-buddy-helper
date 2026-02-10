import { useState, useEffect, useCallback } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { ProjectMilestone } from '@/types/project';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useTranslation } from 'react-i18next';
import { format, parseISO, isSameDay } from 'date-fns';
import { hr } from 'date-fns/locale';
import { CalendarDays, Clock, User, Flag, AlertCircle, Loader2 } from 'lucide-react';

interface WorkEntry {
  id: string;
  worker_id: string;
  work_date: string;
  scheduled_hours: number;
  actual_hours: number;
  note?: string | null;
  milestone_ids?: string[] | null;
}

interface Worker {
  id: string;
  first_name: string;
  last_name: string;
  position: string;
  hourly_rate: number;
}

interface WorkCalendarOverviewProps {
  projectId: string;
  milestones: ProjectMilestone[];
}

export const WorkCalendarOverview = ({ projectId, milestones }: WorkCalendarOverviewProps) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const [entries, setEntries] = useState<WorkEntry[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [month, setMonth] = useState<Date>(new Date());

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [entriesRes, workersRes] = await Promise.all([
        supabase
          .from('project_work_entries')
          .select('id, worker_id, work_date, scheduled_hours, actual_hours, note, milestone_ids')
          .eq('project_id', projectId),
        supabase
          .from('project_workers')
          .select('id, first_name, last_name, position, hourly_rate')
          .eq('project_id', projectId)
      ]);

      if (entriesRes.error) throw entriesRes.error;
      if (workersRes.error) throw workersRes.error;

      setEntries((entriesRes.data || []).map(e => ({
        ...e,
        scheduled_hours: Number(e.scheduled_hours),
        actual_hours: Number(e.actual_hours)
      })));
      setWorkers((workersRes.data || []).map(w => ({
        ...w,
        hourly_rate: Number(w.hourly_rate)
      })));
    } catch (error) {
      console.error('Error fetching work calendar data:', error);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Dates that have entries
  const workDates = entries.map(e => parseISO(e.work_date));

  // Entries for selected date
  const selectedDateEntries = selectedDate
    ? entries.filter(e => isSameDay(parseISO(e.work_date), selectedDate))
    : [];

  const getWorker = (workerId: string) => workers.find(w => w.id === workerId);

  const getMilestoneNames = (milestoneIds: string[] | null | undefined) => {
    if (!milestoneIds || milestoneIds.length === 0) return null;
    return milestoneIds.map(id => milestones.find(m => m.id === id)?.name).filter(Boolean);
  };

  // Count unique work dates
  const uniqueWorkDates = new Set(entries.map(e => e.work_date)).size;
  const totalHours = entries.reduce((sum, e) => sum + e.actual_hours, 0);

  const handleDayClick = (day: Date) => {
    const hasEntries = entries.some(e => isSameDay(parseISO(e.work_date), day));
    if (hasEntries) {
      setSelectedDate(day);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <Card className="p-4 bg-muted/50">
        <div className="grid grid-cols-2 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold">{uniqueWorkDates}</p>
            <p className="text-xs text-muted-foreground">{t('workers.workDaysCount', 'Radnih dana')}</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{totalHours}h</p>
            <p className="text-xs text-muted-foreground">{t('workers.totalHours', 'Ukupno sati')}</p>
          </div>
        </div>
      </Card>

      {/* Calendar */}
      <Card className="p-2 flex justify-center">
        <Calendar
          mode="single"
          month={month}
          onMonthChange={setMonth}
          onSelect={(day) => day && handleDayClick(day)}
          locale={hr}
          className="p-3 pointer-events-auto"
          modifiers={{ hasEntry: workDates }}
          modifiersStyles={{
            hasEntry: {
              backgroundColor: 'hsl(var(--primary) / 0.2)',
              fontWeight: 'bold',
              borderRadius: '50%'
            }
          }}
        />
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        {t('workers.calendarHint', 'Kliknite na označeni datum za detalje')}
      </p>

      {/* Day Detail Dialog */}
      <Dialog open={!!selectedDate} onOpenChange={(open) => !open && setSelectedDate(null)}>
        <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto" showBackButton>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5" />
              {selectedDate && format(selectedDate, 'EEEE, d. MMMM yyyy', { locale: hr })}
            </DialogTitle>
          </DialogHeader>

          {selectedDateEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              {t('workers.noEntriesForDate', 'Nema zapisa za ovaj datum')}
            </p>
          ) : (
            <div className="space-y-3">
              {/* Day totals */}
              <Card className="p-3 bg-muted/50">
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div>
                    <p className="text-lg font-bold">
                      {selectedDateEntries.reduce((sum, e) => sum + e.actual_hours, 0)}h
                    </p>
                    <p className="text-xs text-muted-foreground">{t('workers.totalHours', 'Ukupno sati')}</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-primary">
                      {formatAmount(
                        selectedDateEntries.reduce((sum, e) => {
                          const w = getWorker(e.worker_id);
                          return sum + (w ? e.actual_hours * w.hourly_rate : 0);
                        }, 0)
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">{t('workers.totalCost', 'Ukupni trošak rada')}</p>
                  </div>
                </div>
              </Card>

              {/* Per-worker entries */}
              {selectedDateEntries.map((entry) => {
                const worker = getWorker(entry.worker_id);
                if (!worker) return null;
                const cost = entry.actual_hours * worker.hourly_rate;
                const diff = entry.actual_hours - entry.scheduled_hours;

                return (
                  <Card key={entry.id} className="p-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium">{worker.first_name} {worker.last_name}</span>
                        </div>
                        <Badge variant="outline" className="text-xs">{worker.position}</Badge>
                      </div>

                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{t('workers.scheduled', 'Plan')}: {entry.scheduled_hours}h</span>
                        </div>
                        <span>→</span>
                        <span>{t('workers.actual', 'Odrađeno')}: {entry.actual_hours}h</span>
                        {diff !== 0 && (
                          <Badge variant={diff > 0 ? "default" : "destructive"} className="text-xs">
                            {diff > 0 ? '+' : ''}{diff}h
                          </Badge>
                        )}
                      </div>

                      <div className="text-sm font-medium text-primary">
                        = {formatAmount(cost)}
                      </div>

                      {getMilestoneNames(entry.milestone_ids) && (
                        <div className="flex flex-wrap gap-1">
                          {getMilestoneNames(entry.milestone_ids)?.map((name, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              <Flag className="w-2.5 h-2.5 mr-1" />
                              {name}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {entry.note && (
                        <p className="text-xs text-muted-foreground flex items-start gap-1">
                          <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                          {entry.note}
                        </p>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
