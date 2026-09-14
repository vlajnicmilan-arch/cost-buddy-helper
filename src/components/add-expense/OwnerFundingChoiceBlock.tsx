/**
 * „Kako knjižiti?" — zaseban blok ispod odabira novčanika.
 *
 * Prikazuje se SAMO kad je trošak firmin, a plaćen je osobnim novčanikom ili
 * novčanikom druge tvrtke. Odluka nikad ne visi o popisu novčanika: popis
 * nabraja izvore, ovaj blok nosi knjiženje. Ista komponenta služi ručnom
 * unosu i skenu — jedan izgled, jedno ponašanje.
 */
import { useTranslation } from 'react-i18next';
import { HandCoins } from 'lucide-react';

export type OwnerFundingChoiceValue = 'owner_loan' | 'material';

interface Props {
  value: OwnerFundingChoiceValue;
  onChange: (next: OwnerFundingChoiceValue) => void;
}

export const OwnerFundingChoiceBlock = ({ value, onChange }: Props) => {
  const { t } = useTranslation();

  const options: { value: OwnerFundingChoiceValue; label: string; hint: string }[] = [
    {
      value: 'owner_loan',
      label: t('scanner.routing.choiceOwnerLoan', 'Pozajmica vlasnika'),
      hint: t('scanner.routing.choiceOwnerLoanHint', 'Tvrtka ti ostaje dužna iznos.'),
    },
    {
      value: 'material',
      label: t('scanner.routing.choiceMaterialCompany', 'Materijalni trošak firme'),
      hint: t('scanner.routing.choiceMaterialHint', 'Trošak firme bez pozajmice.'),
    },
  ];

  return (
    <div
      className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-3 space-y-2"
      data-testid="owner-funding-choice-block"
    >
      <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
        <HandCoins className="w-4 h-4 shrink-0" aria-hidden />
        <span className="text-sm font-medium">
          {t('scanner.routing.fundingBlockTitle', 'Kako knjižiti?')}
        </span>
      </div>
      <div className="space-y-1.5">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={value === opt.value}
            data-testid={`owner-funding-choice-${opt.value}`}
            className={`w-full min-h-[44px] text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
              value === opt.value
                ? 'bg-background border-primary text-foreground'
                : 'bg-background/50 border-border text-muted-foreground'
            }`}
          >
            <span className="font-medium block text-sm">{opt.label}</span>
            <span className="block text-[11px] opacity-80">{opt.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
