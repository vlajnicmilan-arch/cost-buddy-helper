import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useTranslation } from 'react-i18next';
import { MailReviewList } from '@/components/mail/MailReviewList';

/**
 * MAIL UVOZ — tanki omot oko `MailReviewList`.
 *
 * Dom reda „Na pregled" je od naloga #5 ekran `/dokumenti`; dijalog ostaje
 * samo kao ulaz iz starih mjesta. Logika NIJE duplicirana — jedna komponenta.
 */
export const MailReviewDialog = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('mailReview.title', 'Na pregled')}</DialogTitle>
          <DialogDescription>
            {t('mailReview.description', 'Dokumenti primljeni e-poštom. Ništa se ne sprema dok ne potvrdiš.')}
          </DialogDescription>
        </DialogHeader>
        <MailReviewList active={open} />
      </DialogContent>
    </Dialog>
  );
};
