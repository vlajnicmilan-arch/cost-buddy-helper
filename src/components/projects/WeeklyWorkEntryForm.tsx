import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ProjectWorker } from '@/types/projectWorker';
import { ProjectMilestone } from '@/types/project';
import { useTranslation } from 'react-i18next';
import { format, startOfWeek, addDays, isSameDay } from 'date-fns';
import { hr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { CalendarIcon, Flag, Calendar as CalendarWeekIcon } from 'lucide-react';

interface WeeklyWorkEntryFormProps {
  worker: ProjectWorker;
  milestones: ProjectMilestone[];
  existingDates: string[];
  onSubmit: (entries: {
    work_date: string;
    scheduled_hours: number;
    actual_hours: number;
    milestone_ids: string[];
  }[]) => Promise<void>;
  onCancel: () => void;
}

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const WEEKDAY_LABELS_HR = ['Ponedjeljak', 'Utorak', 'Srijeda', 'Četvrtak', 'Petak', 'Subota', 'Nedjelja'];

export const WeeklyWorkEntryForm = ({
  worker,
  milestones,
  existingDates,
  onSubmit,
  onCancel
}: WeeklyWorkEntryFormProps) => {
  const { t } = useTranslation();
  
  // Calculate default hours from work times
  const getDefaultHours = () => {
    if (worker.work_start_time && worker.work_end_time) {
      const start = worker.work_start_time.split(':').map(Number);
      const end = worker.work_end_time.split(':').map(Number);
      return ((end[0] + end[1]/60) - (start[0] + start[1]/60)).toString();
    }
    return '8';
  };

  const [weekStart, setWeekStart] = useState<Date>(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [weekOpen, setWeekOpen] = useState(false);
  const [selectedDays, setSelectedDays] = useState<boolean[]>([true, true, true, true, true, false, false]);
  const [scheduledHours, setScheduledHours] = useState(getDefaultHours());
  const [actualHours, setActualHours] = useState(getDefaultHours());
  const [selectedMilestones, setSelectedMilestones] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Get dates for the selected week
  const weekDates = WEEKDAYS.map((_, index) => addDays(weekStart, index));

  // Check which dates already have entries
  const existingDatesSet = new Set(existingDates);
  const hasExistingEntry = (date: Date) => existingDatesSet.has(format(date, 'yyyy-MM-dd'));

  const toggleDay = (index: number) => {
    setSelectedDays(prev => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  };

  const toggleMilestone = (milestoneId: string) => {
    setSelectedMilestones(prev => {
      if (prev.includes(milestoneId)) {
        return prev.filter(id => id !== milestoneId);
      }
      if (prev.length >= 3) return prev;
      return [...prev, milestoneId];
    });
  };

  const handleSubmit = async () => {
    const entries = weekDates
      .filter((date, index) => selectedDays[index] && !hasExistingEntry(date))
      .map(date => ({
        work_date: format(date, 'yyyy-MM-dd'),
        scheduled_hours: parseFloat(scheduledHours) || 8,
        actual_hours: parseFloat(actualHours) || 8,
        milestone_ids: selectedMilestones
      }));

    if (entries.length === 0) return;

    setIsSubmitting(true);
    try {
      await onSubmit(entries);
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedCount = selectedDays.filter((selected, index) => 
    selected && !hasExistingEntry(weekDates[index])
  ).length;

  return (
    <Card className="p-4 space-y-4">
      <h4 className="font-medium flex items-center gap-2">
        <CalendarWeekIcon className="w-4 h-4" />
        {t('workers.weeklyEntry', 'Tjedni unos')}
      </h4>

      {/* Week Selector */}
      <div className="space-y-2">
        <Label>{t('workers.selectWeek', 'Odaberi tjedan')}</Label>
        <Popover open={weekOpen} onOpenChange={setWeekOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full justify-start text-left font-normal">
              <CalendarIcon className="mr-2 h-4 w-4" />
              {format(weekStart, 'd. MMM', { locale: hr })} - {format(addDays(weekStart, 6), 'd. MMM yyyy', { locale: hr })}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={weekStart}
              onSelect={(date) => {
                if (date) {
                  setWeekStart(startOfWeek(date, { weekStartsOn: 1 }));
                  setWeekOpen(false);
                }
              }}
              locale={hr}
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Day Selection */}
      <div className="space-y-2">
        <Label>{t('workers.selectDays', 'Odaberi dane')}</Label>
        <div className="grid grid-cols-1 gap-1">
          {WEEKDAYS.map((day, index) => {
            const date = weekDates[index];
            const exists = hasExistingEntry(date);
            
            return (
              <div 
                key={day}
                className={cn(
                  "flex items-center gap-2 p-2 rounded-md",
                  exists && "opacity-50 bg-muted"
                )}
              >
                <Checkbox
                  id={`day-${day}`}
                  checked={selectedDays[index]}
                  onCheckedChange={() => toggleDay(index)}
                  disabled={exists}
                />
                <label 
                  htmlFor={`day-${day}`}
                  className={cn(
                    "text-sm cursor-pointer flex-1",
                    exists && "line-through"
                  )}
                >
                  {WEEKDAY_LABELS_HR[index]} - {format(date, 'd.M.', { locale: hr })}
                </label>
                {exists && (
                  <span className="text-xs text-muted-foreground">
                    {t('workers.alreadyExists', 'Već postoji')}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Hours */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t('workers.scheduledHours', 'Planirano sati')}</Label>
          <Input
            type="number"
            step="0.5"
            min="0"
            max="24"
            value={scheduledHours}
            onChange={(e) => setScheduledHours(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>{t('workers.actualHours', 'Odrađeno sati')}</Label>
          <Input
            type="number"
            step="0.5"
            min="0"
            max="24"
            value={actualHours}
            onChange={(e) => setActualHours(e.target.value)}
          />
        </div>
      </div>

      {/* Milestone Selection */}
      {milestones.length > 0 && (
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Flag className="w-4 h-4" />
            {t('workers.milestones', 'Faze rada')} ({selectedMilestones.length}/3)
          </Label>
          <div className="space-y-2 max-h-24 overflow-y-auto">
            {milestones.map((milestone) => (
              <div key={milestone.id} className="flex items-center gap-2">
                <Checkbox
                  id={`week-milestone-${milestone.id}`}
                  checked={selectedMilestones.includes(milestone.id)}
                  onCheckedChange={() => toggleMilestone(milestone.id)}
                  disabled={!selectedMilestones.includes(milestone.id) && selectedMilestones.length >= 3}
                />
                <label 
                  htmlFor={`week-milestone-${milestone.id}`}
                  className={cn(
                    "text-sm cursor-pointer",
                    !selectedMilestones.includes(milestone.id) && selectedMilestones.length >= 3 && "opacity-50"
                  )}
                >
                  {milestone.name}
                </label>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <Button variant="outline" onClick={onCancel} className="flex-1">
          {t('common.cancel')}
        </Button>
        <Button 
          onClick={handleSubmit} 
          className="flex-1"
          disabled={selectedCount === 0 || isSubmitting}
        >
          {isSubmitting 
            ? t('common.saving', 'Spremanje...') 
            : t('workers.addDays', 'Dodaj {{count}} dana', { count: selectedCount })
          }
        </Button>
      </div>
    </Card>
  );
};
