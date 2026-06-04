import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { GrantResultItem } from '@/hooks/useAdminModuleGrants';

interface Props {
  open: boolean;
  conflicts: GrantResultItem[];
  onClose: () => void;
}

export const ModuleAccessConflictDialog = ({ open, conflicts, onClose }: Props) => {
  const { t } = useTranslation();

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent className="z-[70]">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('admin.moduleAccess.conflict.title', 'Postoji aktivan grant')}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>
                {t(
                  'admin.moduleAccess.conflict.desc',
                  'Novi grant ne može preko postojećeg aktivnog. Prvo ga eksplicitno opozovi pa kreiraj novi.'
                )}
              </p>
              <ul className="space-y-2 mt-2">
                {conflicts.map((c) => {
                  if (!c.existing) return null;
                  const moduleLabel =
                    c.module === 'projects'
                      ? t('settings.modules.projects.title', 'Projekti')
                      : t('settings.modules.business.title', 'Business');
                  return (
                    <li
                      key={c.existing.id}
                      className="rounded-lg border border-border bg-muted/40 p-3 text-xs space-y-0.5"
                    >
                      <div className="font-medium text-foreground text-sm">{moduleLabel}</div>
                      <div>
                        <span className="text-muted-foreground">
                          {t('admin.moduleAccess.field.duration', 'Trajanje')}:
                        </span>{' '}
                        {c.existing.is_permanent
                          ? t('admin.moduleAccess.permanent', 'Trajno')
                          : c.existing.expires_at
                            ? format(new Date(c.existing.expires_at), 'dd.MM.yyyy. HH:mm', { locale: hr })
                            : '—'}
                      </div>
                      <div>
                        <span className="text-muted-foreground">
                          {t('admin.moduleAccess.field.grantedAt', 'Dodijeljen')}:
                        </span>{' '}
                        {format(new Date(c.existing.granted_at), 'dd.MM.yyyy. HH:mm', { locale: hr })}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={onClose}>
            {t('common.ok', 'U redu')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
