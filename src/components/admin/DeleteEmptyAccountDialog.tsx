/**
 * Confirmation for deleting an EMPTY account. The admin must type the exact
 * email of the account. The server re-verifies admin role, self/admin targets,
 * emptiness and the email before anything is deleted.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  email: string;
  onDeleted?: () => void;
}

export const DeleteEmptyAccountDialog = ({
  open,
  onOpenChange,
  userId,
  email,
  onDeleted,
}: Props) => {
  const { t } = useTranslation();
  const [confirmText, setConfirmText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const matches = useMemo(
    () => confirmText.trim().toLowerCase() === email.trim().toLowerCase(),
    [confirmText, email],
  );

  const handleConfirm = async () => {
    if (!matches || submitting) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-delete-empty-user', {
        body: { mode: 'delete', userId, email },
      });
      if (error) {
        showError(t('admin.emptyAccount.errorToast'));
        return;
      }
      const payload = data as { status?: string; error?: string } | null;
      if (payload?.status === 'deleted') {
        showSuccess(t('admin.emptyAccount.successToast'));
        setConfirmText('');
        onOpenChange(false);
        onDeleted?.();
        return;
      }
      if (payload?.error === 'account_not_empty') {
        showError(t('admin.emptyAccount.notEmptyToast'));
        return;
      }
      showError(t('admin.emptyAccount.errorToast'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setConfirmText('');
        onOpenChange(o);
      }}
    >
      <AlertDialogContent className="z-[60]">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            {t('admin.emptyAccount.dialogTitle')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('admin.emptyAccount.dialogWarning', { email })}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="delete-empty-confirm" className="text-xs">
            {t('admin.emptyAccount.confirmInputLabel')}
          </Label>
          <Input
            id="delete-empty-confirm"
            value={confirmText}
            autoComplete="off"
            placeholder={email}
            onChange={(e) => setConfirmText(e.target.value)}
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>{t('common.cancel')}</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={!matches || submitting}
            onClick={handleConfirm}
          >
            {submitting && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            {t('admin.emptyAccount.confirmCta')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
