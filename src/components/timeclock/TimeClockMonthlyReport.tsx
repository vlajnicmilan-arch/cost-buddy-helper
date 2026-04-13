import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TimeClockEntry } from '@/types/timeClock';
import { ProjectWorker } from '@/types/projectWorker';
import { useTranslation } from 'react-i18next';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDaysInMonth } from 'date-fns';
import { hr } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Download, Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface TimeClockMonthlyReportProps {
  projectId: string;
  workers: ProjectWorker[];
  fetchEntriesRange: (start: string, end: string) => Promise<TimeClockEntry[]>;
}

const LEGAL_COLUMNS = [
  'regular', 'overtime', 'night', 'sunday', 'holiday', 'standby', 'field',
  'annual_leave', 'sick_employer', 'sick_hzzo', 'paid_leave', 'unpaid_leave',
  'parental', 'pregnancy_complication', 'work_stoppage', 'break'
] as const;

interface WorkerMonthlySummary {
  workerId: string;
  workerName: string;
  days: Record<string, TimeClockEntry | null>;
  totals: Record<string, number>;
}

export const TimeClockMonthlyReport = ({
  projectId,
  workers,
  fetchEntriesRange
}: TimeClockMonthlyReportProps) => {
  const { t } = useTranslation();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [entries, setEntries] = useState<TimeClockEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>('all');

  const monthStart = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(currentMonth), 'yyyy-MM-dd');
  const daysInMonth = getDaysInMonth(currentMonth);
  const allDays = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const data = await fetchEntriesRange(monthStart, monthEnd);
      setEntries(data);
      setLoading(false);
    };
    load();
  }, [monthStart, monthEnd, fetchEntriesRange]);

  const filteredWorkers = selectedWorkerId === 'all' 
    ? workers 
    : workers.filter(w => w.id === selectedWorkerId);

  const summaries: WorkerMonthlySummary[] = filteredWorkers.map(worker => {
    const workerEntries = entries.filter(e => e.worker_id === worker.id);
    const days: Record<string, TimeClockEntry | null> = {};
    const totals: Record<string, number> = {};

    // Initialize totals
    LEGAL_COLUMNS.forEach(col => { totals[col] = 0; });
    totals.net_hours = 0;

    allDays.forEach(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const entry = workerEntries.find(e => e.work_date === dateStr) || null;
      days[dateStr] = entry;

      if (entry) {
        totals.regular += Number(entry.regular_hours);
        totals.overtime += Number(entry.overtime_hours);
        totals.night += Number(entry.night_hours);
        totals.sunday += Number(entry.sunday_hours);
        totals.holiday += Number(entry.holiday_hours);
        totals.standby += Number(entry.standby_hours);
        totals.field += Number(entry.field_hours);
        totals.break += Number(entry.break_minutes);
        totals.net_hours += Number(entry.net_hours);

        if (entry.absence_type) {
          totals[entry.absence_type] = (totals[entry.absence_type] || 0) + 1;
        }
      }
    });

    return {
      workerId: worker.id,
      workerName: `${worker.first_name} ${worker.last_name}`,
      days,
      totals
    };
  });

  const prevMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const exportCSV = () => {
    const header = [
      t('timeClock.worker', 'Radnik'),
      ...allDays.map(d => format(d, 'd')),
      t('timeClock.columns.regular', 'Redovni'),
      t('timeClock.columns.overtime', 'Prekovremeni'),
      t('timeClock.columns.night', 'Noćni'),
      t('timeClock.columns.sunday', 'Nedjelja'),
      t('timeClock.columns.holiday', 'Blagdan'),
      t('timeClock.columns.standby', 'Pripravnost'),
      t('timeClock.columns.field', 'Teren'),
      t('timeClock.absence.annual_leave', 'Godišnji'),
      t('timeClock.absence.sick_employer', 'Bolovanje (posl.)'),
      t('timeClock.absence.sick_hzzo', 'Bolovanje (HZZO)'),
      t('timeClock.totalHours', 'Ukupno sati')
    ];

    const rows = summaries.map(s => [
      s.workerName,
      ...allDays.map(d => {
        const entry = s.days[format(d, 'yyyy-MM-dd')];
        if (!entry) return '';
        if (entry.absence_type) return t(`timeClock.absence.${entry.absence_type}`, entry.absence_type).substring(0, 3);
        return String(Number(entry.net_hours));
      }),
      s.totals.regular,
      s.totals.overtime,
      s.totals.night,
      s.totals.sunday,
      s.totals.holiday,
      s.totals.standby,
      s.totals.field,
      s.totals.annual_leave || 0,
      s.totals.sick_employer || 0,
      s.totals.sick_hzzo || 0,
      s.totals.net_hours.toFixed(1)
    ]);

    const csv = [header, ...rows].map(r => r.join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sihterica_${format(currentMonth, 'yyyy-MM')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={prevMonth}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <span className="font-medium">
          {format(currentMonth, 'LLLL yyyy', { locale: hr })}
        </span>
        <Button variant="ghost" size="icon" onClick={nextMonth}>
          <ChevronRight className="w-5 h-5" />
        </Button>
      </div>

      {/* Filter + Export */}
      <div className="flex items-center gap-2">
        <Select value={selectedWorkerId} onValueChange={setSelectedWorkerId}>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder={t('timeClock.allWorkers', 'Svi radnici')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('timeClock.allWorkers', 'Svi radnici')}</SelectItem>
            {workers.map(w => (
              <SelectItem key={w.id} value={w.id}>
                {w.first_name} {w.last_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={exportCSV}>
          <Download className="w-4 h-4 mr-1" />
          CSV
        </Button>
      </div>

      {/* Monthly table */}
      <ScrollArea className="w-full">
        <div className="min-w-[800px]">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2 sticky left-0 bg-background z-10 min-w-[120px]">
                  {t('timeClock.worker', 'Radnik')}
                </th>
                {allDays.map(d => (
                  <th key={d.toISOString()} className="p-1 text-center min-w-[32px]">
                    <div>{format(d, 'd')}</div>
                    <div className="text-muted-foreground font-normal">
                      {format(d, 'EEEEE', { locale: hr })}
                    </div>
                  </th>
                ))}
                <th className="p-2 text-center bg-muted/30 min-w-[40px]">{t('timeClock.columns.regular', 'Red.')}</th>
                <th className="p-2 text-center bg-muted/30 min-w-[40px]">{t('timeClock.columns.overtime', 'Prek.')}</th>
                <th className="p-2 text-center bg-muted/30 min-w-[40px]">{t('timeClock.columns.night', 'Noć.')}</th>
                <th className="p-2 text-center bg-muted/30 min-w-[40px]">Σ</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map(s => (
                <tr key={s.workerId} className="border-b hover:bg-muted/20">
                  <td className="p-2 font-medium sticky left-0 bg-background z-10 truncate max-w-[120px]">
                    {s.workerName}
                  </td>
                  {allDays.map(d => {
                    const dateStr = format(d, 'yyyy-MM-dd');
                    const entry = s.days[dateStr];
                    const isSunday = d.getDay() === 0;

                    let cellContent = '';
                    let cellClass = '';

                    if (entry) {
                      if (entry.absence_type) {
                        const abbrevMap: Record<string, string> = {
                          annual_leave: 'GO',
                          sick_employer: 'BO',
                          sick_hzzo: 'BH',
                          paid_leave: 'PD',
                          unpaid_leave: 'ND',
                          parental: 'RD',
                          pregnancy_complication: 'KT',
                          work_stoppage: 'ZR'
                        };
                        cellContent = abbrevMap[entry.absence_type] || '—';
                        cellClass = 'text-destructive font-medium';
                      } else {
                        cellContent = String(Number(entry.net_hours));
                        if (Number(entry.overtime_hours) > 0) {
                          cellClass = 'text-orange-600 dark:text-orange-400 font-medium';
                        }
                      }
                    }

                    return (
                      <td
                        key={dateStr}
                        className={`p-1 text-center ${isSunday ? 'bg-muted/30' : ''} ${cellClass}`}
                      >
                        {cellContent}
                      </td>
                    );
                  })}
                  <td className="p-2 text-center font-medium bg-muted/30">{s.totals.regular.toFixed(0)}</td>
                  <td className="p-2 text-center font-medium bg-muted/30">{s.totals.overtime.toFixed(0)}</td>
                  <td className="p-2 text-center font-medium bg-muted/30">{s.totals.night.toFixed(0)}</td>
                  <td className="p-2 text-center font-bold bg-muted/30">{s.totals.net_hours.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ScrollArea>

      {summaries.length === 0 && (
        <p className="text-center text-muted-foreground py-4">
          {t('timeClock.noData', 'Nema podataka za ovaj mjesec')}
        </p>
      )}
    </div>
  );
};
