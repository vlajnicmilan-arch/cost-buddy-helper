import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CalendarIcon, CreditCard, Loader2, Target, TrendingDown, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { CATEGORIES, type Category, type TransactionType } from '@/types/expense';
import { makeCalendarDisabled, type DateRange as DateLimits } from '@/lib/dateValidation';
import { AdvanceLinkSection } from '@/components/add-expense/AdvanceLinkSection';
import type { ProjectMilestone } from '@/types/project';
import type { ProjectExpense } from './types';

interface ProjectTransactionEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  editingExpense: ProjectExpense | null;
  saving: boolean;
  // form state
  editType: TransactionType;
  setEditType: (v: TransactionType) => void;
  editAmount: string;
  setEditAmount: (v: string) => void;
  editDescription: string;
  setEditDescription: (v: string) => void;
  editCategory: Category;
  setEditCategory: (v: Category) => void;
  editDate: Date;
  setEditDate: (v: Date) => void;
  editMilestoneId: string;
  setEditMilestoneId: (v: string) => void;
  editPaymentSourceValue: string;
  setEditPaymentSourceValue: (v: string) => void;
  editIsAdvance: boolean;
  setEditIsAdvance: (v: boolean) => void;
  editCollaboratorId: string | null;
  setEditCollaboratorId: (v: string | null) => void;
  editLinkedAdvanceIds: string[];
  setEditLinkedAdvanceIds: (v: string[]) => void;
  editDateOpen: boolean;
  setEditDateOpen: (v: boolean) => void;
  // data
  milestones: ProjectMilestone[];
  customPaymentSources: Array<{ id: string; name: string; icon: string }>;
  currencySymbol: string;
  editDateRangeLimits: DateLimits;
  // actions
  onCancel: () => void;
  onSubmit: () => void;
}

export const ProjectTransactionEditDialog = ({
  open,
  onOpenChange,
  projectId,
  editingExpense,
  saving,
  editType,
  setEditType,
  editAmount,
  setEditAmount,
  editDescription,
  setEditDescription,
  editCategory,
  setEditCategory,
  editDate,
  setEditDate,
  editMilestoneId,
  setEditMilestoneId,
  editPaymentSourceValue,
  setEditPaymentSourceValue,
  editIsAdvance,
  setEditIsAdvance,
  editCollaboratorId,
  setEditCollaboratorId,
  editLinkedAdvanceIds,
  setEditLinkedAdvanceIds,
  editDateOpen,
  setEditDateOpen,
  milestones,
  customPaymentSources,
  currencySymbol,
  editDateRangeLimits,
  onCancel,
  onSubmit,
}: ProjectTransactionEditDialogProps) => {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('transactions.edit', 'Uredi transakciju')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <Button
              type="button"
              variant={editType === 'expense' ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => setEditType('expense')}
            >
              <TrendingDown className="w-4 h-4 mr-2" />
              {t('transactions.expense', 'Trošak')}
            </Button>
            <Button
              type="button"
              variant={editType === 'income' ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => setEditType('income')}
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
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                placeholder="0.00"
                className="pr-12 text-lg"
                min="0"
                step="0.01"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {currencySymbol}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t('common.description')}</Label>
            <Input
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder={t('transactions.descriptionPlaceholder', 'npr. Materijali za gradnju')}
            />
          </div>

          {milestones.length > 0 && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Target className="w-4 h-4" />
                {t('projects.milestone', 'Faza projekta')}
              </Label>
              <Select value={editMilestoneId} onValueChange={setEditMilestoneId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('projects.selectMilestone', 'Odaberi fazu (opcionalno)')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('projects.noMilestone', 'Bez faze')}</SelectItem>
                  {milestones.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>{t('common.category')}</Label>
            <Select value={editCategory} onValueChange={(v) => setEditCategory(v as Category)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORIES).map(([key, cat]) => (
                  <SelectItem key={key} value={key}>
                    <span className="flex items-center gap-2">
                      <span>{cat.icon}</span>
                      <span>{cat.name}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t('common.date')}</Label>
            <Popover open={editDateOpen} onOpenChange={setEditDateOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start font-normal">
                  <CalendarIcon className="w-4 h-4 mr-2" />
                  {format(editDate, 'd. MMMM yyyy', { locale: hr })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={editDate}
                  onSelect={(d) => {
                    if (d) {
                      setEditDate(d);
                      setEditDateOpen(false);
                    }
                  }}
                  disabled={makeCalendarDisabled(editDateRangeLimits)}
                  initialFocus
                  locale={hr}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <CreditCard className="w-4 h-4" />
              {t('paymentSources.paymentSource', 'Izvor plaćanja')}
            </Label>
            <Select value={editPaymentSourceValue} onValueChange={setEditPaymentSourceValue}>
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

          {editType === 'expense' && editingExpense && (
            <AdvanceLinkSection
              projectId={projectId}
              type={editType}
              amount={editAmount}
              isAdvance={editIsAdvance}
              onIsAdvanceChange={setEditIsAdvance}
              collaboratorId={editCollaboratorId}
              onCollaboratorIdChange={setEditCollaboratorId}
              linkedAdvanceIds={editLinkedAdvanceIds}
              onLinkedAdvanceIdsChange={setEditLinkedAdvanceIds}
              editingExpenseId={editingExpense.id}
            />
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onCancel}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={onSubmit}
              disabled={saving || !editAmount || !editDescription.trim() || (editIsAdvance && !editCollaboratorId)}
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('common.save')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
