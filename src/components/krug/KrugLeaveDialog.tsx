/**
 * "Napusti Krug" — snažna potvrda samoizlaska ne-vlasnika.
 *
 * Poziva RPC `krug_leave` (jedini dopušteni put; direktan DELETE je
 * zabranjen RLS-om). Postojeća razračunavanja se NE brišu.
 */
import { useTranslation } from 'react-i18next';
import { LogOut, Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useKrugLeave, isKrugLeaveOk, type KrugLeaveOutcome } from '@/hooks/useKrugLeave';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';

interface Props {
  krugId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLeft?: () => void;
}

export function KrugLeaveDialog({ krugId, open, onOpenChange, onLeft }: Props) {
  const { t } = useTranslation();
  const leave = useKrugLeave();

  const handleConfirm = async () => {
    try {
      const outcome = await leave.mutateAsync({ krugId });
      if (isKrugLeaveOk(outcome)) {
        showSuccess(t('krug.leave.success', 'Napustio si Krug'));
        onOpenChange(false);
        onLeft?.();
        return;
      }
      showError(
        t(
          `krug.leave.errors.${outcome as KrugLeaveOutcome}`,
          t('krug.leave.errors.generic', 'Greška pri napuštanju Kruga'),
        ),
      );
    } catch {
      showError(t('krug.leave.errors.generic', 'Greška pri napuštanju Kruga'));
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('krug.leave.title', 'Napustiti Krug?')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              'krug.leave.body',
              'Izgubit ćeš pristup dijeljenim podacima ovog Kruga. Tvoje osobne transakcije ostaju tvoje.',
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={leave.isPending}>
            {t('krug.leave.cancel', 'Odustani')}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              void handleConfirm();
            }}
            disabled={leave.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {leave.isPending ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <LogOut className="w-4 h-4 mr-1" />
            )}
            {t('krug.leave.confirm', 'Napusti Krug')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
