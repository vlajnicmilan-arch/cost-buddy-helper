import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CATEGORIES, getCategoryInfo, INCOME_CATEGORIES, Category, IncomeCategory, TransactionType } from '@/types/expense';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import { useCustomCategories } from '@/hooks/useCustomCategories';
import { RecurringTransaction, RecurringTransactionInsert } from '@/hooks/useRecurringTransactions';
import { Save, X } from 'lucide-react';

interface RecurringTransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: RecurringTransactionInsert) => Promise<void>;
  editData?: RecurringTransaction | null;
}

export const RecurringTransactionDialog = ({ open, onOpenChange, onSave, editData }: RecurringTransactionDialogProps) => {
  const { t } = useTranslation();
  const { customPaymentSources } = useCustomPaymentSources();
  const { customCategories } = useCustomCategories();

  const FREQUENCY_OPTIONS = [
    { value: 'daily', label: t('recurring.daily') },
    { value: 'weekly', label: t('recurring.weekly') },
    { value: 'biweekly', label: t('recurring.biweekly') },
    { value: 'monthly', label: t('recurring.monthly') },
    { value: 'yearly', label: t('recurring.yearly') },
  ];

  const [type, setType] = useState<TransactionType>('expense');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<string>('bills');
  const [merchantName, setMerchantName] = useState('');
  const [paymentSource, setPaymentSource] = useState<string>('cash');
  const [transferTo, setTransferTo] = useState<string>('');
  const [frequency, setFrequency] = useState<string>('monthly');
  const [dayOfMonth, setDayOfMonth] = useState<string>('1');
  const [nextDueDate, setNextDueDate] = useState(new Date().toISOString().split('T')[0]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editData) {
      setType(editData.type as TransactionType);
      setDescription(editData.description);
      setAmount(editData.amount.toString());
      setCategory(editData.category);
      setMerchantName(editData.merchant_name || '');
      setPaymentSource(editData.payment_source || 'cash');
      setTransferTo(editData.transfer_to_source || '');
      setFrequency(editData.frequency);
      setDayOfMonth(editData.day_of_month?.toString() || '1');
      setNextDueDate(editData.next_due_date);
      setNote(editData.note || '');
    } else {
      resetForm();
    }
  }, [editData, open]);

  const resetForm = () => {
    setType('expense');
    setDescription('');
    setAmount('');
    setCategory('bills');
    setMerchantName('');
    setPaymentSource('cash');
    setTransferTo('');
    setFrequency('monthly');
    setDayOfMonth('1');
    setNextDueDate(new Date().toISOString().split('T')[0]);
    setNote('');
  };

  const handleSave = async () => {
    if (!description.trim() || !amount || parseFloat(amount) <= 0) {
      return;
    }

    setSaving(true);
    try {
      await onSave({
        description: description.trim(),
        amount: parseFloat(amount),
        type,
        category,
        payment_source: paymentSource,
        payment_source_card_id: null,
        income_source_id: null,
        merchant_name: merchantName.trim() || null,
        note: note.trim() || null,
        transfer_to_source: type === 'transfer' ? transferTo : null,
        frequency: frequency as any,
        day_of_month: frequency === 'monthly' ? parseInt(dayOfMonth) : null,
        day_of_week: null,
        next_due_date: nextDueDate,
        last_generated_date: null,
        is_active: true,
      });
      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const allCategories = type === 'income'
    ? INCOME_CATEGORIES.map(c => ({ id: c.id, name: c.name, icon: c.icon }))
    : [
        ...customCategories.map(c => ({ id: c.id, name: c.name, icon: c.icon })),
        ...CATEGORIES.map(c => ({ id: c.id, name: c.name, icon: c.icon })),
      ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editData ? t('recurring.editTransaction') : t('recurring.newTransaction')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Type toggle */}
          <div className="grid grid-cols-3 gap-1 p-1 bg-muted rounded-xl">
            {(['expense', 'income', 'transfer'] as TransactionType[]).map(tp => (
              <Button
                key={tp}
                type="button"
                variant={type === tp ? 'default' : 'ghost'}
                size="sm"
                className="rounded-lg text-xs"
                onClick={() => {
                  setType(tp);
                  if (tp === 'income') setCategory('salary');
                  else if (tp === 'expense') setCategory('bills');
                }}
              >
                {tp === 'expense' ? t('recurring.expense') : tp === 'income' ? t('recurring.income') : t('recurring.transfer')}
              </Button>
            ))}
          </div>

          {/* Merchant */}
          <div className="space-y-1.5">
            <Label className="text-sm">{t('recurring.merchantLabel')}</Label>
            <Input
              placeholder={t('recurring.merchantPlaceholder')}
              value={merchantName}
              onChange={e => setMerchantName(e.target.value)}
              className="h-11 rounded-xl"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="text-sm">{t('recurring.descriptionLabel')}</Label>
            <Input
              placeholder={t('recurring.descriptionPlaceholder')}
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="h-11 rounded-xl"
            />
          </div>

          {/* Amount */}
          <div className="space-y-1.5">
            <Label className="text-sm">{t('recurring.amountLabel')}</Label>
            <Input
              type="number"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="h-11 rounded-xl font-mono"
            />
          </div>

          {/* Category */}
          {type !== 'transfer' && (
            <div className="space-y-1.5">
              <Label className="text-sm">{t('recurring.categoryLabel')}</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allCategories.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.icon} {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Payment Source */}
          <div className="space-y-1.5">
            <Label className="text-sm">{type === 'transfer' ? t('recurring.fromAccount') : t('recurring.paymentSourceLabel')}</Label>
            <Select value={paymentSource} onValueChange={setPaymentSource}>
              <SelectTrigger className="h-11 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">{t('recurring.cash')}</SelectItem>
                {customPaymentSources.map(s => (
                  <SelectItem key={s.id} value={`custom:${s.id}`}>
                    {s.icon} {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Transfer destination */}
          {type === 'transfer' && (
            <div className="space-y-1.5">
              <Label className="text-sm">{t('recurring.toAccount')}</Label>
              <Select value={transferTo} onValueChange={setTransferTo}>
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue placeholder={t('recurring.selectDestination')} />
                </SelectTrigger>
                <SelectContent>
                  {customPaymentSources
                    .filter(s => `custom:${s.id}` !== paymentSource)
                    .map(s => (
                      <SelectItem key={s.id} value={`custom:${s.id}`}>
                        {s.icon} {s.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Frequency */}
          <div className="space-y-1.5">
            <Label className="text-sm">{t('recurring.frequencyLabel')}</Label>
            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger className="h-11 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FREQUENCY_OPTIONS.map(f => (
                  <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Day of month for monthly */}
          {frequency === 'monthly' && (
            <div className="space-y-1.5">
              <Label className="text-sm">{t('recurring.dayOfMonth')}</Label>
              <Input
                type="number"
                min="1"
                max="31"
                value={dayOfMonth}
                onChange={e => setDayOfMonth(e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>
          )}

          {/* Next due date */}
          <div className="space-y-1.5">
            <Label className="text-sm">{t('recurring.nextDueDate')}</Label>
            <Input
              type="date"
              value={nextDueDate}
              onChange={e => setNextDueDate(e.target.value)}
              className="h-11 rounded-xl"
            />
          </div>

          {/* Note */}
          <div className="space-y-1.5">
            <Label className="text-sm">{t('recurring.noteLabel')}</Label>
            <Input
              placeholder={t('recurring.notePlaceholder')}
              value={note}
              onChange={e => setNote(e.target.value)}
              className="h-11 rounded-xl"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1 rounded-xl"
              onClick={() => onOpenChange(false)}
            >
              <X className="w-4 h-4 mr-1" /> {t('recurring.cancel')}
            </Button>
            <Button
              className="flex-1 rounded-xl"
              onClick={handleSave}
              disabled={saving || !description.trim() || !amount || parseFloat(amount) <= 0}
            >
              <Save className="w-4 h-4 mr-1" /> {editData ? t('recurring.save') : t('recurring.add')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
