import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  CalendarIcon,
  CreditCard,
  Loader2,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { CATEGORIES, type Category, type TransactionType } from '@/types/expense';
import { makeCalendarDisabled, type DateRange as DateLimits } from '@/lib/dateValidation';
import { AdvanceLinkSection } from '@/components/add-expense/AdvanceLinkSection';
import type { ProjectMilestone } from '@/types/project';

interface ProjectTransactionAddDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  saving: boolean;
  // form state
  expenseType: TransactionType;
  setExpenseType: (v: TransactionType) => void;
  amount: string;
  setAmount: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  category: Category;
  setCategory: (v: Category) => void;
  date: Date;
  setDate: (v: Date) => void;
  milestoneId: string;
  setMilestoneId: (v: string) => void;
  paymentSourceValue: string;
  setPaymentSourceValue: (v: string) => void;
  expenseNature: 'regular' | 'extraordinary';
  setExpenseNature: (v: 'regular' | 'extraordinary') => void;
  isAdvance: boolean;
  setIsAdvance: (v: boolean) => void;
  collaboratorId: string | null;
  setCollaboratorId: (v: string | null) => void;
  linkedAdvanceIds: string[];
  setLinkedAdvanceIds: (v: string[]) => void;
  addDateOpen: boolean;
  setAddDateOpen: (v: boolean) => void;
  // data
  milestones: ProjectMilestone[];
  customPaymentSources: Array<{ id: string; name: string; icon: string }>;
  currencySymbol: string;
  formatAmount: (n: number) => string;
  addDateRangeLimits: DateLimits;
  // actions
  onCancel: () => void;
  onSubmit: () => void;
}

export const ProjectTransactionAddDialog = ({
  open,
  onOpenChange,
  projectId,
  saving,
  expenseType,
  setExpenseType,
  amount,
  setAmount,
  description,
  setDescription,
  category,
  setCategory,
  date,
  setDate,
  milestoneId,
  setMilestoneId,
  paymentSourceValue,
  setPaymentSourceValue,
  expenseNature,
  setExpenseNature,
  isAdvance,
  setIsAdvance,
  collaboratorId,
  setCollaboratorId,
  linkedAdvanceIds,
  setLinkedAdvanceIds,
  addDateOpen,
  setAddDateOpen,
  milestones,
  customPaymentSources,
  currencySymbol,
  formatAmount,
  addDateRangeLimits,
  onCancel,
  onSubmit,
}: ProjectTransactionAddDialogProps) => {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('projects.addExpense', 'Dodaj trošak na projekt')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <Button
              type="button"
              variant={expenseType === 'expense' ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => setExpenseType('expense')}
            >
              <TrendingDown className="w-4 h-4 mr-2" />
              {t('transactions.expense', 'Trošak')}
            </Button>
            <Button
              type="button"
              variant={expenseType === 'income' ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => setExpenseType('income')}
            >
              <TrendingUp className="w-4 h-4 mr-2" />
              {t('transactions.income', 'Prihod')}
            </Button>
          </div>

          <div className="space-y-2">
            <Label>{t('common.amount')}</Label>
            <div className="relative">
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="pr-12 text-lg"
                min="0"
                step="0.01"
                autoFocus
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {currencySymbol}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t('common.description')}</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('transactions.descriptionPlaceholder', 'npr. Materijali za gradnju')}
            />
          </div>

          {milestones.length > 0 && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Target className="w-4 h-4" />
                {t('projects.milestone', 'Faza projekta')}
              </Label>
              <Select value={milestoneId} onValueChange={setMilestoneId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('projects.selectMilestone', 'Odaberi fazu (opcionalno)')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('projects.noMilestone', 'Bez faze')}</SelectItem>
                  {milestones.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                      {m.budget > 0 && (
                        <span className="text-muted-foreground ml-2">
                          ({formatAmount(m.spent || 0)} / {formatAmount(m.budget)})
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>{t('common.category')}</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    <div className="flex items-center gap-2">
                      <span>{cat.icon}</span>
                      <span>{cat.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t('common.date')}</Label>
            <Popover open={addDateOpen} onOpenChange={setAddDateOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(date, 'd. MMMM yyyy', { locale: hr })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(d) => {
                    if (d) {
                      setDate(d);
                      setAddDateOpen(false);
                    }
                  }}
                  disabled={makeCalendarDisabled(addDateRangeLimits)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <CreditCard className="w-4 h-4" />
              {t('paymentSources.paymentSource', 'Izvor plaćanja')}
            </Label>
            <Select value={paymentSourceValue} onValueChange={setPaymentSourceValue}>
              <SelectTrigger>
                <SelectValue placeholder={t('projects.noPaymentSource', 'Bez izvora')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('projects.noPaymentSource', 'Bez izvora')}</SelectItem>
                {customPaymentSources.map((src) => (
                  <SelectItem key={src.id} value={`custom:${src.id}`}>
                    <span className="flex items-center gap-2">
                      <span>{src.icon}</span>
                      <span>{src.name}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t('transactions.expenseNature', 'Vrsta troška')}</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={expenseNature === 'regular' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setExpenseNature('regular')}
              >
                <span className="w-2 h-2 rounded-full bg-income mr-2" />
                {t('transactions.regular', 'Redovan')}
              </Button>
              <Button
                type="button"
                variant={expenseNature === 'extraordinary' ? 'destructive' : 'outline'}
                className="flex-1"
                onClick={() => setExpenseNature('extraordinary')}
              >
                <span className="w-2 h-2 rounded-full bg-destructive mr-2" />
                {t('transactions.extraordinary', 'Vanredan')}
              </Button>
            </div>
          </div>

          {expenseType === 'expense' && (
            <AdvanceLinkSection
              projectId={projectId}
              type={expenseType}
              amount={amount}
              isAdvance={isAdvance}
              onIsAdvanceChange={setIsAdvance}
              collaboratorId={collaboratorId}
              onCollaboratorIdChange={setCollaboratorId}
              linkedAdvanceIds={linkedAdvanceIds}
              onLinkedAdvanceIdsChange={setLinkedAdvanceIds}
            />
          )}

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onCancel}>
              {t('common.cancel')}
            </Button>
            <Button
              className="flex-1"
              onClick={onSubmit}
              disabled={saving || !amount || !description.trim() || (isAdvance && !collaboratorId)}
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('common.add')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
