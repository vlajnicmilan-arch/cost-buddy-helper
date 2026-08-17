import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MailScopeChip } from '@/components/mail/MailScopeChip';
import { logDiagnostic } from '@/lib/diagnosticLogger';
import type { BusinessProfileLite } from '@/hooks/useBusinessProfiles';

/**
 * RAČUN-KARTICA — KUPAC I ODREDIŠTE.
 *
 * Kupac se očitava iz SADRŽAJA računa, a odredište se iz njega izvodi
 * automatski. Zato promjena odredišta NIJE izbornik nego DISKRETNA SIGURNOSNA
 * RADNJA: „Krivo odredište?" → izričita potvrda da je automatika pogriješila →
 * tek onda izbor. Svaki takav slučaj se bilježi (dijagnostika), jer je to
 * jedini način da se vidi GDJE automatika griješi.
 */
export const MailDestinationRow = ({
  itemId,
  customerName,
  customerOib,
  scopeType,
  scopeId,
  profiles,
  disabled,
  onChange,
}: {
  itemId: string;
  customerName: string | null;
  customerOib: string | null;
  scopeType: string | null;
  scopeId: string | null;
  profiles: BusinessProfileLite[];
  disabled?: boolean;
  onChange: (scopeType: 'user' | 'business_profile', scopeId: string | null) => void;
}) => {
  const { t } = useTranslation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [correcting, setCorrecting] = useState(false);

  const destinationName =
    scopeType === 'business_profile' && scopeId
      ? profiles.find((p) => p.id === scopeId)?.name ?? t('mailReview.scope.personal', 'Osobno')
      : t('mailReview.scope.personal', 'Osobno');

  const customer = (customerName ?? '').trim();

  return (
    <div className="space-y-1 text-xs" data-testid="mail-destination-row">
      <div className="flex flex-wrap items-center gap-x-2">
        <span className="text-muted-foreground">{t('mailReview.customer.label', 'Kupac')}:</span>
        <span data-testid="mail-customer-value" className="break-all">
          {customer || '—'}
          {customer && customerOib ? ` · ${customerOib}` : ''}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-muted-foreground">
          {t('mailReview.destination.label', 'Sprema se u')}:
        </span>
        {correcting ? (
          <MailScopeChip
            scopeType={scopeType}
            scopeId={scopeId}
            profiles={profiles}
            disabled={disabled}
            onChange={(type, id) => {
              setCorrecting(false);
              onChange(type, id);
            }}
          />
        ) : (
          <>
            <span data-testid="mail-destination-value" className="font-medium break-all">
              {destinationName}
            </span>
            <button
              type="button"
              data-testid="mail-destination-wrong"
              className="text-muted-foreground underline underline-offset-2"
              disabled={disabled}
              onClick={() => setConfirmOpen(true)}
            >
              {t('mailReview.destination.wrong', 'Krivo odredište?')}
            </button>
          </>
        )}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t('mailReview.destination.confirmTitle', 'Označi kao krivo prepoznato')}
            </DialogTitle>
            <DialogDescription>
              {t(
                'mailReview.destination.confirmBody',
                'Odredište je određeno prema kupcu s dokumenta. Promijeni ga samo ako je prepoznavanje pogriješilo.',
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row flex-wrap gap-2">
            <Button
              variant="outline"
              className="min-h-[44px]"
              onClick={() => setConfirmOpen(false)}
            >
              {t('common.cancel', 'Odustani')}
            </Button>
            <Button
              className="min-h-[44px]"
              data-testid="mail-destination-confirm-wrong"
              onClick={() => {
                logDiagnostic({
                  event: 'mail_destination_marked_wrong',
                  severity: 'warning',
                  details: {
                    item_id: itemId,
                    scope_type: scopeType,
                    scope_id: scopeId,
                    customer_name: customer || null,
                    customer_oib: customerOib,
                  },
                });
                setConfirmOpen(false);
                setCorrecting(true);
              }}
            >
              {t('mailReview.destination.confirmAction', 'Da, krivo je prepoznato')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
