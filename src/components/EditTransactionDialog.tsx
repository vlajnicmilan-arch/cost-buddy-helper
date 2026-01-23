import { useState, useEffect, forwardRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Expense, Category, PaymentSource, CATEGORIES, PAYMENT_SOURCE_GROUPS, TransactionType, getPaymentSourceInfo } from '@/types/expense';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { hr, enUS, de } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useIncomeSources } from '@/hooks/useIncomeSources';
import { useTranslation } from 'react-i18next';

interface EditTransactionDialogProps {
  expense: Expense | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (expense: Expense) => Promise<void>;
}

export const EditTransactionDialog = forwardRef<HTMLDivElement, EditTransactionDialogProps>(({ expense, open, onOpenChange, onSave }, ref) => {
  const { t, i18n } = useTranslation();
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Category>('other');
  const [paymentSource, setPaymentSource] = useState<PaymentSource>('cash');
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [date, setDate] = useState<Date>(new Date());
  const [type, setType] = useState<TransactionType>('expense');
  const [incomeSourceId, setIncomeSourceId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { incomeSources } = useIncomeSources();
  const { customPaymentSources } = useCustomPaymentSources();

  // Get date locale based on current language
  const dateLocale = i18n.language === 'de' ? de : i18n.language === 'en' ? enUS : hr;

  // Get cards for currently selected custom payment source
  const selectedSource = customPaymentSources.find(s => s.id === paymentSource);
  const availableCards = selectedSource?.cards || [];

  // Initialize form when dialog opens or expense changes
  useEffect(() => {
    if (open && expense) {
      setAmount(expense.amount.toString());
      setDescription(expense.description);
      setCategory(expense.category);
      setPaymentSource(expense.payment_source || 'cash');
      setSelectedCardId(expense.payment_source_card_id || null);
      setDate(expense.date instanceof Date ? expense.date : new Date(expense.date));
      setType(expense.type);
      setIncomeSourceId(expense.income_source_id || null);
    }
  }, [open, expense]);

  const handleSave = async () => {
    if (!expense) return;
    
    setSaving(true);
    try {
      await onSave({
        ...expense,
        amount: parseFloat(amount),
        description,
        category,
        payment_source: paymentSource,
        payment_source_card_id: selectedCardId,
        date,
        type,
        income_source_id: incomeSourceId,
        updated_at: new Date().toISOString()
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  // Get dialog title based on transaction type
  const getDialogTitle = () => {
    if (type === 'income') return t('transactions.editIncome');
    if (type === 'transfer') return t('transactions.editTransfer');
    return t('transactions.editExpense');
  };

  if (!expense) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{getDialogTitle()}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Type Toggle */}
          <div className="space-y-2">
            <Label>{t('transactions.type')}</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={type === 'expense' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setType('expense')}
              >
                {t('transactions.expense')}
              </Button>
              <Button
                type="button"
                variant={type === 'income' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setType('income')}
              >
                {t('transactions.income')}
              </Button>
              <Button
                type="button"
                variant={type === 'transfer' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setType('transfer')}
              >
                🔄
              </Button>
            </div>
            {type === 'transfer' && (
              <p className="text-xs text-muted-foreground">
                {t('transactions.transferNote')}
              </p>
            )}
          </div>

          {/* Income Source - For both income and expense */}
          {incomeSources.length > 0 && (
            <div className="space-y-2">
              <Label>{type === 'income' ? t('transactions.incomeSource') : t('transactions.deductFromSource')}</Label>
              <Select 
                value={incomeSourceId || 'none'} 
                onValueChange={(v) => setIncomeSourceId(v === 'none' ? null : v)}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder={type === 'income' ? t('transactions.selectIncomeSource') : t('transactions.selectSource')} />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  <SelectItem value="none">
                    <span className="text-muted-foreground">{t('transactions.noSource')}</span>
                  </SelectItem>
                  {incomeSources.map((source) => (
                    <SelectItem key={source.id} value={source.id}>
                      <span className="flex items-center gap-2">
                        <span>{source.icon || '💰'}</span>
                        <span>{source.name}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {type === 'expense' && incomeSourceId && (
                <p className="text-xs text-muted-foreground">
                  {t('transactions.deductNote')}
                </p>
              )}
            </div>
          )}

          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="amount">{t('transactions.amountEur')}</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">{t('common.description')}</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('transactions.descriptionPlaceholder')}
            />
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label>{t('common.category')}</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    <span className="flex items-center gap-2">
                      <span>{cat.icon}</span>
                      <span>{t(`categories.${cat.id}`)}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Payment Source */}
          <div className="space-y-2">
            <Label>{t('transactions.paymentSource')}</Label>
            <Select 
              value={paymentSource} 
              onValueChange={(v) => {
                setPaymentSource(v as PaymentSource);
                setSelectedCardId(null); // Reset card when changing source
              }}
            >
              <SelectTrigger>
                <SelectValue>
                  {paymentSource && (() => {
                    // Check if it's a custom payment source
                    const customSource = customPaymentSources.find(s => s.id === paymentSource);
                    if (customSource) {
                      return (
                        <span className="flex items-center gap-2">
                          <span 
                            className="w-5 h-5 rounded-full flex items-center justify-center text-white text-xs"
                            style={{ backgroundColor: customSource.color }}
                          >
                            {customSource.icon}
                          </span>
                          <span>{customSource.name}</span>
                        </span>
                      );
                    }
                    // Otherwise use standard payment source info
                    const info = getPaymentSourceInfo(paymentSource);
                    return (
                      <span className="flex items-center gap-2">
                        <span>{info.icon}</span>
                        <span>{t(`paymentSources.${paymentSource}`) !== `paymentSources.${paymentSource}` ? t(`paymentSources.${paymentSource}`) : info.name}</span>
                      </span>
                    );
                  })()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {PAYMENT_SOURCE_GROUPS.map((group) => (
                  <div key={group.label}>
                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide bg-muted/50">
                      {t(`paymentSources.${group.label.toLowerCase().replace(/\s+/g, '')}`) !== `paymentSources.${group.label.toLowerCase().replace(/\s+/g, '')}` 
                        ? t(`paymentSources.${group.label.toLowerCase().replace(/\s+/g, '')}`) 
                        : group.label}
                    </div>
                    {group.sources.map((src) => (
                      <SelectItem key={src.id} value={src.id}>
                        <span className="flex items-center gap-2">
                          <span>{src.icon}</span>
                          <span>{t(`paymentSources.${src.id}`) !== `paymentSources.${src.id}` ? t(`paymentSources.${src.id}`) : src.name}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </div>
                ))}
                {/* Custom Payment Sources */}
                {customPaymentSources.length > 0 && (
                  <div>
                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide bg-muted/50">
                      {t('transactions.customSources')}
                    </div>
                    {customPaymentSources.map((src) => (
                      <SelectItem key={`custom-${src.id}`} value={src.id}>
                        <span className="flex items-center gap-2">
                          <span 
                            className="w-5 h-5 rounded-full flex items-center justify-center text-white text-xs"
                            style={{ backgroundColor: src.color }}
                          >
                            {src.icon}
                          </span>
                          <span>{src.name}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Card Selection - Show when custom payment source with cards is selected */}
          {availableCards.length > 0 && (
            <div className="space-y-2">
              <Label>{t('transactions.selectCard')}</Label>
              <Select 
                value={selectedCardId || 'none'} 
                onValueChange={(v) => setSelectedCardId(v === 'none' ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('transactions.selectCard')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('transactions.noCard')}</SelectItem>
                  {availableCards.map((card) => (
                    <SelectItem key={card.id} value={card.id}>
                      <span className="flex items-center gap-2">
                        <span>💳</span>
                        <span>{card.card_name}</span>
                        <span className="text-muted-foreground">•••• {card.last_four_digits}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Date */}
          <div className="space-y-2">
            <Label>{t('common.date')}</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !date && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "PPP", { locale: dateLocale }) : t('transactions.selectDate')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(d) => d && setDate(d)}
                  locale={dateLocale}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving || !amount || !description}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {t('common.save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
});

EditTransactionDialog.displayName = 'EditTransactionDialog';
