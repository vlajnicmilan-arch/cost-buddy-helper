import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useBackButton } from '@/hooks/useBackButton';
import { BACK_PRIORITY } from '@/contexts/BackButtonContext';

export const EXIT_CONFIRM_EVENT = 'vmb:request-exit-confirm';

const tryExitApp = () => {
  import('@capacitor/app')
    .then((mod) => {
      const app: any = (mod as any).App;
      if (app && typeof app.exitApp === 'function') {
        app.exitApp().catch?.(() => { /* ignore */ });
      }
    })
    .catch(() => { /* ignore */ });
};

/**
 * Globalni potvrdni dijalog za izlaz iz aplikacije.
 * Emitira ga BackButtonContext (ROOT handler) samo na nativnoj platformi
 * kad je stack backa prazan i korisnik je na root ruti.
 */
export function ExitConfirmDialog() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const handleClose = useCallback(() => setOpen(false), []);

  useBackButton(open, handleClose, BACK_PRIORITY.DIALOG, 'EXIT_CONFIRM');

  useEffect(() => {
    const onRequest = () => setOpen(true);
    window.addEventListener(EXIT_CONFIRM_EVENT, onRequest as EventListener);
    return () => window.removeEventListener(EXIT_CONFIRM_EVENT, onRequest as EventListener);
  }, []);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent className="max-w-xs">
        <AlertDialogHeader>
          <AlertDialogTitle>{t('common.exitApp.title')}</AlertDialogTitle>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.no')}</AlertDialogCancel>
          <AlertDialogAction onClick={tryExitApp}>{t('common.yes')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
