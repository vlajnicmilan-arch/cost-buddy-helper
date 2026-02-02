import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ProjectWorker } from '@/types/projectWorker';
import { useTranslation } from 'react-i18next';

interface ProjectWorkerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  worker?: ProjectWorker | null;
  onSave: (data: {
    first_name: string;
    last_name: string;
    position: string;
    work_hours: number;
    hourly_rate: number;
    work_start_time: string;
    work_end_time: string;
  }) => void;
}

export const ProjectWorkerDialog = ({
  open,
  onOpenChange,
  worker,
  onSave
}: ProjectWorkerDialogProps) => {
  const { t } = useTranslation();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [position, setPosition] = useState('');
  const [workHours, setWorkHours] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [workStartTime, setWorkStartTime] = useState('08:00');
  const [workEndTime, setWorkEndTime] = useState('16:00');

  const isEditing = !!worker;

  useEffect(() => {
    if (worker) {
      setFirstName(worker.first_name);
      setLastName(worker.last_name);
      setPosition(worker.position);
      setWorkHours(worker.work_hours.toString());
      setHourlyRate(worker.hourly_rate.toString());
      setWorkStartTime(worker.work_start_time?.slice(0, 5) || '08:00');
      setWorkEndTime(worker.work_end_time?.slice(0, 5) || '16:00');
    } else {
      setFirstName('');
      setLastName('');
      setPosition('');
      setWorkHours('');
      setHourlyRate('');
      setWorkStartTime('08:00');
      setWorkEndTime('16:00');
    }
  }, [worker, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!firstName.trim() || !lastName.trim() || !position.trim()) return;

    onSave({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      position: position.trim(),
      work_hours: parseFloat(workHours) || 0,
      hourly_rate: parseFloat(hourlyRate) || 0,
      work_start_time: workStartTime,
      work_end_time: workEndTime
    });

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? t('workers.edit', 'Uredi radnika') : t('workers.add', 'Dodaj radnika')}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">{t('workers.firstName', 'Ime')}</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder={t('workers.firstNamePlaceholder', 'Unesite ime')}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">{t('workers.lastName', 'Prezime')}</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder={t('workers.lastNamePlaceholder', 'Unesite prezime')}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="position">{t('workers.position', 'Radno mjesto')}</Label>
            <Input
              id="position"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              placeholder={t('workers.positionPlaceholder', 'npr. Programer, Dizajner...')}
              required
            />
          </div>

          {/* Work schedule */}
          <div className="space-y-2">
            <Label>{t('workers.workSchedule', 'Radno vrijeme')}</Label>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="workStartTime" className="text-xs text-muted-foreground">
                  {t('workers.from', 'Od')}
                </Label>
                <Input
                  id="workStartTime"
                  type="time"
                  value={workStartTime}
                  onChange={(e) => setWorkStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="workEndTime" className="text-xs text-muted-foreground">
                  {t('workers.to', 'Do')}
                </Label>
                <Input
                  id="workEndTime"
                  type="time"
                  value={workEndTime}
                  onChange={(e) => setWorkEndTime(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="workHours">{t('workers.defaultHours', 'Zadani sati')}</Label>
              <Input
                id="workHours"
                type="number"
                step="0.5"
                min="0"
                value={workHours}
                onChange={(e) => setWorkHours(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hourlyRate">{t('workers.hourlyRate', 'Cijena sata')}</Label>
              <Input
                id="hourlyRate"
                type="number"
                step="0.01"
                min="0"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit">
              {isEditing ? t('common.save') : t('common.add')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
