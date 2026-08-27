import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Archive, Trash2, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useProjectDeleteImpact } from '@/hooks/useProjectDeleteImpact';

interface ProjectDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Already archived projects skip the archive option. */
  isArchived?: boolean;
  /** Project being deleted — used only to show what disappears from sight. */
  projectId?: string | null;
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
  projectId = null,
  onArchive,
  onDelete,
}: ProjectDeleteDialogProps) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const { impact } = useProjectDeleteImpact(projectId, open);

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

        {impact && (impact.workerCount > 0 || impact.collaboratorCount > 0) && (
          <div
            className={`rounded-lg border p-3 space-y-1 text-sm ${
              impact.hasDebt ? 'border-destructive/50 bg-destructive/5' : 'border-border/50'
            }`}
          >
            {impact.hasDebt && (
              <p className="flex items-center gap-1.5 font-medium text-destructive">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {t(
                  'projects.deleteDialog.debtWarning',
                  'S projektom s vidika nestaje i dug prema ljudima.'
                )}
              </p>
            )}
            {impact.workerCount > 0 && (
              <p>
                {t(
                  'projects.deleteDialog.workersLine',
                  '{{count}} radnika · neisplaćeno {{amount}}',
                  { count: impact.workerCount, amount: formatAmount(impact.workerUnpaid) }
                )}
              </p>
            )}
            {impact.collaboratorCount > 0 && (
              <p>
                {t(
                  'projects.deleteDialog.collaboratorsLine',
                  '{{count}} suradnika · neplaćeno {{amount}}',
                  {
                    count: impact.collaboratorCount,
                    amount: formatAmount(impact.collaboratorUnpaid),
                  }
                )}
              </p>
            )}
          </div>
        )}

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
