import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ShieldAlert } from 'lucide-react';

const STORAGE_KEY = 'workerDisclaimerAccepted_v1';

export const hasAcceptedWorkerDisclaimer = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
};

export const setWorkerDisclaimerAccepted = () => {
  try {
    localStorage.setItem(STORAGE_KEY, 'true');
  } catch {
    /* ignore */
  }
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccept: () => void;
}

export const WorkerDataDisclaimerDialog = ({ open, onOpenChange, onAccept }: Props) => {
  const { t } = useTranslation();
  const [checked, setChecked] = useState(false);

  const handleAccept = () => {
    if (!checked) return;
    setWorkerDisclaimerAccepted();
    onOpenChange(false);
    onAccept();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[60] max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-primary" />
            <DialogTitle>{t('disclaimer.workerData.title', 'Obrada osobnih podataka')}</DialogTitle>
          </div>
          <DialogDescription className="pt-2 text-left">
            {t(
              'disclaimer.workerData.body',
              'Unosom osobnih podataka treće osobe (ime, kontakt, sati rada, satnica) potvrđujete da imate pravnu osnovu (ugovor, privola) i da ste tu osobu informirali o obradi.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm text-muted-foreground">
          <div className="rounded-md bg-muted/50 p-3 border border-border">
            <p className="font-medium text-foreground mb-1">
              {t('disclaimer.workerData.notOfficialTitle', 'Nije službena evidencija')}
            </p>
            <p>
              {t(
                'disclaimer.workerData.notOfficialBody',
                'Podaci se koriste isključivo za interno praćenje projekta i ne predstavljaju službenu evidenciju u smislu Zakona o radu, Zakona o računovodstvu ni Zakona o porezu.'
              )}
            </p>
          </div>

          <div className="flex items-start gap-2 pt-2">
            <Checkbox
              id="worker-disclaimer-accept"
              checked={checked}
              onCheckedChange={(v) => setChecked(v === true)}
              className="mt-0.5"
            />
            <label
              htmlFor="worker-disclaimer-accept"
              className="text-sm text-foreground cursor-pointer leading-tight"
            >
              {t('disclaimer.workerData.accept', 'Razumijem i prihvaćam')}
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel', 'Odustani')}
          </Button>
          <Button onClick={handleAccept} disabled={!checked}>
            {t('common.continue', 'Nastavi')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
