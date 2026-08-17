import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink, ShieldAlert, X } from 'lucide-react';
import type { MailReviewItem } from '@/hooks/useMailReviewQueue';

/**
 * KARTICA GMAILOVE POTVRDE PROSLJEĐIVANJA.
 *
 * Poruka nije dokument: nema dobavljača, iznosa ni datuma. Prikazuje se ono
 * što nosi — adresa koja se prosljeđuje, potvrdni kod i (samo ako je link
 * dokazano Googleov i poruka autentificirana) gumb koji otvara Googleovu
 * stranicu. NIŠTA se ne potvrđuje automatski; klik je uvijek korisnikov.
 */

interface Props {
  item: MailReviewItem;
  disabled?: boolean;
  onDiscard: () => void;
  /**
   * Klik na „Otvori potvrdu": stavka ODMAH napušta red „Na pregled" i prelazi
   * u stanje čekanja prvog maila. Ne čeka se povratak s Googleove stranice.
   */
  onOpenConfirm: () => void;
}

export const VerificationReviewCard = ({ item, disabled, onDiscard, onOpenConfirm }: Props) => {

  const { t } = useTranslation();
  const extraction = (item.extraction ?? {}) as Record<string, unknown>;
  const confirmUrl = typeof extraction.confirmUrl === 'string' ? extraction.confirmUrl : null;
  const code = extraction.code === null || extraction.code === undefined ? null : String(extraction.code);
  const forwardedAddress =
    typeof extraction.forwardedAddress === 'string' ? extraction.forwardedAddress : null;

  return (
    <div
      data-testid="mail-verification-item"
      className="rounded-lg border border-l-4 border-l-primary bg-muted/40 p-3 space-y-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">
          {t('mailReview.verification.badge', 'Potvrda prosljeđivanja')}
        </Badge>
      </div>

      <div className="space-y-1">
        <p className="text-sm font-medium">
          {t('mailReview.verification.title', 'Gmail traži potvrdu prosljeđivanja')}
        </p>
        <p className="text-xs text-muted-foreground break-all">
          {forwardedAddress
            ? t(
                'mailReview.verification.body',
                'Google traži potvrdu da e-poštu s adrese {{address}} smije prosljeđivati u aplikaciju.',
                { address: forwardedAddress },
              )
            : t(
                'mailReview.verification.bodyNoAddress',
                'Google traži potvrdu prosljeđivanja e-pošte u aplikaciju.',
              )}
        </p>
      </div>

      {code && (
        <p className="text-xs text-muted-foreground" data-testid="mail-verification-code">
          {t('mailReview.verification.code', 'Kod za potvrdu')}:{' '}
          <span className="font-mono font-medium text-foreground">{code}</span>
        </p>
      )}

      {!confirmUrl && !code && (
        <div
          data-testid="mail-verification-no-link"
          className="flex items-start gap-2 rounded-md border border-document-pending bg-document-pending-surface p-2 text-xs text-document-pending-foreground"
        >
          <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            {t(
              'mailReview.verification.noLink',
              'Poveznica nije provjereno Googleova, pa je ne otvaramo. Potvrdu dovrši u Gmail postavkama (Prosljeđivanje i POP/IMAP) upisom koda.',
            )}
          </span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {confirmUrl && (
          <Button
            asChild
            size="sm"
            className="min-h-[44px]"
            data-testid="mail-verification-open"
            onClick={onOpenConfirm}
          >
            <a href={confirmUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />
              {t('mailReview.verification.open', 'Otvori potvrdu')}
            </a>
          </Button>
        )}

        <Button
          size="sm"
          variant="outline"
          className="min-h-[44px]"
          disabled={disabled}
          onClick={onDiscard}
        >
          <X className="h-4 w-4 mr-2" />
          {t('mailReview.verification.dismiss', 'Odbaci')}
        </Button>
      </div>
    </div>
  );
};
