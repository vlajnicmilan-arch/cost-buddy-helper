import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';

// Frontend mirror of the server-side allowlist.
// Server remains authoritative; this only powers UI affordances.
const ALLOWLIST_EMAILS = ['vinkabalance@gmail.com'];
const ALLOWLIST_DOMAIN_SUFFIX = '@test.vmbalance.com';

export function isEmailHardDeletable(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  if (!e) return false;
  if (ALLOWLIST_EMAILS.includes(e)) return true;
  if (e.endsWith(ALLOWLIST_DOMAIN_SUFFIX)) return true;
  return false;
}

interface HardDeleteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  email: string;
  onDeleted?: () => void;
}

export const HardDeleteUserDialog = ({
  open,
  onOpenChange,
  userId,
  email,
  onDeleted,
}: HardDeleteUserDialogProps) => {
  const { t } = useTranslation();
  const [confirmText, setConfirmText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const matches = useMemo(
    () => confirmText.trim().toLowerCase() === email.trim().toLowerCase(),
    [confirmText, email],
  );

  const reset = () => {
    setConfirmText('');
    setSubmitting(false);
  };

  const handleConfirm = async () => {
    if (!matches || submitting) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-hard-delete-user', {
        body: { userId, email },
      });
      if (error) {
        showError(error.message, {
          title: t('admin.hardDelete.errorToast', 'Brisanje nije uspjelo'),
          module: 'centar',
        });
        return;
      }
      const status = (data as { status?: string } | null)?.status;
      if (status === 'deleted') {
        showSuccess(t('admin.hardDelete.successToast', 'Korisnik trajno obrisan'), { module: 'centar' });
        onDeleted?.();
        onOpenChange(false);
        reset();
        return;
      }
      if (status === 'blocked') {
        const blockedBy = (data as { blockedBy?: string }).blockedBy;
        if (blockedBy === 'krug_multi_member') {
          showWarning(
            t('admin.hardDelete.blockedKrugToast', 'Korisnik posjeduje krug s drugim članovima. Raspusti krug ručno prije brisanja.'),
            { module: 'centar' },
          );
        } else {
          showWarning(String(blockedBy ?? ''), {
            title: t('admin.hardDelete.blockedGenericToast', 'Brisanje blokirano'),
            module: 'centar',
          });
        }
        return;
      }
      showError(JSON.stringify(data), {
        title: t('admin.hardDelete.errorToast', 'Brisanje nije uspjelo'),
        module: 'centar',
      });
    } catch (e) {
      showError(e instanceof Error ? e.message : String(e), {
        title: t('admin.hardDelete.errorToast', 'Brisanje nije uspjelo'),
        module: 'centar',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" />
            {t('admin.hardDelete.dialogTitle', 'Trajno obriši korisnika')}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <p className="text-destructive font-medium">
                {t(
                  'admin.hardDelete.dialogWarning',
                  'Ova akcija trajno briše korisnika i sve podatke. Nije reverzibilno.',
                )}
              </p>
              <div className="rounded-md bg-muted p-3 space-y-1 font-mono text-xs">
                <div>
                  <span className="text-muted-foreground">email: </span>
                  <span>{email}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">id: </span>
                  <span>{userId}</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hard-delete-confirm" className="text-xs">
                  {t('admin.hardDelete.confirmInputLabel', 'Utipkaj točan email za potvrdu')}
                </Label>
                <Input
                  id="hard-delete-confirm"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={submitting}
                />
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>
            {t('admin.hardDelete.cancel', 'Odustani')}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
            disabled={!matches || submitting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4 mr-2" />
            )}
            {t('admin.hardDelete.confirmCta', 'Trajno obriši')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
