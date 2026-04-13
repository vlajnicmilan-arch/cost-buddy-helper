import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ENTRY_TYPES, distributeHours, EntryType } from '@/types/timeClock';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';

interface TimeClockQuickEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workerName: string;
  workDate: Date;
  onSubmit: (data: {
    totalHours: number;
    entryType: EntryType;
    note?: string;
    breakdown: ReturnType<typeof distributeHours>;
  }) => void;
}

export const TimeClockQuickEntryDialog = ({
  open,
  onOpenChange,
  workerName,
  workDate,
  onSubmit
}: TimeClockQuickEntryDialogProps) => {
  const { t } = useTranslation();
  const [totalHours, setTotalHours] = useState<string>('8');
  const [entryType, setEntryType] = useState<EntryType>('regular');
  const [note, setNote] = useState('');

  const hours = parseFloat(totalHours) || 0;
  const breakdown = distributeHours(hours, entryType, workDate);

  const handleSubmit = () => {
    if (hours <= 0) return;
    onSubmit({
      totalHours: hours,
      entryType,
      note: note || undefined,
      breakdown
    });
    setTotalHours('8');
    setEntryType('regular');
    setNote('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('timeClock.quickEntry', 'Brzi unos sati')} — {workerName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>{t('timeClock.totalHours', 'Ukupno sati')}</Label>
            <Input
              type="number"
              min="0"
              max="24"
              step="0.5"
              value={totalHours}
              onChange={(e) => setTotalHours(e.target.value)}
            />
          </div>

          <div>
            <Label>{t('timeClock.entryType', 'Vrsta rada')}</Label>
            <Select value={entryType} onValueChange={(v) => setEntryType(v as EntryType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ENTRY_TYPES.map(type => (
                  <SelectItem key={type} value={type}>
                    {t(`timeClock.entryTypes.${type}`, type)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Auto-calculated breakdown preview */}
          {hours > 0 && (
            <div className="p-3 rounded-lg bg-muted/50 space-y-2">
              <p className="text-sm font-medium">{t('timeClock.autoBreakdown', 'Automatska raščlamba:')}</p>
              <div className="flex flex-wrap gap-2">
                {breakdown.regular_hours > 0 && (
                  <Badge variant="secondary">
                    {t('timeClock.columns.regular', 'Redovni')}: {breakdown.regular_hours}h
                  </Badge>
                )}
                {breakdown.overtime_hours > 0 && (
                  <Badge variant="secondary" className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">
                    {t('timeClock.columns.overtime', 'Prekovremeni')}: {breakdown.overtime_hours}h
                  </Badge>
                )}
                {breakdown.night_hours > 0 && (
                  <Badge variant="secondary">
                    {t('timeClock.columns.night', 'Noćni')}: {breakdown.night_hours}h
                  </Badge>
                )}
                {breakdown.sunday_hours > 0 && (
                  <Badge variant="secondary">
                    {t('timeClock.columns.sunday', 'Nedjelja')}: {breakdown.sunday_hours}h
                  </Badge>
                )}
                {breakdown.holiday_hours > 0 && (
                  <Badge variant="secondary">
                    {t('timeClock.columns.holiday', 'Blagdan')}: {breakdown.holiday_hours}h
                  </Badge>
                )}
                {breakdown.standby_hours > 0 && (
                  <Badge variant="secondary">
                    {t('timeClock.columns.standby', 'Pripravnost')}: {breakdown.standby_hours}h
                  </Badge>
                )}
                {breakdown.field_hours > 0 && (
                  <Badge variant="secondary">
                    {t('timeClock.columns.field', 'Teren')}: {breakdown.field_hours}h
                  </Badge>
                )}
                {breakdown.break_minutes > 0 && (
                  <Badge variant="outline">
                    {t('timeClock.breakMin', 'Pauza')}: {breakdown.break_minutes}min
                  </Badge>
                )}
              </div>
            </div>
          )}

          <div>
            <Label>{t('timeClock.note', 'Bilješka')}</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('timeClock.notePlaceholder', 'Opcionalna bilješka...')}
              rows={2}
            />
          </div>

          <Button onClick={handleSubmit} disabled={hours <= 0} className="w-full">
            {t('timeClock.saveEntry', 'Spremi')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
