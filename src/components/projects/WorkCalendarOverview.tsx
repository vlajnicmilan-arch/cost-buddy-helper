import { useState, useEffect, useCallback } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { ProjectMilestone } from '@/types/project';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useTranslation } from 'react-i18next';
import { format, parseISO, isSameDay } from 'date-fns';
import { hr } from 'date-fns/locale';
import { CalendarDays, Clock, User, Flag, AlertCircle, Loader2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

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
  work_start_time?: string | null;
  work_end_time?: string | null;
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

  // Add entry form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [addDate, setAddDate] = useState<Date | null>(null);
  const [selectedWorkerId, setSelectedWorkerId] = useState('');
  const [scheduledHours, setScheduledHours] = useState('8');
  const [actualHours, setActualHours] = useState('8');
  const [selectedMilestones, setSelectedMilestones] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
          .select('id, first_name, last_name, position, hourly_rate, work_start_time, work_end_time')
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

  const workDates = entries.map(e => parseISO(e.work_date));

  const selectedDateEntries = selectedDate
    ? entries.filter(e => isSameDay(parseISO(e.work_date), selectedDate))
    : [];

  const getWorker = (workerId: string) => workers.find(w => w.id === workerId);

  const getMilestoneNames = (milestoneIds: string[] | null | undefined) => {
    if (!milestoneIds || milestoneIds.length === 0) return null;
    return milestoneIds.map(id => milestones.find(m => m.id === id)?.name).filter(Boolean);
  };

  const uniqueWorkDates = new Set(entries.map(e => e.work_date)).size;
  const totalHours = entries.reduce((sum, e) => sum + e.actual_hours, 0);

  const handleDayClick = (day: Date) => {
    const hasEntries = entries.some(e => isSameDay(parseISO(e.work_date), day));
    if (hasEntries) {
      setSelectedDate(day);
    }
  };

  // Add entry helpers
  const getDefaultHours = (worker: Worker | undefined) => {
    if (worker?.work_start_time && worker?.work_end_time) {
      const start = worker.work_start_time.split(':').map(Number);
      const end = worker.work_end_time.split(':').map(Number);
      return ((end[0] + end[1] / 60) - (start[0] + start[1] / 60)).toString();
    }
    return '8';
  };

  const openAddForm = (date?: Date) => {
    setAddDate(date || new Date());
    setSelectedWorkerId('');
    setScheduledHours('8');
    setActualHours('8');
    setSelectedMilestones([]);
    setNote('');
    setShowAddForm(true);
  };

  const handleWorkerChange = (workerId: string) => {
    setSelectedWorkerId(workerId);
    const worker = workers.find(w => w.id === workerId);
    const hours = getDefaultHours(worker);
    setScheduledHours(hours);
    setActualHours(hours);
  };

  const toggleMilestone = (milestoneId: string) => {
    setSelectedMilestones(prev => {
      if (prev.includes(milestoneId)) return prev.filter(id => id !== milestoneId);
      if (prev.length >= 3) return prev;
      return [...prev, milestoneId];
    });
  };

  const handleAddSubmit = async () => {
    if (!selectedWorkerId || !addDate) return;

    const dateStr = format(addDate, 'yyyy-MM-dd');
    const alreadyExists = entries.some(
      e => e.worker_id === selectedWorkerId && e.work_date === dateStr
    );
    if (alreadyExists) {
      toast.error(t('workers.entryExists', 'Unos za ovaj datum već postoji'));
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase
        .from('project_work_entries')
        .insert({
          worker_id: selectedWorkerId,
          project_id: projectId,
          work_date: dateStr,
          scheduled_hours: parseFloat(scheduledHours) || 8,
          actual_hours: parseFloat(actualHours) || 8,
          milestone_ids: selectedMilestones,
          note: note.trim() || null
        })
        .select()
        .single();

      if (error) throw error;

      setEntries(prev => [...prev, {
        ...data,
        scheduled_hours: Number(data.scheduled_hours),
        actual_hours: Number(data.actual_hours)
      }]);

      toast.success(t('workers.entryAdded', 'Radni dan dodan'));
      setShowAddForm(false);
    } catch (error: any) {
      if (error.code === '23505') {
        toast.error(t('workers.entryExists', 'Unos za ovaj datum već postoji'));
      } else {
        console.error('Error adding entry:', error);
        toast.error(t('common.error'));
      }
    } finally {
      setIsSubmitting(false);
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

      {/* Add button */}
      {workers.length > 0 && (
        <Button onClick={() => openAddForm()} className="w-full" variant="outline">
          <Plus className="w-4 h-4 mr-2" />
          {t('workers.addWorkDay', 'Dodaj radni dan')}
        </Button>
      )}

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

      {/* Add Entry Dialog */}
      <Dialog open={showAddForm} onOpenChange={setShowAddForm}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto" showBackButton>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              {t('workers.addWorkDay', 'Dodaj radni dan')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Date picker */}
            <div className="space-y-2">
              <Label>{t('workers.date', 'Datum')}</Label>
              <Card className="p-1 flex justify-center">
                <Calendar
                  mode="single"
                  selected={addDate || undefined}
                  onSelect={(day) => day && setAddDate(day)}
                  locale={hr}
                  className="p-2 pointer-events-auto"
                />
              </Card>
              {addDate && (
                <p className="text-sm font-medium text-center">
                  {format(addDate, 'EEEE, d. MMMM yyyy', { locale: hr })}
                </p>
              )}
            </div>

            {/* Worker select */}
            <div className="space-y-2">
              <Label>{t('workers.worker', 'Djelatnik')}</Label>
              <Select value={selectedWorkerId} onValueChange={handleWorkerChange}>
                <SelectTrigger>
                  <SelectValue placeholder={t('workers.selectWorker', 'Odaberi djelatnika')} />
                </SelectTrigger>
                <SelectContent>
                  {workers.map(w => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.first_name} {w.last_name} — {w.position}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

            {/* Milestones */}
            {milestones.length > 0 && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Flag className="w-4 h-4" />
                  {t('workers.milestones', 'Faze rada')} ({selectedMilestones.length}/3)
                </Label>
                <div className="space-y-2 max-h-28 overflow-y-auto">
                  {milestones.map((milestone) => (
                    <div key={milestone.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`cal-milestone-${milestone.id}`}
                        checked={selectedMilestones.includes(milestone.id)}
                        onCheckedChange={() => toggleMilestone(milestone.id)}
                        disabled={!selectedMilestones.includes(milestone.id) && selectedMilestones.length >= 3}
                      />
                      <label
                        htmlFor={`cal-milestone-${milestone.id}`}
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

            {/* Note */}
            <div className="space-y-2">
              <Label>{t('workers.note', 'Napomena')}</Label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t('workers.notePlaceholder', 'Opcionalna napomena...')}
                rows={2}
              />
            </div>

            {/* Submit */}
            <Button
              onClick={handleAddSubmit}
              className="w-full"
              disabled={!selectedWorkerId || !addDate || isSubmitting}
            >
              {isSubmitting
                ? t('common.saving', 'Spremanje...')
                : t('workers.addWorkDay', 'Dodaj radni dan')
              }
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
