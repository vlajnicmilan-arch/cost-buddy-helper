/**
 * Dialog za pokretanje brisanja Kruga.
 * Solo (1 punopravni član) = jedan-klik. Multi = razlog + objašnjenje.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { useKrugRequestDeletion } from '@/hooks/useKrugDeletion';
import { isOkOutcome } from '@/lib/krugDeletionDecisions';
import { useModuleGate } from '@/hooks/useModuleGate';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  krugId: string;
  krugName: string;
  fullMemberCount: number;
}

export function KrugDeleteDialog({ open, onOpenChange, krugId, krugName, fullMemberCount }: Props) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const request = useKrugRequestDeletion();
  const { requestModule } = useModuleGate();
  const isSolo = fullMemberCount <= 1;

  const handleSubmit = async () => {
    const res = await request.mutateAsync({ krugId, reason: reason.trim() || null });
    if (isOkOutcome(res.outcome)) {
      onOpenChange(false);
      setReason('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[60] max-w-md">
        <DialogHeader>
          <DialogTitle>{t('krug.delete.title', 'Brisanje Kruga')}</DialogTitle>
          <DialogDescription>
            {isSolo
              ? t('krug.delete.confirmSolo', { name: krugName })
              : t('krug.delete.confirmMulti', { name: krugName, count: fullMemberCount })}
          </DialogDescription>
        </DialogHeader>
        {!isSolo && (
          <div className="space-y-2">
            <Label htmlFor="reason">{t('krug.delete.reasonLabel', 'Razlog (opcionalno)')}</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('krug.delete.reasonPlaceholder', '')}
              maxLength={500}
              rows={3}
            />
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={request.isPending}>
            {t('common.cancel', 'Odustani')}
          </Button>
          <Button
            variant="destructive"
            onClick={() => requestModule('krug', { onGranted: () => void handleSubmit() })}
            disabled={request.isPending}
            className="min-w-[120px]"
          >
            {request.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isSolo
              ? t('krug.delete.submitSolo', 'Obriši odmah')
              : t('krug.delete.submit', 'Pošalji zahtjev')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
