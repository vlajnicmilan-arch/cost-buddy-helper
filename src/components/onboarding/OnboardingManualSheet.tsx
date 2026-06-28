import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Banknote, CreditCard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useHaptics } from '@/hooks/useHaptics';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { validateAmountInput } from '@/lib/amountValidation';
import { Expense, ReceiptItem } from '@/types/expense';
import { CustomPaymentSource } from '@/types/customPaymentSource';

interface OnboardingManualSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customPaymentSources: CustomPaymentSource[];
  onAddExpense: (
    expense: Omit<Expense, 'id' | 'user_id' | 'created_at' | 'updated_at'>,
    items?: ReceiptItem[],
    isPendingMemberTransaction?: boolean,
  ) => Promise<void>;
}

type EntryType = 'expense' | 'income';
type PayKind = 'cash' | 'card';

const CASH_ICON = '💵';
const CARD_ICON = '💳';

/**
 * Onboarding-only minimalni ručni unos. Polja: tip / iznos / način plaćanja.
 *
 * O1: način plaćanja je zatvoren izbor — isključivo "Gotovina" ili "Kartica".
 * Bez slobodnog teksta, bez liste postojećih izvora, bez bootstrap pod-ekrana.
 * Ako stvarni payment source record ne postoji, kreira ga se interno s
 * deterministom: icon='💵' (Gotovina) ili icon='💳' (Kartica). Reuse-a se po
 * tim ikonama kako se ne bi duplicirao izvor pri ponovljenom onboardingu.
 *
 * Standardni `AddExpenseDialog` se ne dira — ova komponenta postoji samo
 * za guided fazu (zove ju isključivo `GuidedEntryView`).
 */
export const OnboardingManualSheet = ({
  open,
  onOpenChange,
  customPaymentSources,
  onAddExpense,
}: OnboardingManualSheetProps) => {
  const { t } = useTranslation();
  const { currency } = useCurrency();
  const currencyCode = currency.code;
  const { lightTap, successVibration } = useHaptics();
  const { addCustomPaymentSource } = useCustomPaymentSources();

  const [type, setType] = useState<EntryType>('expense');
  const [amount, setAmount] = useState('');
  const [payKind, setPayKind] = useState<PayKind | null>(null);
  const [saving, setSaving] = useState(false);

  // Reset polja pri zatvaranju.
  useEffect(() => {
    if (!open) {
      setType('expense');
      setAmount('');
      setPayKind(null);
    }
  }, [open]);

  // Pre-detekcija već postojećih izvora (po ikoni).
  const existing = useMemo(() => {
    const cash = customPaymentSources.find((s) => s.icon === CASH_ICON) ?? null;
    const card = customPaymentSources.find((s) => s.icon === CARD_ICON) ?? null;
    return { cash, card };
  }, [customPaymentSources]);

  const resolveSourceId = async (kind: PayKind): Promise<string | null> => {
    if (kind === 'cash' && existing.cash) return existing.cash.id;
    if (kind === 'card' && existing.card) return existing.card.id;
    const created = await addCustomPaymentSource({
      name:
        kind === 'cash'
          ? t('onboarding.manual.optionCash', 'Gotovina')
          : t('onboarding.manual.optionCard', 'Kartica'),
      icon: kind === 'cash' ? CASH_ICON : CARD_ICON,
      color: kind === 'cash' ? '#10b981' : '#3b82f6',
      balance: 0,
      currency: currencyCode,
    } as any);
    return created?.id ?? null;
  };

  const handleSave = async () => {
    const validation = validateAmountInput(amount);
    if (!validation.valid || !validation.value || validation.value <= 0) {
      showError(t('errors.invalidAmount', 'Neispravan iznos'));
      return;
    }
    if (!payKind) {
      showError(t('onboarding.manual.paymentLabel', 'Način plaćanja'));
      return;
    }
    lightTap().catch(() => {});
    setSaving(true);
    try {
      const sourceId = await resolveSourceId(payKind);
      if (!sourceId) throw new Error('payment_source_unavailable');

      const payload: Omit<Expense, 'id' | 'user_id' | 'created_at' | 'updated_at'> = {
        amount: validation.value,
        category: (type === 'income' ? 'salary' : 'other') as any,
        description: '',
        date: new Date(),
        type,
        paymentSource: `custom:${sourceId}` as any,
        currency: currencyCode,
      } as any;
      await onAddExpense(payload);
      successVibration().catch(() => {});
      showSuccess(t('toasts.saved', 'Spremljeno'));
      onOpenChange(false);
    } catch (e) {
      console.error('Onboarding manual save failed:', e);
      showError(t('errors.generic', 'Došlo je do greške'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('onboarding.manual.title', 'Brzi unos')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Tip toggle */}
          <div className="grid grid-cols-2 gap-2">
            {(['expense', 'income'] as EntryType[]).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setType(opt)}
                className={cn(
                  'min-h-[44px] rounded-lg border text-sm font-medium transition-colors',
                  type === opt
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background hover:bg-muted/40 border-border',
                )}
              >
                {opt === 'expense'
                  ? t('onboarding.manual.typeExpense', 'Trošak')
                  : t('onboarding.manual.typeIncome', 'Prihod')}
              </button>
            ))}
          </div>

          {/* Iznos */}
          <div className="space-y-2">
            <Label htmlFor="onb-amount">{t('onboarding.manual.amountLabel', 'Iznos')}</Label>
            <Input
              id="onb-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={t('onboarding.manual.amountPlaceholder', '0,00')}
              className="h-12 text-base text-center tabular-nums"
              autoFocus
            />
          </div>

          {/* Način plaćanja — zatvoreni izbor: Gotovina / Kartica */}
          <div className="space-y-2">
            <Label>{t('onboarding.manual.paymentLabel', 'Način plaćanja')}</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPayKind('cash')}
                className={cn(
                  'min-h-[56px] px-3 rounded-lg border flex items-center justify-center gap-2 text-sm font-medium transition-colors',
                  payKind === 'cash'
                    ? 'border-primary bg-primary/5 text-foreground'
                    : 'border-border hover:bg-muted/40',
                )}
              >
                <Banknote className="w-4 h-4" />
                {t('onboarding.manual.optionCash', 'Gotovina')}
              </button>
              <button
                type="button"
                onClick={() => setPayKind('card')}
                className={cn(
                  'min-h-[56px] px-3 rounded-lg border flex items-center justify-center gap-2 text-sm font-medium transition-colors',
                  payKind === 'card'
                    ? 'border-primary bg-primary/5 text-foreground'
                    : 'border-border hover:bg-muted/40',
                )}
              >
                <CreditCard className="w-4 h-4" />
                {t('onboarding.manual.optionCard', 'Kartica')}
              </button>
            </div>
          </div>

          <Button
            onClick={handleSave}
            disabled={saving || !amount.trim() || !payKind}
            className="w-full min-h-[44px]"
          >
            {saving
              ? t('onboarding.manual.saving', 'Spremam…')
              : t('onboarding.manual.save', 'Spremi')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
