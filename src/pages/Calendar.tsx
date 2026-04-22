import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Plus, Download } from 'lucide-react';
import { downloadCalendarEventsICS } from '@/lib/icsExport';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { Button } from '@/components/ui/button';
import { ExportButton } from '@/components/ui/export-button';
import { cn } from '@/lib/utils';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { hr } from 'date-fns/locale';
import { useCalendarEvents, CalendarEvent } from '@/hooks/useCalendarEvents';
import { CalendarEventDialog } from '@/components/calendar/CalendarEventDialog';
import { CalendarDayDetail } from '@/components/calendar/CalendarDayDetail';
import { BottomNav } from '@/components/BottomNav';
import { PageHeader } from '@/components/PageHeader';
import { getHolidays } from '@/lib/holidays';

const Calendar = () => {
  const { t, i18n } = useTranslation();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [addEventOpen, setAddEventOpen] = useState(false);
  const [addEventDate, setAddEventDate] = useState<string | undefined>();

  const { eventsByDate, loading, addReminder, deleteReminder, toggleReminderComplete } = useCalendarEvents(currentMonth);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = (new Date(year, month, 1).getDay() + 6) % 7;

  const monthName = format(currentMonth, 'LLLL yyyy', { locale: hr });

  // Get holidays for current year (and next year if needed for Dec/Jan edge)
  const holidays = useMemo(() => getHolidays(year, i18n.language), [year, i18n.language]);

  // Merge holidays into eventsByDate
  const mergedEventsByDate = useMemo(() => {
    const merged: Record<string, CalendarEvent[]> = { ...eventsByDate };
    holidays.forEach((name, dateKey) => {
      if (!merged[dateKey]) merged[dateKey] = [];
      // Avoid duplicates
      if (!merged[dateKey].some(e => e.source === 'holiday')) {
        merged[dateKey].push({
          id: `holiday-${dateKey}`,
          title: name,
          date: dateKey,
          type: 'holiday',
          source: 'holiday',
          description: t('calendar.publicHoliday', 'Državni praznik'),
        });
      }
    });
    return merged;
  }, [eventsByDate, holidays, t]);

  const dayNames = useMemo(() => {
    return ['Po', 'Ut', 'Sr', 'Če', 'Pe', 'Su', 'Ne'];
  }, []);

  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');
  const isToday = (day: number) =>
    day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));

  const getDateKey = (day: number) => format(new Date(year, month, day), 'yyyy-MM-dd');

  // Check if a day is Sunday (index 6 in Mon-first week)
  const isSunday = (day: number) => {
    return (firstDayOfWeek + day - 1) % 7 === 6;
  };

  const getDotTypes = (day: number): string[] => {
    const dateKey = getDateKey(day);
    const events = mergedEventsByDate[dateKey] || [];
    const types = new Set<string>();
    events.forEach(e => {
      if (e.source === 'holiday') types.add('holiday');
      else if (e.source === 'expense' && e.type === 'income') types.add('income');
      else if (e.source === 'expense') types.add('expense');
      else if (e.type === 'deadline') types.add('deadline');
      else if (e.source === 'recurring') types.add('recurring');
      else types.add('event');
    });
    return Array.from(types);
  };

  const dotColorMap: Record<string, string> = {
    expense: 'bg-red-500',
    income: 'bg-green-500',
    event: 'bg-orange-400',
    deadline: 'bg-red-600',
    recurring: 'bg-blue-400',
    holiday: 'bg-purple-500',
  };

  const handleDayClick = (day: number) => {
    const dateKey = getDateKey(day);
    setSelectedDate(dateKey);
  };

  const handleAddEvent = (day?: number) => {
    setAddEventDate(day ? getDateKey(day) : format(new Date(), 'yyyy-MM-dd'));
    setAddEventOpen(true);
  };

  const selectedEvents = selectedDate ? (mergedEventsByDate[selectedDate] || []) : [];

  // Check if a day has a holiday
  const isHoliday = (day: number) => holidays.has(getDateKey(day));

  return (
    <div className="min-h-dvh bg-background pb-24">
      <PageHeader title={t('calendar.title', 'Kalendar')} />

      <div className="max-w-lg mx-auto px-4 pt-4">
        {/* Month navigation */}
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" size="icon" onClick={prevMonth}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <h2 className="text-lg font-semibold capitalize">{monthName}</h2>
          <div className="flex items-center gap-1">
            <ExportButton
              label=""
              icon={<Download className="w-4 h-4" />}
              variant="ghost"
              size="icon"
              compact
              onExport={async (mode) => {
                const allEvents = Object.values(mergedEventsByDate).flat().filter(e => e.source !== 'holiday');
                if (!allEvents.length) return;
                try {
                  await downloadCalendarEventsICS(
                    allEvents.map(e => ({ id: e.id, title: e.title, description: e.description, date: e.date, amount: e.amount, type: e.type, source: e.source })),
                    `kalendar-${format(currentMonth, 'yyyy-MM')}.ics`,
                    mode
                  );
                  showSuccess(t('calendar.monthExported', 'Mjesec izvezen'));
                } catch { showError('Greška'); }
              }}
            />
            <Button variant="ghost" size="icon" onClick={nextMonth}>
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Day names */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {dayNames.map((name, i) => (
            <div
              key={i}
              className={cn(
                "text-center text-[10px] font-medium py-1",
                i === 6 ? "text-red-400" : i === 5 ? "text-muted-foreground/60" : "text-muted-foreground"
              )}
            >
              {name}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <motion.div
          key={`${year}-${month}`}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2 }}
          className="grid grid-cols-7 gap-1"
        >
          {Array.from({ length: firstDayOfWeek }).map((_, i) => (
            <div key={`e-${i}`} className="aspect-square" />
          ))}

          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dateKey = getDateKey(day);
            const dots = getDotTypes(day);
            const isSelected = selectedDate === dateKey;
            const sunday = isSunday(day);
            const holiday = isHoliday(day);

            return (
              <button
                key={day}
                onClick={() => handleDayClick(day)}
                className={cn(
                  "aspect-square rounded-xl flex flex-col items-center justify-center relative transition-all",
                  "hover:ring-1 hover:ring-primary/40 active:scale-95",
                  isToday(day) && "ring-1 ring-primary",
                  isSelected && "ring-2 ring-primary bg-primary/10",
                  !isSelected && !isToday(day) && "bg-muted/20",
                  holiday && !isSelected && "bg-red-500/5 dark:bg-red-500/10"
                )}
              >
                <span className={cn(
                  "text-sm font-medium leading-none",
                  isToday(day) && "text-primary font-bold",
                  sunday && !isToday(day) && "text-red-400",
                  holiday && !isToday(day) && !sunday && "text-red-400/80"
                )}>
                  {day}
                </span>

                {/* Dots */}
                {dots.length > 0 && (
                  <div className="flex items-center gap-0.5 mt-1 absolute bottom-1">
                    {dots.slice(0, 3).map((type, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          "w-2 h-2 rounded-full ring-1 ring-background",
                          dotColorMap[type] || 'bg-muted-foreground'
                        )}
                      />
                    ))}
                    {dots.length > 3 && (
                      <span className="text-[7px] text-muted-foreground">+</span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </motion.div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 mt-4 justify-center">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-[10px] text-muted-foreground">{t('dashboard.expenses', 'Troškovi')}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-[10px] text-muted-foreground">{t('dashboard.income', 'Prihodi')}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-orange-400" />
            <span className="text-[10px] text-muted-foreground">{t('calendar.event', 'Događaj')}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-blue-400" />
            <span className="text-[10px] text-muted-foreground">{t('calendar.recurring', 'Ponavljajuća')}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-purple-500" />
            <span className="text-[10px] text-muted-foreground">{t('calendar.holiday', 'Praznik')}</span>
          </div>
        </div>
      </div>

      {/* FAB */}
      <button
        onClick={() => handleAddEvent()}
        className="fixed bottom-20 right-4 z-40 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center active:scale-95 transition-transform"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* Day detail sheet */}
      {selectedDate && (
        <CalendarDayDetail
          open={!!selectedDate}
          onOpenChange={(open) => { if (!open) setSelectedDate(null); }}
          date={selectedDate}
          events={selectedEvents}
          onToggleComplete={toggleReminderComplete}
          onDelete={deleteReminder}
        />
      )}

      {/* Add event dialog */}
      <CalendarEventDialog
        open={addEventOpen}
        onOpenChange={setAddEventOpen}
        onSave={addReminder}
        defaultDate={addEventDate}
      />

      <BottomNav />
    </div>
  );
};

export default Calendar;
