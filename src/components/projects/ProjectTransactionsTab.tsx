import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { getCategoryInfo, CATEGORIES, Category, TransactionType } from '@/types/expense';
import { ProjectMilestone } from '@/types/project';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { toast } from 'sonner';
import { 
  FileText, Loader2, TrendingUp, TrendingDown, Plus, CalendarIcon, 
  Target, Pencil, Trash2 
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProjectExpense {
  id: string;
  user_id: string;
  amount: number;
  description: string;
  category: string;
  date: string;
  type: string;
  milestone_id?: string | null;
}

interface ProjectTransactionsTabProps {
  projectId: string;
  expenses: ProjectExpense[];
  milestones: ProjectMilestone[];
  isManager: boolean;
  loading: boolean;
  onRefetch: () => void;
}

export const ProjectTransactionsTab = ({
  projectId,
  expenses,
  milestones,
  isManager,
  loading,
  onRefetch
}: ProjectTransactionsTabProps) => {
  const { t } = useTranslation();
  const { formatAmount, currency } = useCurrency();
  const { user } = useAuth();

  // Add expense dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingMilestone, setUpdatingMilestone] = useState<string | null>(null);
  
  // Form state
  const [expenseType, setExpenseType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Category>('other');
  const [date, setDate] = useState<Date>(new Date());
  const [milestoneId, setMilestoneId] = useState<string>('none');

  const resetForm = () => {
    setExpenseType('expense');
    setAmount('');
    setDescription('');
    setCategory('other');
    setDate(new Date());
    setMilestoneId('none');
  };

  // Quick milestone change handler
  const handleMilestoneChange = async (expenseId: string, newMilestoneId: string) => {
    setUpdatingMilestone(expenseId);
    try {
      const { error } = await supabase
        .from('expenses')
        .update({ 
          milestone_id: newMilestoneId === 'none' ? null : newMilestoneId 
        })
        .eq('id', expenseId);

      if (error) throw error;

      toast.success(t('projects.milestoneUpdated', 'Faza ažurirana'));
      onRefetch();
    } catch (error) {
      console.error('Error updating milestone:', error);
      toast.error(t('common.error'));
    } finally {
      setUpdatingMilestone(null);
    }
  };

  const handleAddExpense = async () => {
    if (!amount || !description.trim() || !user) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('expenses')
        .insert({
          user_id: user.id,
          project_id: projectId,
          milestone_id: milestoneId !== 'none' ? milestoneId : null,
          amount: parseFloat(amount),
          description: description.trim(),
          category,
          type: expenseType,
          date: date.toISOString(),
          status: 'approved'
        });

      if (error) throw error;

      toast.success(t('projects.expenseAdded', 'Trošak dodan'));
      setAddDialogOpen(false);
      resetForm();
      onRefetch();
    } catch (error) {
      console.error('Error adding expense:', error);
      toast.error(t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteExpense = async (expenseId: string) => {
    if (!confirm(t('transactions.confirmDelete', 'Jeste li sigurni da želite obrisati ovu transakciju?'))) {
      return;
    }

    try {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', expenseId);

      if (error) throw error;

      toast.success(t('common.deleted'));
      onRefetch();
    } catch (error) {
      console.error('Error deleting expense:', error);
      toast.error(t('common.error'));
    }
  };

  // Get milestone name by ID
  const getMilestoneName = (mId: string | null | undefined) => {
    if (!mId) return null;
    const milestone = milestones.find(m => m.id === mId);
    return milestone?.name || null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Add button */}
      {isManager && (
        <div className="flex justify-end">
          <Button onClick={() => setAddDialogOpen(true)} size="sm">
            <Plus className="w-4 h-4 mr-2" />
            {t('projects.addExpense', 'Dodaj trošak')}
          </Button>
        </div>
      )}

      {expenses.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>{t('projects.noTransactions')}</p>
          <p className="text-sm">{t('projects.noTransactionsHint')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {expenses.map((expense) => {
            const categoryInfo = getCategoryInfo(expense.category as any);
            const isIncome = expense.type === 'income';
            const milestoneName = getMilestoneName(expense.milestone_id);

            return (
              <div 
                key={expense.id}
                className="p-3 rounded-lg border bg-card flex items-center gap-3 group"
              >
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-lg shrink-0">
                  {categoryInfo.icon}
                </div>
                
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{expense.description}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                    <span>{categoryInfo.name}</span>
                    <span>•</span>
                    <span>{format(new Date(expense.date), 'd. MMM yyyy', { locale: hr })}</span>
                  </div>
                </div>

                {/* Inline milestone dropdown */}
                {isManager && milestones.length > 0 && (
                  <Select
                    value={expense.milestone_id || 'none'}
                    onValueChange={(value) => handleMilestoneChange(expense.id, value)}
                    disabled={updatingMilestone === expense.id}
                  >
                    <SelectTrigger className="w-[140px] h-8 text-xs shrink-0">
                      {updatingMilestone === expense.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <SelectValue>
                          {milestoneName ? (
                            <span className="flex items-center gap-1">
                              <Target className="w-3 h-3" />
                              {milestoneName}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">{t('projects.noMilestone', 'Bez faze')}</span>
                          )}
                        </SelectValue>
                      )}
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('projects.noMilestone', 'Bez faze')}</SelectItem>
                      {milestones.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          <span className="flex items-center gap-1">
                            <Target className="w-3 h-3" />
                            {m.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {/* Show milestone badge for non-managers */}
                {!isManager && milestoneName && (
                  <Badge variant="outline" className="h-5 gap-1 text-xs shrink-0">
                    <Target className="w-3 h-3" />
                    {milestoneName}
                  </Badge>
                )}

                <div className={cn(
                  "font-mono font-medium flex items-center gap-1 shrink-0",
                  isIncome ? "text-income" : "text-expense"
                )}>
                  {isIncome ? (
                    <TrendingUp className="w-4 h-4" />
                  ) : (
                    <TrendingDown className="w-4 h-4" />
                  )}
                  {isIncome ? '+' : '-'}{formatAmount(expense.amount)}
                </div>

                {/* Delete button - visible on hover for managers */}
                {isManager && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-destructive shrink-0"
                    onClick={() => handleDeleteExpense(expense.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Expense Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('projects.addExpense', 'Dodaj trošak na projekt')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Type selector */}
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

            {/* Amount */}
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
                  {currency.symbol}
                </span>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label>{t('common.description')}</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('transactions.descriptionPlaceholder', 'npr. Materijali za gradnju')}
              />
            </div>

            {/* Milestone - Auto select first if available */}
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
                      <div className="flex items-center gap-2">
                        <span>{cat.icon}</span>
                        <span>{cat.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date */}
            <div className="space-y-2">
              <Label>{t('common.date')}</Label>
              <Popover>
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
                    onSelect={(d) => d && setDate(d)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button 
                variant="outline" 
                className="flex-1" 
                onClick={() => {
                  setAddDialogOpen(false);
                  resetForm();
                }}
              >
                {t('common.cancel')}
              </Button>
              <Button 
                className="flex-1" 
                onClick={handleAddExpense}
                disabled={saving || !amount || !description.trim()}
              >
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {t('common.add')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
