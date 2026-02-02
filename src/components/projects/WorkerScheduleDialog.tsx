import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useProjectWorkEntries } from '@/hooks/useProjectWorkEntries';
import { useProjectMilestones } from '@/hooks/useProjectMilestones';
import { ProjectWorker, ProjectWorkEntry } from '@/types/projectWorker';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useTranslation } from 'react-i18next';
import { format, parseISO } from 'date-fns';
import { hr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { 
  CalendarIcon, Plus, Clock, Pencil, Trash2, 
  ChevronDown, ChevronUp, AlertCircle, Flag, Calendar as CalendarWeekIcon
} from 'lucide-react';
import { WeeklyWorkEntryForm } from './WeeklyWorkEntryForm';

interface WorkerScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  worker: ProjectWorker;
  projectId: string;
  isManager: boolean;
}

export const WorkerScheduleDialog = ({
  open,
  onOpenChange,
  worker,
  projectId,
  isManager
}: WorkerScheduleDialogProps) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const { 
    entries, 
    loading, 
    addEntry,
    addMultipleEntries,
    updateEntry, 
    deleteEntry,
    totalActualHours,
    refetch
  } = useProjectWorkEntries(worker.id, projectId);

  const { milestones } = useProjectMilestones(projectId);

  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [scheduledHours, setScheduledHours] = useState('8');
  const [actualHours, setActualHours] = useState('8');
  const [note, setNote] = useState('');
  const [selectedMilestones, setSelectedMilestones] = useState<string[]>([]);
  const [editingEntry, setEditingEntry] = useState<ProjectWorkEntry | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showWeeklyForm, setShowWeeklyForm] = useState(false);

  // Calculate default scheduled hours from work times
  useEffect(() => {
    if (worker.work_start_time && worker.work_end_time) {
      const start = worker.work_start_time.split(':').map(Number);
      const end = worker.work_end_time.split(':').map(Number);
      const hours = (end[0] + end[1]/60) - (start[0] + start[1]/60);
      setScheduledHours(hours.toString());
      setActualHours(hours.toString());
    }
  }, [worker]);

  const handleAddEntry = async () => {
    if (!selectedDate) return;

    const result = await addEntry({
      work_date: format(selectedDate, 'yyyy-MM-dd'),
      scheduled_hours: parseFloat(scheduledHours) || 8,
      actual_hours: parseFloat(actualHours) || 8,
      note: note || undefined,
      milestone_ids: selectedMilestones
    });

    if (result) {
      setShowAddForm(false);
      setNote('');
      setSelectedMilestones([]);
      // Reset to default hours
      if (worker.work_start_time && worker.work_end_time) {
        const start = worker.work_start_time.split(':').map(Number);
        const end = worker.work_end_time.split(':').map(Number);
        const hours = (end[0] + end[1]/60) - (start[0] + start[1]/60);
        setScheduledHours(hours.toString());
        setActualHours(hours.toString());
      }
    }
  };

  const handleUpdateEntry = async () => {
    if (!editingEntry) return;

    await updateEntry({
      ...editingEntry,
      scheduled_hours: parseFloat(scheduledHours) || 8,
      actual_hours: parseFloat(actualHours) || 8,
      note: note || null,
      milestone_ids: selectedMilestones
    });

    setEditingEntry(null);
    setNote('');
    setSelectedMilestones([]);
  };

  const handleStartEdit = (entry: ProjectWorkEntry) => {
    setEditingEntry(entry);
    setScheduledHours(entry.scheduled_hours.toString());
    setActualHours(entry.actual_hours.toString());
    setNote(entry.note || '');
    setSelectedMilestones(entry.milestone_ids || []);
    setShowAddForm(false);
  };

  const handleCancelEdit = () => {
    setEditingEntry(null);
    setNote('');
    setSelectedMilestones([]);
    // Reset to default hours
    if (worker.work_start_time && worker.work_end_time) {
      const start = worker.work_start_time.split(':').map(Number);
      const end = worker.work_end_time.split(':').map(Number);
      const hours = (end[0] + end[1]/60) - (start[0] + start[1]/60);
      setScheduledHours(hours.toString());
      setActualHours(hours.toString());
    }
  };

  const toggleMilestone = (milestoneId: string) => {
    setSelectedMilestones(prev => {
      if (prev.includes(milestoneId)) {
        return prev.filter(id => id !== milestoneId);
      }
      if (prev.length >= 3) {
        return prev; // Max 3 milestones
      }
      return [...prev, milestoneId];
    });
  };

  const getMilestoneNames = (milestoneIds: string[] | null | undefined) => {
    if (!milestoneIds || milestoneIds.length === 0) return null;
    return milestoneIds
      .map(id => milestones.find(m => m.id === id)?.name)
      .filter(Boolean);
  };

  // Get dates that have entries for calendar highlighting
  const entryDates = entries.map(e => e.work_date);
  
  const totalEarnings = totalActualHours * worker.hourly_rate;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" showBackButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            {worker.first_name} {worker.last_name}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{worker.position}</p>
        </DialogHeader>

        {/* Summary */}
        <Card className="p-4 bg-muted/50">
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold">{totalActualHours}</p>
              <p className="text-xs text-muted-foreground">{t('workers.totalHours', 'Ukupno sati')}</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-primary">{formatAmount(totalEarnings)}</p>
              <p className="text-xs text-muted-foreground">{t('workers.totalEarnings', 'Ukupna zarada')}</p>
            </div>
          </div>
          {worker.work_start_time && worker.work_end_time && (
            <div className="mt-3 pt-3 border-t text-center text-sm text-muted-foreground">
              {t('workers.schedule', 'Radno vrijeme')}: {worker.work_start_time?.slice(0, 5)} - {worker.work_end_time?.slice(0, 5)}
            </div>
          )}
        </Card>

        {/* Add buttons */}
        <div className="flex gap-2">
          <Button 
            variant={showAddForm ? "secondary" : "default"}
            onClick={() => { 
              setShowAddForm(!showAddForm); 
              setEditingEntry(null); 
              setShowWeeklyForm(false);
            }}
            className="flex-1"
          >
            {showAddForm ? (
              <>
                <ChevronUp className="w-4 h-4 mr-2" />
                {t('common.cancel')}
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" />
                {t('workers.addDay', 'Jedan dan')}
              </>
            )}
          </Button>
          <Button 
            variant={showWeeklyForm ? "secondary" : "outline"}
            onClick={() => { 
              setShowWeeklyForm(!showWeeklyForm); 
              setEditingEntry(null); 
              setShowAddForm(false);
            }}
            className="flex-1"
          >
            {showWeeklyForm ? (
              <>
                <ChevronUp className="w-4 h-4 mr-2" />
                {t('common.cancel')}
              </>
            ) : (
              <>
                <CalendarWeekIcon className="w-4 h-4 mr-2" />
                {t('workers.addWeek', 'Cijeli tjedan')}
              </>
            )}
          </Button>
        </div>

        {/* Weekly Entry Form */}
        {showWeeklyForm && (
          <WeeklyWorkEntryForm
            worker={worker}
            milestones={milestones}
            existingDates={entries.map(e => e.work_date)}
            onSubmit={async (newEntries) => {
              const success = await addMultipleEntries(newEntries);
              if (success) {
                setShowWeeklyForm(false);
              }
            }}
            onCancel={() => setShowWeeklyForm(false)}
          />
        )}

        {/* Add/Edit Form */}
        {(showAddForm || editingEntry) && (
          <Card className="p-4 space-y-4">
            <h4 className="font-medium">
              {editingEntry 
                ? t('workers.editWorkDay', 'Uredi radni dan') 
                : t('workers.addWorkDay', 'Dodaj radni dan')
              }
            </h4>

            {!editingEntry && (
              <div className="space-y-2">
                <Label>{t('workers.date', 'Datum')}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !selectedDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {selectedDate 
                        ? format(selectedDate, 'd. MMMM yyyy', { locale: hr })
                        : t('workers.selectDate', 'Odaberi datum')
                      }
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={setSelectedDate}
                      locale={hr}
                      className="p-3 pointer-events-auto"
                      modifiers={{ hasEntry: entryDates.map(d => parseISO(d)) }}
                      modifiersStyles={{
                        hasEntry: { 
                          backgroundColor: 'hsl(var(--primary) / 0.2)',
                          borderRadius: '50%'
                        }
                      }}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            )}

            {editingEntry && (
              <div className="text-sm text-muted-foreground">
                {format(parseISO(editingEntry.work_date), 'd. MMMM yyyy', { locale: hr })}
              </div>
            )}

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
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {milestones.map((milestone) => (
                    <div 
                      key={milestone.id}
                      className="flex items-center gap-2"
                    >
                      <Checkbox
                        id={`milestone-${milestone.id}`}
                        checked={selectedMilestones.includes(milestone.id)}
                        onCheckedChange={() => toggleMilestone(milestone.id)}
                        disabled={!selectedMilestones.includes(milestone.id) && selectedMilestones.length >= 3}
                      />
                      <label 
                        htmlFor={`milestone-${milestone.id}`}
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

            <div className="space-y-2">
              <Label>{t('workers.note', 'Napomena')} ({t('common.optional', 'opcionalno')})</Label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t('workers.notePlaceholder', 'npr. Prekovremeni rad, bolovanje...')}
                rows={2}
              />
            </div>

            <div className="flex gap-2">
              {editingEntry ? (
                <>
                  <Button variant="outline" onClick={handleCancelEdit} className="flex-1">
                    {t('common.cancel')}
                  </Button>
                  <Button onClick={handleUpdateEntry} className="flex-1">
                    {t('common.save')}
                  </Button>
                </>
              ) : (
                <Button onClick={handleAddEntry} className="w-full">
                  {t('common.add')}
                </Button>
              )}
            </div>
          </Card>
        )}

        {/* Entries List */}
        <div className="space-y-2">
          <h4 className="font-medium">{t('workers.workDays', 'Radni dani')}</h4>
          
          {entries.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <CalendarIcon className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">{t('workers.noEntries', 'Nema unesenih radnih dana')}</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {entries.map((entry) => {
                const difference = entry.actual_hours - entry.scheduled_hours;
                const hasDifference = difference !== 0;
                const entryCost = entry.actual_hours * worker.hourly_rate;
                
                return (
                  <Card key={entry.id} className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">
                            {format(parseISO(entry.work_date), 'EEEE, d.M.yyyy', { locale: hr })}
                          </span>
                          {hasDifference && (
                            <Badge 
                              variant={difference > 0 ? "default" : "destructive"}
                              className="text-xs"
                            >
                              {difference > 0 ? '+' : ''}{difference}h
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                          <span>{t('workers.scheduled', 'Plan')}: {entry.scheduled_hours}h</span>
                          <span>{t('workers.actual', 'Odrađeno')}: {entry.actual_hours}h</span>
                          <span className="text-primary font-medium">= {formatAmount(entryCost)}</span>
                        </div>
                        {getMilestoneNames(entry.milestone_ids) && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {getMilestoneNames(entry.milestone_ids)?.map((name, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                <Flag className="w-2.5 h-2.5 mr-1" />
                                {name}
                              </Badge>
                            ))}
                          </div>
                        )}
                        {entry.note && (
                          <p className="text-xs text-muted-foreground mt-1 flex items-start gap-1">
                            <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                            {entry.note}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8"
                          onClick={() => handleStartEdit(entry)}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        {isManager && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8"
                            onClick={() => deleteEntry(entry.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
