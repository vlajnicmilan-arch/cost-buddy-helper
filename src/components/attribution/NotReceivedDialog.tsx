/**
 * „Nisam primio" — the linked worker tells the owner a payout did not arrive.
 * Server RPC worker_report_payout_not_received writes the report and notifies
 * the owner through the outbox; the payout itself is never changed.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';

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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { logWorkerPayoutReportError, workerPayoutErrorKey } from '@/lib/attribution/receiptError';

const NOTE_MAX = 500;

interface Props {
  open: boolean;
  payoutId: string | null;
  batchId: string | null;
  /** One request id per sheet opening; repeats are idempotent on the server. */
  clientRequestId: string | null;
  onOpenChange: (open: boolean) => void;
  onReported: () => void;
}

export function NotReceivedDialog({ open, payoutId, batchId, clientRequestId, onOpenChange, onReported }: Props) {
  const { t } = useTranslation();
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setNote('');
  }, [open]);

  const handleConfirm = async () => {
    if (!clientRequestId || saving) return;
    setSaving(true);
    const target = batchId ? { p_batch_id: batchId } : { p_payout_id: payoutId ?? undefined };
    try {
      const { error } = await supabase.rpc('worker_report_payout_not_received', {
        ...target,
        p_client_request_id: clientRequestId,
        p_note: note.trim() || undefined,
      });
      if (error) throw error;
      showSuccess(t('attribution.notReceived.success'));
      onReported();
    } catch (e: unknown) {
      logWorkerPayoutReportError(e, { payoutId: batchId ? null : payoutId, batchId, clientRequestId });
      showError(t(workerPayoutErrorKey(e)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <AlertDialogContent className="z-[70]">
        <AlertDialogHeader>
          <AlertDialogTitle>{t('attribution.notReceived.title')}</AlertDialogTitle>
          <AlertDialogDescription>{t('attribution.notReceived.description')}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor="not-received-note">{t('attribution.notReceived.noteLabel')}</Label>
          <Textarea
            id="not-received-note"
            value={note}
            maxLength={NOTE_MAX}
            placeholder={t('attribution.notReceived.notePlaceholder')}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving} className="min-h-[44px]">
            {t('attribution.notReceived.cancel')}
          </AlertDialogCancel>
          <Button onClick={handleConfirm} disabled={saving || !clientRequestId} className="min-h-[44px]">
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {t('attribution.notReceived.confirm')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
