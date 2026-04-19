import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { format } from 'date-fns';
import { Cake, CreditCard, AlertTriangle, CalendarDays } from 'lucide-react';
import { VoiceInputButton } from '@/components/VoiceInputButton';
import { getDateRange, toInputDate, clampInputDate, getDateValidationKey } from '@/lib/dateValidation';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: { title: string; description?: string; remind_at: string; type: string }) => Promise<void>;
  defaultDate?: string; // YYYY-MM-DD
}

const eventTypes = [
  { value: 'birthday', label: 'Rođendan', icon: Cake },
  { value: 'planned_expense', label: 'Planirani trošak', icon: CreditCard },
  { value: 'deadline', label: 'Rok plaćanja', icon: AlertTriangle },
  { value: 'custom', label: 'Događaj', icon: CalendarDays },
];

export const CalendarEventDialog = ({ open, onOpenChange, onSave, defaultDate }: Props) => {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(defaultDate || format(new Date(), 'yyyy-MM-dd'));
  const [type, setType] = useState('custom');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim() || undefined,
        remind_at: `${date}T09:00:00`,
        type,
      });
      showSuccess(t('calendar.eventAdded', 'Događaj dodan'));
      setTitle('');
      setDescription('');
      setType('custom');
      onOpenChange(false);
    } catch (err) {
      showError(t('calendar.eventError', 'Greška pri dodavanju'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('calendar.addEvent', 'Novi događaj')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <Label>{t('common.title', 'Naslov')}</Label>
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={t('calendar.titlePlaceholder', 'npr. Rođendan Marko')}
              autoFocus
            />
          </div>

          <div>
            <Label>{t('calendar.eventType', 'Tip')}</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {eventTypes.map(et => (
                  <SelectItem key={et.value} value={et.value}>
                    <div className="flex items-center gap-2">
                      <et.icon className="w-4 h-4" />
                      {et.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>{t('common.date', 'Datum')}</Label>
            {(() => {
              const r = getDateRange('event');
              return (
                <Input
                  type="date"
                  value={date}
                  min={toInputDate(r.min)}
                  max={toInputDate(r.max)}
                  onChange={e => setDate(e.target.value)}
                  onBlur={(e) => {
                    const v = e.target.value;
                    if (!v) return;
                    const errKey = getDateValidationKey(v, r);
                    if (errKey) {
                      setDate(clampInputDate(v, r));
                      showError(t(errKey));
                    }
                  }}
                />
              );
            })()}
          </div>

          <div>
            <Label>{t('common.description', 'Opis')}</Label>
            <div className="relative">
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder={t('calendar.descPlaceholder', 'Opcionalni opis...')}
                rows={2}
                className="pr-12"
              />
              <VoiceInputButton
                value={description}
                onChange={setDescription}
                className="absolute bottom-2 right-2"
              />
            </div>
          </div>

          <Button onClick={handleSave} disabled={saving || !title.trim()} className="w-full">
            {saving ? '...' : t('common.save', 'Spremi')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
