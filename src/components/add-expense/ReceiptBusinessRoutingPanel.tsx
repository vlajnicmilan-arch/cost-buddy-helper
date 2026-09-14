/**
 * Pregled skena — oznaka/ponuda poslovnog profila i izbor knjiženja.
 *
 * Smjer je uvijek prema poslovnom: automatika (OIB) ili ponuda (ime) mogu
 * trošak premjestiti u tvrtku, nikad iz tvrtke u osobno bez izričitog dodira.
 */
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Building2 } from 'lucide-react';

interface Props {
  /** 'auto' = prepoznat OIB, 'offer' = samo ime, null = ništa za prikaz. */
  mode: 'auto' | 'offer' | null;
  profileName: string | null;
  onUndo: () => void;
  onAcceptOffer: () => void;
  onDeclineOffer: () => void;
}

export const ReceiptBusinessRoutingPanel = ({
  mode,
  profileName,
  onUndo,
  onAcceptOffer,
  onDeclineOffer,
}: Props) => {
  const { t } = useTranslation();
  if (!mode) return null;

  return (
    <div className="space-y-2" data-testid="receipt-business-routing">
      {mode === 'auto' && (
        <div className="text-xs rounded-lg px-3 py-2 bg-primary/10 border border-primary/30 text-primary flex items-start gap-2">
          <Building2 className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
          <div className="flex-1 min-w-0 space-y-1">
            <p>
              {t('scanner.routing.autoNotice', 'Račun glasi na {{company}} — spremam u poslovni profil.', {
                company: profileName ?? '',
              })}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9"
              onClick={onUndo}
            >
              {t('scanner.routing.undo', 'Ne, osobno')}
            </Button>
          </div>
        </div>
      )}

      {mode === 'offer' && (
        <div className="text-xs rounded-lg px-3 py-2 bg-muted border border-border text-foreground flex items-start gap-2">
          <Building2 className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
          <div className="flex-1 min-w-0 space-y-2">
            <p>
              {t('scanner.routing.offerQuestion', 'Kupac izgleda kao {{company}} — spremiti u poslovni profil?', {
                company: profileName ?? '',
              })}
            </p>
            <div className="flex gap-2">
              <Button type="button" size="sm" className="h-9" onClick={onAcceptOffer}>
                {t('common.yes', 'Da')}
              </Button>
              <Button type="button" size="sm" variant="outline" className="h-9" onClick={onDeclineOffer}>
                {t('scanner.routing.offerDecline', 'Ne, osobno')}
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
