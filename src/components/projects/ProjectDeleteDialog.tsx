import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Archive, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ProjectDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Already archived projects skip the archive option. */
  isArchived?: boolean;
  /** Called when user picks safe path. */
  onArchive?: () => void;
  /** Called when user confirms permanent delete (soft-delete → Trash 30d). */
  onDelete: () => void;
}

/**
 * Hibrid delete affordance: jedan dialog s dvije akcije —
 * "Premjesti u arhivu" (default safe) i "Obriši trajno" (destructive).
 * Korisnik bira u istom koraku umjesto 4-klik puta.
 *
 * Soft-delete ide u Trash 30 dana (postojeća infrastruktura),
 * što služi kao safety net.
 */
export const ProjectDeleteDialog = ({
  open,
  onOpenChange,
  isArchived = false,
  onArchive,
  onDelete,
}: ProjectDeleteDialogProps) => {
  const { t } = useTranslation();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="z-[70]">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('projects.deleteDialog.title', 'Obrisati projekt?')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isArchived
              ? t(
                  'projects.deleteDialog.descriptionArchived',
                  'Projekt je u arhivi. Brisanjem ide u Otpad gdje ostaje 30 dana prije trajnog uklanjanja.'
                )
              : t(
                  'projects.deleteDialog.description',
                  'Možeš ga premjestiti u arhivu (sigurno, vraćaš ga kad želiš) ili obrisati. Obrisani projekt ide u Otpad i čuva se 30 dana prije trajnog uklanjanja.'
                )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="sm:mr-auto"
          >
            {t('common.cancel', 'Odustani')}
          </Button>

          {!isArchived && onArchive && (
            <Button
              variant="outline"
              onClick={() => {
                onOpenChange(false);
                onArchive();
              }}
            >
              <Archive className="w-4 h-4 mr-2" />
              {t('projects.deleteDialog.archiveAction', 'Premjesti u arhivu')}
            </Button>
          )}

          <Button
            variant="destructive"
            onClick={() => {
              onOpenChange(false);
              onDelete();
            }}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            {t('projects.deleteDialog.deleteAction', 'Obriši trajno')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
