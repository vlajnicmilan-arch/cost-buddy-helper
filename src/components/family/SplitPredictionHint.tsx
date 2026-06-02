import { useTranslation } from 'react-i18next';
import { Scale, Loader2 } from 'lucide-react';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useFamilySplitPrediction } from '@/hooks/useFamilySplitPrediction';

interface Props {
  paymentSource: string | null | undefined;
  amount: number;
  currency?: string;
}

/**
 * Inline real-time preview shown under the Amount field when the selected
 * payment source belongs to a family shared wallet. Renders nothing if
 * the source is not shared, or if amount is non-positive.
 *
 * Pure presentation — relies on useFamilySplitPrediction for data.
 */
export function SplitPredictionHint({ paymentSource, amount, currency }: Props) {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const hasAmount = Number.isFinite(amount) && amount > 0;
  const { prediction, loading } = useFamilySplitPrediction(
    paymentSource,
    hasAmount ? amount : 0,
  );

  if (!hasAmount) return null;

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        {t('family.split.prediction.loading', 'Računam podjelu…')}
      </div>
    );
  }

  if (!prediction || prediction.shares.length === 0) return null;

  const modeLabel =
    prediction.mode === 'proportional_income'
      ? t('family.split.settings.modeProportional', 'Proporcionalno prihodu')
      : prediction.mode === 'manual'
        ? t('family.split.settings.modeManual', 'Ručno')
        : t('family.split.settings.modeEqual', 'Podjednako');

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs font-medium text-primary">
        <Scale className="h-3.5 w-3.5" />
        <span className="truncate">
          {t('family.split.prediction.title', 'Predviđena podjela')} ·{' '}
          <span className="font-normal text-muted-foreground">{modeLabel}</span>
        </span>
      </div>
      <ul className="space-y-1">
        {prediction.shares.map((s) => (
          <li
            key={s.user_id}
            className="flex items-center justify-between text-xs"
          >
            <span className="truncate text-foreground">
              {s.display_name || t('family.unknownMember', 'Član')}
            </span>
            <span className="font-mono text-muted-foreground shrink-0 pl-2">
              {formatAmount(s.share, currency as any)} ({Math.round(s.ratio * 100)}%)
            </span>
          </li>
        ))}
      </ul>
      <p className="text-[10px] text-muted-foreground leading-tight">
        {t(
          'family.split.prediction.disclaimer',
          'Procjena prije snimanja; ručni override moguć nakon spremanja.',
        )}
      </p>
    </div>
  );
}
