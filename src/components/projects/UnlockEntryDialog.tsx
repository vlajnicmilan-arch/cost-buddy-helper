import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Unlock, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';

interface UnlockEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entryId: string | null;
  onUnlocked?: (entryId: string) => void;
}

export const UnlockEntryDialog = ({ open, onOpenChange, entryId, onUnlocked }: UnlockEntryDialogProps) => {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleClose = (next: boolean) => {
    if (submitting) return;
    if (!next) setReason('');
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    if (!entryId) return;
    const trimmed = reason.trim();
    if (trimmed.length < 3) {
      showError(t('workers.calendar.reasonRequired', 'Razlog je obavezan'));
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc('unlock_work_entry', {
        p_entry_id: entryId,
        p_reason: trimmed,
      });
      if (error) throw error;
      showSuccess(t('workers.calendar.unlockedToast', 'Radni unos otključan'));
      onUnlocked?.(entryId);
      setReason('');
      onOpenChange(false);
    } catch (err) {
      console.error('unlock_work_entry error', err);
      showError(t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md" showBackButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Unlock className="w-5 h-5" />
            {t('workers.calendar.unlockDialogTitle', 'Otključati radni unos?')}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-start gap-2 text-xs text-muted-foreground rounded-md border border-amber-500/30 bg-amber-500/5 p-2">
            <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <span>{t('workers.calendar.unlockDialogMessage', 'Time se poništava veza s isplatom (samo za ovaj unos).')}</span>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t('workers.calendar.unlockReasonLabel', 'Razlog (obavezno)')}</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder={t('workers.calendar.unlockReasonPlaceholder', 'Npr. ispravak sati...')}
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={() => handleClose(false)} disabled={submitting}>
              {t('common.cancel', 'Odustani')}
            </Button>
            <Button size="sm" className="flex-1" onClick={handleSubmit} disabled={submitting || reason.trim().length < 3}>
              {submitting ? t('common.saving', 'Spremanje...') : t('workers.calendar.unlockSubmit', 'Otključaj')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
