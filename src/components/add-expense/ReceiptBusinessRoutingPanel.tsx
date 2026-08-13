/**
 * Pregled skena — oznaka/ponuda poslovnog profila i izbor knjiženja.
 *
 * Smjer je uvijek prema poslovnom: automatika (OIB) ili ponuda (ime) mogu
 * trošak premjestiti u tvrtku, nikad iz tvrtke u osobno bez izričitog dodira.
 */
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Building2 } from 'lucide-react';
import type { OwnerFundingChoice } from '@/lib/receiptBusinessRouting';

interface Props {
  /** 'auto' = prepoznat OIB, 'offer' = samo ime, null = ništa za prikaz. */
  mode: 'auto' | 'offer' | null;
  profileName: string | null;
  onUndo: () => void;
  onAcceptOffer: () => void;
  onDeclineOffer: () => void;
  /** Prikazuje izbor knjiženja (poslovni cilj + osobni izvor plaćanja). */
  showFundingChoice: boolean;
  fundingChoice: OwnerFundingChoice;
  onFundingChoiceChange: (choice: OwnerFundingChoice) => void;
}

export const ReceiptBusinessRoutingPanel = ({
  mode,
  profileName,
  onUndo,
  onAcceptOffer,
  onDeclineOffer,
  showFundingChoice,
  fundingChoice,
  onFundingChoiceChange,
}: Props) => {
  const { t } = useTranslation();
  if (!mode && !showFundingChoice) return null;

  const options: { value: OwnerFundingChoice; label: string; hint: string }[] = [
    {
      value: 'owner_loan',
      label: t('scanner.routing.choiceOwnerLoan', 'Pozajmica vlasnika'),
      hint: t('scanner.routing.choiceOwnerLoanHint', 'Tvrtka ti ostaje dužna iznos.'),
    },
    {
      value: 'material',
      label: t('scanner.routing.choiceMaterial', 'Materijalni trošak'),
      hint: t('scanner.routing.choiceMaterialHint', 'Trošak firme bez pozajmice.'),
    },
    {
      value: 'personal',
      label: t('scanner.routing.choicePersonal', 'Ne, ovo je osobno'),
      hint: t('scanner.routing.choicePersonalHint', 'Ostaje u osobnom profilu.'),
    },
  ];

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

      {showFundingChoice && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 space-y-2">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
            {t('scanner.routing.fundingTitle', 'Poslovni račun plaćen osobnim izvorom — kako knjižimo?')}
          </p>
          <div className="space-y-1">
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onFundingChoiceChange(opt.value)}
                aria-pressed={fundingChoice === opt.value}
                className={`w-full min-h-[44px] text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                  fundingChoice === opt.value
                    ? 'bg-background border-primary text-foreground'
                    : 'bg-background/50 border-border text-muted-foreground'
                }`}
              >
                <span className="font-medium block">{opt.label}</span>
                <span className="block text-[11px] opacity-80">{opt.hint}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
