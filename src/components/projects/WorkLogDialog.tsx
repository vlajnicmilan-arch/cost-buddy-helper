import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, Loader2, BookOpen } from 'lucide-react';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { VoiceInputButton } from '@/components/VoiceInputButton';
import type { ProjectMilestone } from '@/types/project';
import type { ProjectWorkLog, ProjectWorkLogInput, WorkLogDayType } from '@/types/projectWorkLog';

interface WorkLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  milestones: ProjectMilestone[];
  /** Existing log for edit mode; null/undefined for create */
  log?: ProjectWorkLog | null;
  /** Pre-selected date when creating from a calendar/quick action */
  defaultDate?: string;
  /** Pre-selected milestone */
  defaultMilestoneId?: string | null;
  onSubmit: (input: ProjectWorkLogInput) => Promise<boolean>;
}

export const WorkLogDialog = ({
  open,
  onOpenChange,
  milestones,
  log,
  defaultDate,
  defaultMilestoneId,
  onSubmit,
}: WorkLogDialogProps) => {
  const { t } = useTranslation();

  const [logDate, setLogDate] = useState<Date>(new Date());
  const [milestoneId, setMilestoneId] = useState<string>('none');
  const [weather, setWeather] = useState('');
  const [summary, setSummary] = useState('');
  const [notes, setNotes] = useState('');
  const [hours, setHours] = useState<string>('');
  const [dayType, setDayType] = useState<WorkLogDayType>('work');
  const [clockIn, setClockIn] = useState<string>('');
  const [clockOut, setClockOut] = useState<string>('');
  const [saving, setSaving] = useState(false);

  // Hydrate state when dialog opens or log changes
  useEffect(() => {
    if (!open) return;
    if (log) {
      setLogDate(new Date(log.log_date));
      setMilestoneId(log.milestone_id || 'none');
      setWeather(log.weather || '');
      setSummary(log.summary || '');
      setNotes(log.notes || '');
      setHours(log.hours != null ? String(log.hours) : '');
      setDayType((log.day_type as WorkLogDayType) || 'work');
      setClockIn(log.clock_in_time || '');
      setClockOut(log.clock_out_time || '');
    } else {
      setLogDate(defaultDate ? new Date(defaultDate) : new Date());
      setMilestoneId(defaultMilestoneId || 'none');
      setWeather('');
      setSummary('');
      setNotes('');
      setHours('');
      setDayType('work');
      setClockIn('');
      setClockOut('');
    }
  }, [open, log, defaultDate, defaultMilestoneId]);

  const isAbsence = dayType !== 'work';

  const handleSubmit = async () => {
    // For absence days, summary is auto-generated if missing
    const finalSummary = summary.trim() || (isAbsence ? t(`workLog.dayType.${dayType}`, dayType) : '');
    if (!finalSummary) return;
    const parsedHours = hours.trim() === '' ? null : Number(hours);
    if (parsedHours != null && (isNaN(parsedHours) || parsedHours < 0 || parsedHours > 24)) return;
    setSaving(true);
    const ok = await onSubmit({
      log_date: format(logDate, 'yyyy-MM-dd'),
      milestone_id: milestoneId === 'none' ? null : milestoneId,
      weather: isAbsence ? null : (weather.trim() || null),
      summary: finalSummary,
      notes: notes.trim() || null,
      hours: isAbsence ? null : parsedHours,
      day_type: dayType,
      clock_in_time: isAbsence ? null : (clockIn.trim() || null),
      clock_out_time: isAbsence ? null : (clockOut.trim() || null),
    });
    setSaving(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            {log
              ? t('workLog.editTitle', 'Uredi dnevni zapis')
              : t('workLog.newTitle', 'Novi dnevni zapis')}
          </DialogTitle>
          <DialogDescription>
            {t('workLog.subtitle', 'Zapiši što je danas rađeno na projektu — sati radnika se automatski povezuju.')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Date */}
          <div className="space-y-1.5">
            <Label>{t('workLog.date', 'Datum')}</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn('w-full justify-start text-left font-normal', !logDate && 'text-muted-foreground')}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {logDate ? format(logDate, 'PPP', { locale: hr }) : <span>{t('workLog.pickDate', 'Odaberi datum')}</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={logDate}
                  onSelect={(d) => d && setLogDate(d)}
                  initialFocus
                  className={cn('p-3 pointer-events-auto')}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Day type */}
          <div className="space-y-1.5">
            <Label>{t('workLog.dayTypeLabel', 'Tip dana')}</Label>
            <Select value={dayType} onValueChange={(v) => setDayType(v as WorkLogDayType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[80]">
                <SelectItem value="work">{t('workLog.dayType.work', 'Radni dan')}</SelectItem>
                <SelectItem value="weekend">{t('workLog.dayType.weekend', 'Vikend / neradan')}</SelectItem>
                <SelectItem value="vacation">{t('workLog.dayType.vacation', 'Godišnji odmor')}</SelectItem>
                <SelectItem value="sick">{t('workLog.dayType.sick', 'Bolovanje')}</SelectItem>
                <SelectItem value="holiday">{t('workLog.dayType.holiday', 'Praznik')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {milestones.length > 0 && (
            <div className="space-y-1.5">
              <Label>{t('workLog.milestone', 'Faza (opcionalno)')}</Label>
              <Select value={milestoneId} onValueChange={setMilestoneId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('workLog.noMilestone', 'Bez faze')} />
                </SelectTrigger>
                <SelectContent className="z-[80]">
                  <SelectItem value="none">{t('workLog.noMilestone', 'Bez faze')}</SelectItem>
                  {milestones.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Hours */}
          <div className="space-y-1.5">
            <Label htmlFor="worklog-hours">{t('workLog.hours', 'Sati rada')}</Label>
            <Input
              id="worklog-hours"
              type="number"
              inputMode="decimal"
              step="0.25"
              min="0"
              max="24"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              placeholder={t('workLog.hoursPlaceholder', 'npr. 8')}
            />
            <p className="text-[11px] text-muted-foreground">
              {t('workLog.hoursHint', 'Tvoji sati će se automatski zbrojiti u mjesečnu satnicu.')}
            </p>
          </div>

          {/* Weather */}
          <div className="space-y-1.5">
            <Label>{t('workLog.weather', 'Vrijeme (opcionalno)')}</Label>
            <Input
              value={weather}
              onChange={(e) => setWeather(e.target.value)}
              placeholder={t('workLog.weatherPlaceholder', 'npr. Sunčano, 18°C')}
            />
          </div>

          {/* Summary */}
          <div className="space-y-1.5">
            <Label>
              {t('workLog.summary', 'Što je rađeno')} <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder={t('workLog.summaryPlaceholder', 'Opiši što je danas obavljeno na gradilištu...')}
                rows={4}
                className="pr-12"
              />
              <VoiceInputButton
                value={summary}
                onChange={setSummary}
                className="absolute bottom-2 right-2"
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>{t('workLog.notes', 'Napomene / incidenti (opcionalno)')}</Label>
            <div className="relative">
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('workLog.notesPlaceholder', 'Posebne napomene, kašnjenja, problemi...')}
                rows={3}
                className="pr-12"
              />
              <VoiceInputButton
                value={notes}
                onChange={setNotes}
                className="absolute bottom-2 right-2"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('common.cancel', 'Odustani')}
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !summary.trim()}>
            {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            {t('common.save', 'Spremi')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
