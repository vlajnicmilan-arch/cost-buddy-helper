import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

interface Props {
  open: boolean;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => Promise<void>;
}

export const RevokeGrantDialog = ({ open, busy, onOpenChange, onConfirm }: Props) => {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  const valid = reason.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[60]">
        <DialogHeader>
          <DialogTitle>{t('admin.moduleAccess.revokeTitle', 'Opozovi pristup')}</DialogTitle>
          <DialogDescription>
            {t(
              'admin.moduleAccess.revokeDesc',
              'Razlog je obavezan i ostaje vidljiv u povijesti.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="revoke-reason">
            {t('admin.moduleAccess.revokeReasonLabel', 'Razlog opoziva')}
          </Label>
          <Textarea
            id="revoke-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder={t('admin.moduleAccess.revokeReasonPh', 'Npr. povrat sredstava, nesporazum…')}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('common.cancel', 'Odustani')}
          </Button>
          <Button
            variant="destructive"
            disabled={!valid || busy}
            onClick={() => onConfirm(reason.trim())}
          >
            {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {t('admin.moduleAccess.revokeConfirm', 'Opozovi')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
