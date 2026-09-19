/**
 * ODABIR DRUGE STRANE PRIJENOSA — kad kandidata ima više od jednog.
 *
 * Samo prikaz: korisnik mora VIDJETI datum, iznos, s kojeg na koji novčanik,
 * opis i odakle je redak došao, inače ne može odlučiti. Odluku sprema
 * `setPairChoice`; do odabira redak koči potvrdu uvoza.
 */
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import type { PairCandidateInfo, PairCandidateOrigin } from '@/lib/transferPairMatch';
import { PAIR_CHOICE_NONE } from '@/lib/importReview/state';

interface PairCandidatePickerProps {
  readonly rowIndex: number;
  readonly candidates: readonly PairCandidateInfo[];
  readonly value: string | null;
  readonly onChange: (value: string) => void;
  readonly walletName: (id: string | null) => string;
  readonly formatAmount: (amount: number) => string;
}

const originKey = (origin: PairCandidateOrigin | null): string =>
  origin === 'sync' || origin === 'import' || origin === 'manual'
    ? `importReview.pair.origin.${origin}`
    : 'importReview.pair.origin.manual';

export function PairCandidatePicker({
  rowIndex,
  candidates,
  value,
  onChange,
  walletName,
  formatAmount,
}: PairCandidatePickerProps) {
  const { t } = useTranslation();

  return (
    <div
      className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2 space-y-2"
      data-testid={`pair-candidates-${rowIndex}`}
    >
      <Label className="text-xs text-foreground">{t('importReview.pair.chooseCandidate')}</Label>
      <div className="space-y-1">
        {candidates.map(c => (
          <label
            key={c.id}
            className="flex items-start gap-2 rounded-md p-2 min-h-[44px] cursor-pointer hover:bg-muted/50"
          >
            <input
              type="radio"
              className="mt-1"
              name={`pair-choice-${rowIndex}`}
              value={c.id}
              checked={value === c.id}
              onChange={() => onChange(c.id)}
              data-testid={`pair-candidate-${rowIndex}-${c.id}`}
            />
            <span className="text-xs text-foreground">
              {t('importReview.pair.candidateLine', {
                date: c.date?.slice(0, 10) ?? '',
                amount: formatAmount(c.amount),
                payer: walletName(c.payerWalletId),
                receiver: walletName(c.receiverWalletId),
              })}
              <span className="block text-[11px] text-muted-foreground">
                {c.description ?? ''} · {t(originKey(c.origin))}
              </span>
            </span>
          </label>
        ))}
        <label className="flex items-center gap-2 rounded-md p-2 min-h-[44px] cursor-pointer hover:bg-muted/50">
          <input
            type="radio"
            name={`pair-choice-${rowIndex}`}
            value={PAIR_CHOICE_NONE}
            checked={value === PAIR_CHOICE_NONE}
            onChange={() => onChange(PAIR_CHOICE_NONE)}
            data-testid={`pair-candidate-${rowIndex}-none`}
          />
          <span className="text-xs text-foreground">{t('importReview.pair.none')}</span>
        </label>
      </div>
    </div>
  );
}
