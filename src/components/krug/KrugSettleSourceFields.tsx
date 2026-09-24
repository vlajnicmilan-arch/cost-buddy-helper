/**
 * "Platio sam iz:" picker + paid-amount field for a cross-currency source.
 * The FX value is only a hint and is never written into the field.
 */
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { convertBySnapshot, normalizeCurrency, type SettleSourceOption } from '@/lib/krugSettleWithSource';
import type { KrugFxSnapshot } from '@/hooks/useKrugSettlementMutations';

interface Props {
  sources: SettleSourceOption[];
  sourceId: string | null;
  onSourceChange: (id: string) => void;
  showPayerAmount: boolean;
  payerAmount: string;
  onPayerAmountChange: (v: string) => void;
  settlementAmount: number;
  settlementCurrency: string;
  sourceCurrency: string | null;
  fxSnapshot: KrugFxSnapshot | null | undefined;
  disabled?: boolean;
}

export function KrugSettleSourceFields({
  sources, sourceId, onSourceChange, showPayerAmount, payerAmount, onPayerAmountChange,
  settlementAmount, settlementCurrency, sourceCurrency, fxSnapshot, disabled,
}: Props) {
  const { t } = useTranslation();
  const srcCur = normalizeCurrency(sourceCurrency);
  const hint = showPayerAmount
    ? convertBySnapshot(settlementAmount, settlementCurrency, srcCur, fxSnapshot?.rates)
    : null;

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="settle-source" className="text-xs">
          {t('krug.settle.dialog.sourceLabel')}
        </Label>
        {sources.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('krug.settle.dialog.noSources')}</p>
        ) : (
          <Select value={sourceId ?? undefined} onValueChange={onSourceChange} disabled={disabled}>
            <SelectTrigger id="settle-source" className="min-h-[44px]" data-testid="settle-source-trigger">
              <SelectValue placeholder={t('krug.settle.dialog.sourcePlaceholder')} />
            </SelectTrigger>
            <SelectContent className="z-[70]">
              {sources.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name} · {normalizeCurrency(s.currency)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {showPayerAmount && (
        <div className="space-y-1.5">
          <Label htmlFor="settle-payer-amount" className="text-xs">
            {t('krug.settle.dialog.paidAmountLabel', { currency: srcCur })}
          </Label>
          <Input
            id="settle-payer-amount"
            inputMode="decimal"
            value={payerAmount}
            onChange={(e) => onPayerAmountChange(e.target.value)}
            disabled={disabled}
            className="min-h-[44px]"
          />
          <p className="text-[11px] text-muted-foreground" data-testid="settle-fx-hint">
            {hint !== null && fxSnapshot
              ? t('krug.settle.dialog.fxHint', {
                  amount: hint.toFixed(2),
                  currency: srcCur,
                  date: new Date(fxSnapshot.frozen_at).toLocaleDateString(),
                })
              : t('krug.settle.dialog.fxHintMissing', { currency: srcCur })}
          </p>
        </div>
      )}
    </div>
  );
}
