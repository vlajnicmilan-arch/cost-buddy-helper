/**
 * CorrectionDeleteConfirmHost — global AlertDialog za brisanje "Korekcija salda"
 * transakcija. Sluša na pub/sub iz `src/lib/correctionDeleteGuard.ts` i prikazuje
 * potvrdu prije nego što useExpenseCRUD.deleteExpense nastavi s brisanjem.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import {
  subscribeCorrectionDeleteRequests,
  _resolveCurrentCorrectionDelete,
  type CorrectionDeleteRequestPayload,
} from '@/lib/correctionDeleteGuard';

type ActiveRequest = CorrectionDeleteRequestPayload | null;

export function CorrectionDeleteConfirmHost() {
  const { t } = useTranslation();
  const [active, setActive] = useState<ActiveRequest>(null);

  useEffect(() => subscribeCorrectionDeleteRequests((req) => {
    setActive(req ? {
      expenseId: req.expenseId,
      description: req.description,
      amount: req.amount,
      paymentSourceLabel: req.paymentSourceLabel,
    } : null);
  }), []);

  const open = active !== null;

  const handleOpenChange = (next: boolean) => {
    if (!next && active) {
      // Zatvaranje bez klika na "Ipak obriši" tretiramo kao odustajanje.
      _resolveCurrentCorrectionDelete(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('correctionDelete.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('correctionDelete.description')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => _resolveCurrentCorrectionDelete(false)}>
            {t('correctionDelete.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => _resolveCurrentCorrectionDelete(true)}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {t('correctionDelete.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
