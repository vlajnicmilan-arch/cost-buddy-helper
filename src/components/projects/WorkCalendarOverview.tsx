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

  // Inline add form state (inside detail dialog)
  const [showAddForm, setShowAddForm] = useState(false);
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

  // Now any date can be clicked — not just dates with entries
  const handleDayClick = (day: Date) => {
    setSelectedDate(day);
    setShowAddForm(false);
    resetAddForm();
  };

  const resetAddForm = () => {
    setSelectedWorkerId('');
    setScheduledHours('8');
    setActualHours('8');
    setSelectedMilestones([]);
    setNote('');
  };

  const getDefaultHours = (worker: Worker | undefined) => {
    if (worker?.work_start_time && worker?.work_end_time) {
      const start = worker.work_start_time.split(':').map(Number);
      const end = worker.work_end_time.split(':').map(Number);
      return ((end[0] + end[1] / 60) - (start[0] + start[1] / 60)).toString();
    }
    return '8';
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
    if (!selectedWorkerId || !selectedDate) return;

    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const alreadyExists = entries.some(
      e => e.worker_id === selectedWorkerId && e.work_date === dateStr
    );
    if (alreadyExists) {
      toast.error(t('workers.entryExists', 'Unos za ovog djelatnika na ovaj datum već postoji'));
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
      resetAddForm();
    } catch (error: any) {
      if (error.code === '23505') {
        toast.error(t('workers.entryExists', 'Unos za ovog djelatnika na ovaj datum već postoji'));
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
        {t('workers.calendarHint', 'Kliknite na datum za detalje ili dodavanje zapisa')}
      </p>

      {/* Day Detail Dialog */}
      <Dialog open={!!selectedDate} onOpenChange={(open) => { if (!open) { setSelectedDate(null); setShowAddForm(false); resetAddForm(); } }}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto" showBackButton>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5" />
              {selectedDate && format(selectedDate, 'EEEE, d. MMMM yyyy', { locale: hr })}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {/* Existing entries for this date */}
            {selectedDateEntries.length > 0 && (
              <>
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
              </>
            )}

            {selectedDateEntries.length === 0 && !showAddForm && (
              <p className="text-sm text-muted-foreground text-center py-2">
                {t('workers.noEntriesForDate', 'Nema zapisa za ovaj datum')}
              </p>
            )}

            {/* Add entry section */}
            {!showAddForm ? (
              workers.length > 0 && (
                <Button onClick={() => setShowAddForm(true)} variant="outline" className="w-full" size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  {t('workers.addWorkDay', 'Dodaj radni dan')}
                </Button>
              )
            ) : (
              <Card className="p-3 border-primary/30 space-y-3">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  {t('workers.addWorkDay', 'Dodaj radni dan')}
                </h4>

                {/* Worker select */}
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('workers.worker', 'Djelatnik')}</Label>
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
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('workers.scheduledHours', 'Planirano sati')}</Label>
                    <Input
                      type="number"
                      step="0.5"
                      min="0"
                      max="24"
                      value={scheduledHours}
                      onChange={(e) => setScheduledHours(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('workers.actualHours', 'Odrađeno sati')}</Label>
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
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1">
                      <Flag className="w-3.5 h-3.5" />
                      {t('workers.milestones', 'Faze rada')} ({selectedMilestones.length}/3)
                    </Label>
                    <div className="space-y-1.5 max-h-24 overflow-y-auto">
                      {milestones.map((milestone) => (
                        <div key={milestone.id} className="flex items-center gap-2">
                          <Checkbox
                            id={`cal-add-ms-${milestone.id}`}
                            checked={selectedMilestones.includes(milestone.id)}
                            onCheckedChange={() => toggleMilestone(milestone.id)}
                            disabled={!selectedMilestones.includes(milestone.id) && selectedMilestones.length >= 3}
                          />
                          <label
                            htmlFor={`cal-add-ms-${milestone.id}`}
                            className={cn(
                              "text-xs cursor-pointer",
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
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('workers.note', 'Napomena')}</Label>
                  <Textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={t('workers.notePlaceholder', 'Opcionalna napomena...')}
                    rows={2}
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => { setShowAddForm(false); resetAddForm(); }}>
                    {t('common.cancel', 'Odustani')}
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={handleAddSubmit}
                    disabled={!selectedWorkerId || isSubmitting}
                  >
                    {isSubmitting ? t('common.saving', 'Spremanje...') : t('common.add', 'Dodaj')}
                  </Button>
                </div>
              </Card>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
