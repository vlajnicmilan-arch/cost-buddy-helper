import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { BudgetPlan, DEFAULT_BUDGET_COLORS, DEFAULT_BUDGET_ICONS, BudgetPeriodType } from '@/types/budget';
import { useTranslation } from 'react-i18next';

interface BudgetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budget: BudgetPlan | null;
  onSave: (data: Omit<BudgetPlan, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => Promise<void>;
  onUpdate: (budget: BudgetPlan) => Promise<void>;
}

export const BudgetDialog = ({ open, onOpenChange, budget, onSave, onUpdate }: BudgetDialogProps) => {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('💰');
  const [color, setColor] = useState('#3b82f6');
  const [periodType, setPeriodType] = useState<BudgetPeriodType>('monthly');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (budget) {
      setName(budget.name);
      setDescription(budget.description || '');
      setIcon(budget.icon || '💰');
      setColor(budget.color || '#3b82f6');
      setPeriodType(budget.period_type);
      setStartDate(budget.start_date || '');
      setEndDate(budget.end_date || '');
      setIsActive(budget.is_active);
    } else {
      resetForm();
    }
  }, [budget, open]);

  const resetForm = () => {
    setName('');
    setDescription('');
    setIcon('💰');
    setColor('#3b82f6');
    setPeriodType('monthly');
    setStartDate('');
    setEndDate('');
    setIsActive(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const data = {
      name: name.trim(),
      description: description.trim() || null,
      icon,
      color,
      period_type: periodType,
      start_date: startDate || null,
      end_date: endDate || null,
      is_active: isActive
    };

    if (budget) {
      await onUpdate({ ...budget, ...data });
    } else {
      await onSave(data);
    }

    onOpenChange(false);
    resetForm();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {budget ? t('budget.edit', 'Uredi budžet') : t('budget.create', 'Novi budžet')}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t('common.name', 'Naziv')}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('budget.namePlaceholder', 'npr. Mjesečni budžet')}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>{t('common.description', 'Opis')}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('budget.descriptionPlaceholder', 'Opišite budžet...')}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('common.icon', 'Ikona')}</Label>
              <Select value={icon} onValueChange={setIcon}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEFAULT_BUDGET_ICONS.map((i) => (
                    <SelectItem key={i} value={i}>
                      <span className="text-xl">{i}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('common.color', 'Boja')}</Label>
              <div className="flex flex-wrap gap-2">
                {DEFAULT_BUDGET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-6 h-6 rounded-full border-2 transition-all ${
                      color === c ? 'border-foreground scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t('budget.period', 'Razdoblje')}</Label>
            <Select value={periodType} onValueChange={(v) => setPeriodType(v as BudgetPeriodType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">{t('budget.monthly', 'Mjesečni')}</SelectItem>
                <SelectItem value="yearly">{t('budget.yearly', 'Godišnji')}</SelectItem>
                <SelectItem value="custom">{t('budget.custom', 'Prilagođeni')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {periodType === 'custom' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('common.startDate', 'Početak')}</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('common.endDate', 'Kraj')}</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <Label>{t('budget.active', 'Aktivan')}</Label>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel', 'Odustani')}
            </Button>
            <Button type="submit">
              {budget ? t('common.save', 'Spremi') : t('common.create', 'Kreiraj')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
