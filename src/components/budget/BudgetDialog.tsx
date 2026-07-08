import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { parseLocaleAmount } from '@/lib/money';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useTranslation } from 'react-i18next';
import { 
  Budget, 
  BudgetWithStats, 
  BudgetPeriod, 
  BUDGET_PERIOD_LABELS, 
  DEFAULT_BUDGET_COLORS, 
  DEFAULT_BUDGET_ICONS 
} from '@/types/budget';
import { CATEGORIES } from '@/types/expense';
import { Plus, Trash2, Loader2, Repeat, CalendarRange } from 'lucide-react';
import { cn } from '@/lib/utils';
import { VoiceInputButton } from '@/components/VoiceInputButton';
import { getDateRange, toInputDate, clampInputDate, getDateValidationKey } from '@/lib/dateValidation';
import { showError } from '@/hooks/useStatusFeedback';

interface BudgetDialogProps {
  budget?: BudgetWithStats | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (budget: Partial<BudgetWithStats>) => Promise<void>;
}

interface CategoryLimit {
  category: string;
  limit_amount: number;
  icon?: string;
}

export const BudgetDialog = ({
  budget,
  open,
  onOpenChange,
  onSave,
}: BudgetDialogProps) => {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('💰');
  const [color, setColor] = useState(DEFAULT_BUDGET_COLORS[0]);
  const [periodType, setPeriodType] = useState<BudgetPeriod>('monthly');
  const [totalAmount, setTotalAmount] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [categoryLimits, setCategoryLimits] = useState<CategoryLimit[]>([]);
  const [isRecurring, setIsRecurring] = useState(true);

  useEffect(() => {
    if (budget) {
      setName(budget.name);
      setDescription(budget.description || '');
      setIcon(budget.icon || '💰');
      setColor(budget.color || DEFAULT_BUDGET_COLORS[0]);
      setPeriodType(budget.period_type);
      setTotalAmount(budget.total_amount.toString());
      setStartDate(budget.start_date || '');
      setEndDate(budget.end_date || '');
      setIsRecurring(budget.is_recurring ?? true);
      setCategoryLimits(budget.categories.map(c => ({
        category: c.category,
        limit_amount: c.limit_amount,
        icon: c.icon || undefined,
      })));
    } else {
      resetForm();
    }
  }, [budget, open]);

  const resetForm = () => {
    setName('');
    setDescription('');
    setIcon('💰');
    setColor(DEFAULT_BUDGET_COLORS[0]);
    setPeriodType('monthly');
    setTotalAmount('');
    setStartDate('');
    setEndDate('');
    setIsRecurring(true);
    setCategoryLimits([]);
  };

  const handleAddCategory = () => {
    setCategoryLimits([...categoryLimits, { category: '', limit_amount: 0 }]);
  };

  const handleRemoveCategory = (index: number) => {
    setCategoryLimits(categoryLimits.filter((_, i) => i !== index));
  };

  const handleCategoryChange = (index: number, field: keyof CategoryLimit, value: string | number) => {
    const updated = [...categoryLimits];
    if (field === 'category') {
      const cat = CATEGORIES.find(c => c.id === value);
      updated[index] = { ...updated[index], category: value as string, icon: cat?.icon };
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }
    setCategoryLimits(updated);
  };

  const handleSave = async () => {
    if (!name.trim() || !totalAmount) return;

    setSaving(true);
    try {
      await onSave({
        id: budget?.id,
        name: name.trim(),
        description: description.trim() || null,
        icon,
        color,
        period_type: periodType,
        total_amount: parseLocaleAmount(totalAmount).value,
        start_date: startDate || null,
        end_date: endDate || null,
        is_active: true,
        is_recurring: isRecurring,
        categories: categoryLimits.filter(c => c.category && c.limit_amount > 0).map(c => ({
          ...c,
          id: '',
          budget_id: budget?.id || '',
          spent: 0,
          remaining: c.limit_amount,
          percentage: 0,
          isOverBudget: false,
          isWarning: false,
        })),
      } as any);
    } finally {
      setSaving(false);
    }
  };

  const usedCategories = categoryLimits.map(c => c.category);
  const availableCategories = CATEGORIES.filter(c => !usedCategories.includes(c.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showBackButton={false} className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {budget ? t('budget.editBudget', 'Uredi budžet') : t('budget.createBudget', 'Novi budžet')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Icon & Color */}
          <div className="flex gap-4">
            <div className="space-y-2">
              <Label>{t('common.icon', 'Ikona')}</Label>
              <div className="flex flex-wrap gap-1.5 p-2 border rounded-lg max-w-[140px]">
                {DEFAULT_BUDGET_ICONS.map((i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setIcon(i)}
                    className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center text-lg hover:bg-muted transition-colors",
                      icon === i && "bg-primary/20 ring-2 ring-primary"
                    )}
                  >
                    {i}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2 flex-1">
              <Label>{t('common.color', 'Boja')}</Label>
              <div className="flex flex-wrap gap-1.5 p-2 border rounded-lg">
                {DEFAULT_BUDGET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={cn(
                      "w-8 h-8 rounded-lg transition-all",
                      color === c && "ring-2 ring-offset-2 ring-primary"
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">{t('common.name', 'Naziv')} *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('budget.namePlaceholder', 'npr. Mjesečni budžet')}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">{t('common.description', 'Opis')}</Label>
            <div className="relative">
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('budget.descriptionPlaceholder', 'Opcionalni opis...')}
                rows={2}
                className="pr-12"
              />
              <VoiceInputButton
                value={description}
                onChange={setDescription}
                className="absolute bottom-2 right-2"
              />
            </div>
          </div>

          {/* Period & Amount */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{t('budget.periodLabel', 'Period')}</Label>
              <Select value={periodType} onValueChange={(v) => setPeriodType(v as BudgetPeriod)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(BUDGET_PERIOD_LABELS).map((key) => (
                    <SelectItem key={key} value={key}>{t(`budget.period.${key}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="totalAmount">{t('budget.totalAmount', 'Ukupni iznos')} *</Label>
              <MoneyInput
                id="totalAmount"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                placeholder="0,00"
              />
            </div>
          </div>


          {/* Recurring toggle */}
          {periodType !== 'one_time' && periodType !== 'custom' && (
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-2">
                <Repeat className="w-4 h-4 text-muted-foreground" />
                <div>
                  <Label className="text-sm font-medium">{t('budget.recurring', 'Ponavljajući')}</Label>
                  <p className="text-xs text-muted-foreground">
                    {isRecurring
                      ? t('budget.recurringDesc', 'Budžet se automatski resetira svaki period')
                      : t('budget.nonRecurringDesc', 'Budžet pokriva samo jedan period')}
                  </p>
                </div>
              </div>
              <Switch checked={isRecurring} onCheckedChange={setIsRecurring} />
            </div>
          )}

          {/* Dates - show for non-recurring, custom, and one_time */}
          {(periodType === 'custom' || periodType === 'one_time' || !isRecurring) && (() => {
            const r = getDateRange('budget');
            const startMax = endDate || toInputDate(r.max);
            const endMin = startDate || toInputDate(r.min);
            const { t: tt } = { t };
            return (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="startDate">{t('common.startDate', 'Početak')}</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={startDate}
                    min={toInputDate(r.min)}
                    max={startMax}
                    onChange={(e) => setStartDate(e.target.value)}
                    onBlur={(e) => {
                      const v = e.target.value;
                      if (!v) return;
                      const errKey = getDateValidationKey(v, r);
                      if (errKey) {
                        setStartDate(clampInputDate(v, r));
                        showError(t(errKey));
                      }
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endDate">{t('common.endDate', 'Kraj')}</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={endDate}
                    min={endMin}
                    max={toInputDate(r.max)}
                    onChange={(e) => setEndDate(e.target.value)}
                    onBlur={(e) => {
                      const v = e.target.value;
                      if (!v) return;
                      const errKey = getDateValidationKey(v, r);
                      if (errKey) {
                        setEndDate(clampInputDate(v, r));
                        showError(t(errKey));
                      }
                    }}
                  />
                </div>
              </div>
            );
          })()}

          {/* Category Limits */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>{t('budget.categoryLimits', 'Limiti po kategorijama')}</Label>
              <Button 
                type="button" 
                variant="ghost" 
                size="sm" 
                onClick={handleAddCategory}
                disabled={availableCategories.length === 0}
              >
                <Plus className="w-4 h-4 mr-1" />
                {t('common.add', 'Dodaj')}
              </Button>
            </div>

            {categoryLimits.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3">
                {t('budget.noCategoryLimits', 'Nema limita po kategorijama')}
              </p>
            ) : (
              <div className="space-y-2">
                {categoryLimits.map((cl, index) => (
                  <div key={index} className="flex items-center gap-2 p-2 border rounded-lg">
                    <Select 
                      value={cl.category} 
                      onValueChange={(v) => handleCategoryChange(index, 'category', v)}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder={t('common.selectCategory', 'Odaberi kategoriju')} />
                      </SelectTrigger>
                      <SelectContent>
                        {[...CATEGORIES.filter(c => c.id === cl.category), ...availableCategories].map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.icon} {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      value={cl.limit_amount || ''}
                      onChange={(e) => handleCategoryChange(index, 'limit_amount', parseFloat(e.target.value) || 0)}
                      placeholder="Limit"
                      className="w-24"
                      min="0"
                      step="0.01"
                    />
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="icon"
                      onClick={() => handleRemoveCategory(index)}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel', 'Odustani')}
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim() || !totalAmount}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {budget ? t('common.save', 'Spremi') : t('common.create', 'Kreiraj')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
