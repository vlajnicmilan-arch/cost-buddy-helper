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
import { useTranslation } from 'react-i18next';

interface ExistingPersonPromptDialogProps {
  open: boolean;
  name: string;
  onUseExisting: () => void;
  onDifferentPerson: () => void;
}

/**
 * Shown when a newly added project worker matches an existing person among
 * "Ljudi" in the same business profile. Never merges automatically.
 */
export const ExistingPersonPromptDialog = ({
  open,
  name,
  onUseExisting,
  onDifferentPerson,
}: ExistingPersonPromptDialogProps) => {
  const { t } = useTranslation();
  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('people.existsTitle', 'Osoba već postoji')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('people.existsBody', '{{name}} već postoji među Ljudima. Želiš li ga dodati i na ovaj projekt?', {
              name,
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onDifferentPerson}>
            {t('people.differentPerson', 'Ovo je druga osoba')}
          </AlertDialogCancel>
          <AlertDialogAction onClick={onUseExisting}>
            {t('people.useExisting', 'Dodaj postojećeg')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
