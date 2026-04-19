import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ABSENCE_TYPES } from '@/types/timeClock';
import { useTranslation } from 'react-i18next';
import { VoiceInputButton } from '@/components/VoiceInputButton';

interface TimeClockAbsenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workerName: string;
  onSubmit: (absenceType: string, note?: string) => void;
}

export const TimeClockAbsenceDialog = ({
  open,
  onOpenChange,
  workerName,
  onSubmit
}: TimeClockAbsenceDialogProps) => {
  const { t } = useTranslation();
  const [absenceType, setAbsenceType] = useState<string>('');
  const [note, setNote] = useState('');

  const handleSubmit = () => {
    if (!absenceType) return;
    onSubmit(absenceType, note || undefined);
    setAbsenceType('');
    setNote('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:w-auto max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('timeClock.addAbsence', 'Evidentiraj odsutnost')} — {workerName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>{t('timeClock.absenceType', 'Vrsta odsutnosti')}</Label>
            <Select value={absenceType} onValueChange={setAbsenceType}>
              <SelectTrigger>
                <SelectValue placeholder={t('timeClock.selectAbsence', 'Odaberi...')} />
              </SelectTrigger>
              <SelectContent>
                {ABSENCE_TYPES.map(type => (
                  <SelectItem key={type} value={type}>
                    {t(`timeClock.absence.${type}`, type)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>{t('timeClock.note', 'Bilješka')}</Label>
            <div className="relative">
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t('timeClock.notePlaceholder', 'Opcionalna bilješka...')}
                rows={2}
                className="pr-12"
              />
              <VoiceInputButton
                value={note}
                onChange={setNote}
                className="absolute bottom-2 right-2"
              />
            </div>
          </div>

          <Button onClick={handleSubmit} disabled={!absenceType} className="w-full">
            {t('timeClock.saveAbsence', 'Spremi odsutnost')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
