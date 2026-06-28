import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Wallet } from 'lucide-react';
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

/**
 * Onboarding-only minimalni ručni unos. Tri polja: tip / iznos / način plaćanja.
 * Bez kategorije, datuma (interno = today), opisa, projekta, budgeta.
 *
 * Onboarding-safe fallback: ako nema niti jednog payment source-a, sheet
 * prvo rendira inline "Dodaj prvi način plaćanja" pod-ekran (jedno polje
 * naziva). Korisnik se NIKAD ne navigira van onboardinga.
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
  const { currencyCode } = useCurrency();
  const { lightTap, successVibration } = useHaptics();
  const { addCustomPaymentSource } = useCustomPaymentSources();

  const [type, setType] = useState<EntryType>('expense');
  const [amount, setAmount] = useState('');
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Inline add-source pod-ekran
  const needsSource = customPaymentSources.length === 0;
  const [bootstrapName, setBootstrapName] = useState('');
  const [bootstrapSaving, setBootstrapSaving] = useState(false);

  // Reset polja pri zatvaranju.
  useEffect(() => {
    if (!open) {
      setType('expense');
      setAmount('');
      setSelectedSourceId(null);
      setBootstrapName('');
    }
  }, [open]);

  // Auto-select prvog source-a kad postoji točno jedan (najčešći onboarding slučaj).
  useEffect(() => {
    if (!open) return;
    if (selectedSourceId) return;
    if (customPaymentSources.length === 1) {
      setSelectedSourceId(customPaymentSources[0].id);
    }
  }, [open, customPaymentSources, selectedSourceId]);

  const handleBootstrapSource = async () => {
    const name = (bootstrapName || t('onboarding.manual.defaultSourceName', 'Gotovina')).trim();
    if (!name) return;
    setBootstrapSaving(true);
    try {
      const created = await addCustomPaymentSource({
        name,
        icon: '💵',
        color: '#10b981',
        balance: 0,
        currency: currencyCode,
      } as any);
      if (created?.id) {
        setSelectedSourceId(created.id);
      }
    } catch (e) {
      console.error('Onboarding bootstrap source failed:', e);
      showError(t('errors.generic', 'Došlo je do greške'));
    } finally {
      setBootstrapSaving(false);
    }
  };

  const handleSave = async () => {
    const validation = validateAmountInput(amount);
    if (!validation.valid || !validation.value || validation.value <= 0) {
      showError(t('errors.invalidAmount', 'Neispravan iznos'));
      return;
    }
    if (!selectedSourceId) {
      showError(t('onboarding.manual.paymentLabel', 'Način plaćanja'));
      return;
    }
    lightTap().catch(() => {});
    setSaving(true);
    try {
      // Interni defaulti — nevidljivo korisniku.
      const payload: Omit<Expense, 'id' | 'user_id' | 'created_at' | 'updated_at'> = {
        amount: validation.value,
        category: (type === 'income' ? 'salary' : 'other') as any,
        description: '',
        date: new Date(),
        type,
        paymentSource: `custom:${selectedSourceId}` as any,
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
          <DialogTitle>
            {needsSource && !selectedSourceId
              ? t('onboarding.manual.addSourceTitle', 'Dodaj prvi način plaćanja')
              : t('onboarding.manual.title', 'Brzi unos')}
          </DialogTitle>
        </DialogHeader>

        {needsSource && !selectedSourceId ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t('onboarding.manual.addSourceHint', 'Prije prvog unosa odaberi naziv za svoj novčanik.')}
            </p>
            <div className="space-y-2">
              <Label htmlFor="onb-source-name">{t('onboarding.manual.sourceNameLabel', 'Naziv')}</Label>
              <Input
                id="onb-source-name"
                value={bootstrapName}
                onChange={(e) => setBootstrapName(e.target.value)}
                placeholder={t('onboarding.manual.sourceNamePlaceholder', 'npr. Gotovina')}
                autoFocus
                className="h-12 text-base"
              />
            </div>
            <Button
              onClick={handleBootstrapSource}
              disabled={bootstrapSaving}
              className="w-full min-h-[44px] gap-2"
            >
              <Wallet className="w-4 h-4" />
              {t('onboarding.manual.sourceContinue', 'Nastavi')}
            </Button>
          </div>
        ) : (
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

            {/* Način plaćanja */}
            <div className="space-y-2">
              <Label>{t('onboarding.manual.paymentLabel', 'Način plaćanja')}</Label>
              <div className="grid grid-cols-1 gap-2">
                {customPaymentSources.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedSourceId(s.id)}
                    className={cn(
                      'min-h-[44px] px-3 rounded-lg border flex items-center gap-3 text-left transition-colors',
                      selectedSourceId === s.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-muted/40',
                    )}
                  >
                    <span className="text-lg">{s.icon || '💳'}</span>
                    <span className="text-sm font-medium truncate">{s.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <Button
              onClick={handleSave}
              disabled={saving || !amount.trim() || !selectedSourceId}
              className="w-full min-h-[44px]"
            >
              {saving
                ? t('onboarding.manual.saving', 'Spremam…')
                : t('onboarding.manual.save', 'Spremi')}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
