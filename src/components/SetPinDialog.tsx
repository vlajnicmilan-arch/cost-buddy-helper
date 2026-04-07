import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAppLock } from '@/contexts/AppLockContext';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Lock } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAppState } from '@/contexts/AppStateContext';
import { useHaptics } from '@/hooks/useHaptics';
import { APP_VERSION } from '@/lib/version';

interface SetPinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SetPinDialog = ({ open, onOpenChange }: SetPinDialogProps) => {
  const { setPin, enableLock } = useAppLock();
  const { t } = useTranslation();
  const { emitAvatarEvent } = useAppState();
  const { lightTap, errorVibration, successVibration } = useHaptics();
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');
  const [firstPin, setFirstPin] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [error, setError] = useState(false);

  const stepRef = useRef(step);
  const firstPinRef = useRef(firstPin);

  useEffect(() => { stepRef.current = step; }, [step]);
  useEffect(() => { firstPinRef.current = firstPin; }, [firstPin]);

  const handleDigit = (digit: string) => {
    if (currentPin.length >= 4) return;
    lightTap();
    const newPin = currentPin + digit;
    setCurrentPin(newPin);
    setError(false);

    if (newPin.length === 4) {
      setTimeout(async () => {
        if (stepRef.current === 'enter') {
          setFirstPin(newPin);
          setCurrentPin('');
          setStep('confirm');
        } else {
          if (newPin === firstPinRef.current) {
            try {
              const result = await setPin(newPin);
              if (!result.success) {
                console.error('[PIN] Save failed', {
                  version: APP_VERSION,
                  origin: window.location.origin,
                  backend: result.backend,
                  error: result.error,
                });
                toast.error(`PIN greška: ${result.error || 'nepoznato'}`);
                return;
              }
              enableLock(true);
              console.log('[PIN] Saved OK', {
                version: APP_VERSION,
                backend: result.backend,
                error: result.error,
              });
              if (result.error) {
                // Saved via fallback
                toast.success(`PIN postavljen (fallback: ${result.backend})`, { duration: 5000 });
              } else {
                toast.success(t('lock.pinSet', 'PIN je postavljen'));
              }
            } catch (err: any) {
              console.error('[PIN] Unexpected error', {
                version: APP_VERSION,
                origin: window.location.origin,
                message: err?.message,
              });
              toast.error(`PIN error: ${err?.message || 'unknown'}`);
              return;
            }
            try {
              successVibration();
              emitAvatarEvent('proud', 'Zaštićeno! 🛡️');
            } catch { /* non-critical */ }
            resetAndClose();
          } else if (newPin.length === firstPinRef.current.length) {
            setError(true);
            errorVibration();
            setTimeout(() => setCurrentPin(''), 600);
          }
        }
      }, 150);
    }
  };

  const handleDelete = () => {
    setCurrentPin(currentPin.slice(0, -1));
    setError(false);
  };

  const resetAndClose = () => {
    setStep('enter');
    setFirstPin('');
    setCurrentPin('');
    setError(false);
    onOpenChange(false);
  };

  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetAndClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5" />
            {step === 'enter'
              ? t('lock.setPin', 'Postavite PIN')
              : t('lock.confirmPin', 'Potvrdite PIN')}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center py-4">
          <p className="text-sm text-muted-foreground mb-6">
            {step === 'enter'
              ? t('lock.enterNewPin', 'Unesite 4-6 znamenkasti PIN')
              : t('lock.reenterPin', 'Unesite PIN ponovo za potvrdu')}
          </p>

          <motion.div
            animate={error ? { x: [-10, 10, -10, 10, 0] } : {}}
            transition={{ duration: 0.4 }}
            className="flex gap-3 mb-6"
          >
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`w-3 h-3 rounded-full transition-all duration-200 ${
                  i < currentPin.length
                    ? error ? 'bg-destructive' : 'bg-primary'
                    : 'bg-muted-foreground/20'
                }`}
              />
            ))}
          </motion.div>

          {error && (
            <p className="text-xs text-destructive mb-4">
              {t('lock.pinsDontMatch', 'PIN-ovi se ne podudaraju. Pokušajte ponovo.')}
            </p>
          )}

          <div className="grid grid-cols-3 gap-2 max-w-[220px] w-full">
            {digits.map((d, i) => {
              if (d === '') return <div key={i} />;
              if (d === 'del') {
                return (
                  <button
                    key={i}
                    onClick={handleDelete}
                    className="h-12 rounded-xl bg-muted/50 hover:bg-muted text-sm font-medium text-foreground transition-all active:scale-95"
                  >
                    ←
                  </button>
                );
              }
              return (
                <button
                  key={i}
                  onClick={() => handleDigit(d)}
                  className="h-12 rounded-xl bg-muted/50 hover:bg-muted text-lg font-semibold text-foreground transition-all active:scale-95"
                >
                  {d}
                </button>
              );
            })}
          </div>

          <Button variant="ghost" className="mt-4" onClick={resetAndClose}>
            {t('common.cancel', 'Odustani')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
