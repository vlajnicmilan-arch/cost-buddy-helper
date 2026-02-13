import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { getCategoryInfo, CATEGORIES, Category, TransactionType } from '@/types/expense';
import { ProjectMilestone, ProjectRole } from '@/types/project';
import { useProjectPendingTransactions } from '@/hooks/useProjectPendingTransactions';
import { TransactionNotesThread } from '@/components/TransactionNotesThread';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { toast } from 'sonner';
import { 
  FileText, Loader2, TrendingUp, TrendingDown, Plus, CalendarIcon, 
  Target, Trash2, Clock, Check, X, AlertCircle, User, MessageCircle,
  Eye, Pencil, Search
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProjectExpense {
  id: string;
  user_id: string;
  amount: number;
  description: string;
  merchant_name?: string | null;
  category: string;
  date: string;
  type: string;
  milestone_id?: string | null;
  status?: string | null;
  submitted_by?: string | null;
  expense_nature?: string | null;
}

interface ProjectTransactionsTabProps {
  projectId: string;
  expenses: ProjectExpense[];
  milestones: ProjectMilestone[];
  isManager: boolean;
  userRole: ProjectRole;
  loading: boolean;
  onRefetch: () => void;
}

export const ProjectTransactionsTab = ({
  projectId,
  expenses,
  milestones,
  isManager,
  userRole,
  loading,
  onRefetch
}: ProjectTransactionsTabProps) => {
  const { t } = useTranslation();
  const { formatAmount, currency } = useCurrency();
  const { user } = useAuth();

  // Pending transactions hook
  const { 
    pendingTransactions, 
    approveTransaction, 
    rejectTransaction,
    refetch: refetchPending,
    pendingCount
  } = useProjectPendingTransactions(projectId);

  // User profiles for showing who added each transaction
  const [profiles, setProfiles] = useState<Record<string, string>>({});

  // Fetch profiles for all transaction authors
  useEffect(() => {
    const fetchProfiles = async () => {
      // Get unique user IDs from expenses (use submitted_by if available, otherwise user_id)
      const userIds = [...new Set(expenses.map(e => e.submitted_by || e.user_id))];
      if (userIds.length === 0) return;

      const { data } = await supabase
        .from('profiles')
        .select('user_id, display_name')
        .in('user_id', userIds);

      if (data) {
        const profileMap: Record<string, string> = {};
        data.forEach(p => {
          profileMap[p.user_id] = p.display_name || 'Član';
        });
        setProfiles(profileMap);
      }
    };

    fetchProfiles();
  }, [expenses]);

  // Add expense dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingMilestone, setUpdatingMilestone] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Transaction detail/notes dialog state
  const [selectedExpense, setSelectedExpense] = useState<ProjectExpense | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  
  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ProjectExpense | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState<Category>('other');
  const [editDate, setEditDate] = useState<Date>(new Date());
  const [editMilestoneId, setEditMilestoneId] = useState<string>('none');
  const [editType, setEditType] = useState<TransactionType>('expense');
  
  // Delete confirmation dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState<string | null>(null);
  
  // Reject confirmation dialog state
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [transactionToReject, setTransactionToReject] = useState<string | null>(null);
  
  // Form state
  const [expenseType, setExpenseType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Category>('other');
  const [date, setDate] = useState<Date>(new Date());
  const [milestoneId, setMilestoneId] = useState<string>('none');
  const [expenseNature, setExpenseNature] = useState<'regular' | 'extraordinary'>('regular');

  // Check if viewer can add transactions (needs approval)
  const canAddTransaction = isManager || userRole === 'member' || userRole === 'viewer';
  const needsApproval = userRole === 'viewer';

  const resetForm = () => {
    setExpenseType('expense');
    setAmount('');
    setDescription('');
    setCategory('other');
    setDate(new Date());
    setMilestoneId('none');
    setExpenseNature('regular');
  };

  // Quick milestone change handler
  const handleMilestoneChange = async (expenseId: string, newMilestoneId: string) => {
    setUpdatingMilestone(expenseId);
    try {
      const { error } = await supabase
        .from('expenses')
        .update({ 
          milestone_id: newMilestoneId === 'none' ? null : newMilestoneId 
        } as any)
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
      // Viewers submit with 'pending' status, managers/members submit as 'approved'
      const status = needsApproval ? 'pending' : 'approved';
      
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
          status,
          submitted_by: needsApproval ? user.id : null,
          expense_nature: expenseNature
        } as any);

      if (error) throw error;

      if (needsApproval) {
        toast.success(t('projects.expenseSubmitted', 'Transakcija poslana na odobrenje'));
      } else {
        toast.success(t('projects.expenseAdded', 'Trošak dodan'));
      }
      setAddDialogOpen(false);
      resetForm();
      onRefetch();
      if (needsApproval) {
        refetchPending();
      }
    } catch (error) {
      console.error('Error adding expense:', error);
      toast.error(t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async (transactionId: string) => {
    await approveTransaction(transactionId);
    onRefetch();
  };

  const handleReject = (transactionId: string) => {
    setTransactionToReject(transactionId);
    setRejectDialogOpen(true);
  };

  const confirmReject = async () => {
    if (transactionToReject) {
      await rejectTransaction(transactionToReject);
      setRejectDialogOpen(false);
      setTransactionToReject(null);
    }
  };

  const handleDeleteExpense = (expenseId: string) => {
    setExpenseToDelete(expenseId);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!expenseToDelete) return;

    try {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', expenseToDelete);

      if (error) throw error;

      toast.success(t('common.deleted'));
      onRefetch();
    } catch (error) {
      console.error('Error deleting expense:', error);
      toast.error(t('common.error'));
    } finally {
      setDeleteDialogOpen(false);
      setExpenseToDelete(null);
    }
  };

  // Open edit dialog
  const handleOpenEdit = (expense: ProjectExpense) => {
    setEditingExpense(expense);
    setEditType(expense.type as TransactionType);
    setEditAmount(expense.amount.toString());
    setEditDescription(expense.description);
    setEditCategory(expense.category as Category);
    setEditDate(new Date(expense.date));
    setEditMilestoneId(expense.milestone_id || 'none');
    setEditDialogOpen(true);
  };

  // Save edited expense
  const handleSaveEdit = async () => {
    if (!editingExpense || !editAmount || !editDescription.trim()) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('expenses')
        .update({
          type: editType,
          amount: parseFloat(editAmount),
          description: editDescription.trim(),
          category: editCategory,
          date: editDate.toISOString(),
          milestone_id: editMilestoneId !== 'none' ? editMilestoneId : null
        } as any)
        .eq('id', editingExpense.id);

      if (error) throw error;

      toast.success(t('common.saved', 'Spremljeno'));
      setEditDialogOpen(false);
      setEditingExpense(null);
      onRefetch();
    } catch (error) {
      console.error('Error updating expense:', error);
      toast.error(t('common.error'));
    } finally {
      setSaving(false);
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
      {/* Pending Transactions Section - only visible to managers */}
      {isManager && pendingCount > 0 && (
        <div className="p-4 rounded-lg border-2 border-warning/50 bg-warning/10 space-y-3">
          <div className="flex items-center gap-2 text-warning-foreground">
            <Clock className="w-5 h-5" />
            <span className="font-medium">
              {t('projects.pendingApproval', 'Transakcije na čekanju')} ({pendingCount})
            </span>
          </div>
          
          <div className="space-y-2">
            {pendingTransactions.map((tx) => {
              const categoryInfo = getCategoryInfo(tx.category as any);
              const isIncome = tx.type === 'income';
              
              return (
                <div 
                  key={tx.id}
                  className="p-3 rounded-lg bg-card border flex items-center gap-3"
                >
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-lg shrink-0">
                    {categoryInfo.icon}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{tx.description}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                      <span>{categoryInfo.name}</span>
                      <span>•</span>
                      <span>{format(new Date(tx.date), 'd. MMM yyyy', { locale: hr })}</span>
                      {tx.submitter_name && (
                        <>
                          <span>•</span>
                          <span className="text-warning-foreground">
                            {t('projects.submittedBy', 'Podnio')}: {tx.submitter_name}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className={cn(
                    "font-mono font-medium flex items-center gap-1 shrink-0",
                    isIncome ? "text-income" : "text-expense"
                  )}>
                    {isIncome ? (
                      <TrendingUp className="w-4 h-4" />
                    ) : (
                      <TrendingDown className="w-4 h-4" />
                    )}
                    {isIncome ? '+' : '-'}{formatAmount(tx.amount)}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-income hover:text-income hover:bg-income/10"
                      onClick={() => handleApprove(tx.id)}
                    >
                      <Check className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:bg-destructive/10"
                      onClick={() => handleReject(tx.id)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add button - visible to managers, members, and viewers */}
      {canAddTransaction && (
        <div className="flex justify-between items-center">
          {needsApproval && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertCircle className="w-4 h-4" />
              {t('projects.viewerNote', 'Vaše transakcije zahtijevaju odobrenje člana')}
            </div>
          )}
          <Button onClick={() => setAddDialogOpen(true)} size="sm" className={needsApproval ? '' : 'ml-auto'}>
            <Plus className="w-4 h-4 mr-2" />
            {needsApproval 
              ? t('projects.submitExpense', 'Predloži trošak')
              : t('projects.addExpense', 'Dodaj trošak')
            }
          </Button>
        </div>
      )}

      {/* Search */}
      {expenses.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Pretraži transakcije..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 pr-9 h-9 text-sm"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {expenses.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>{t('projects.noTransactions')}</p>
          <p className="text-sm">{t('projects.noTransactionsHint')}</p>
        </div>
      ) : (
        <div className="space-y-1">
          {expenses
            .filter(e => !searchTerm.trim() || e.description.toLowerCase().includes(searchTerm.toLowerCase()))
            .map((expense) => {
            const categoryInfo = getCategoryInfo(expense.category as any);
            const isIncome = expense.type === 'income';
            const milestoneName = getMilestoneName(expense.milestone_id);
            const authorId = expense.submitted_by || expense.user_id;
            const authorName = profiles[authorId] || 'Član';
            const isOwnExpense = authorId === user?.id;

            return (
              <div 
                key={expense.id}
                className="group flex items-center gap-2 py-2.5 px-2 rounded-lg hover:bg-muted/50 transition-colors"
              >
                {/* Category Icon */}
                <div 
                  className="w-8 h-8 rounded-md flex items-center justify-center text-base shrink-0"
                  style={{ backgroundColor: `hsl(var(--${categoryInfo.color}) / 0.15)` }}
                >
                  {categoryInfo.icon}
                </div>
                
                {/* Main Content */}
                <div className="flex-1 min-w-0 mr-2">
                  {/* Title Row */}
                  <div className="flex items-center gap-1.5">
                    <p className="font-medium text-foreground truncate text-sm leading-tight">
                      {expense.merchant_name || expense.description}
                    </p>
                    {expense.expense_nature && (
                      <Badge variant="outline" className={cn(
                        "text-[10px] px-1.5 py-0 h-4 shrink-0 border",
                        expense.expense_nature === 'regular' 
                          ? "border-income/50 text-income bg-income/10" 
                          : "border-destructive/50 text-destructive bg-destructive/10"
                      )}>
                        {expense.expense_nature === 'regular' ? t('transactions.regular', 'Redovan') : t('transactions.extraordinary', 'Vanredan')}
                      </Badge>
                    )}
                  </div>
                  
                  {/* Info Row */}
                  <div className="flex items-center gap-1 mt-0.5 text-[11px] text-muted-foreground leading-tight">
                    <span className="flex items-center gap-0.5 shrink-0">
                      <User className="w-3 h-3" />
                      {isOwnExpense ? t('common.you', 'Ti') : authorName}
                    </span>
                    <span className="text-muted-foreground/40">•</span>
                    <span className="truncate max-w-[60px]">{categoryInfo.name}</span>
                    <span className="text-muted-foreground/40">•</span>
                    {/* Milestone selector */}
                    {(isManager || isOwnExpense) ? (
                      <Select
                        value={expense.milestone_id || 'none'}
                        onValueChange={(val) => handleMilestoneChange(expense.id, val)}
                        disabled={updatingMilestone === expense.id}
                      >
                        <SelectTrigger className="h-4 text-[11px] border-0 bg-transparent p-0 gap-0.5 w-auto max-w-[100px] shadow-none focus:ring-0">
                          <span className="flex items-center gap-0.5 truncate">
                            <Target className="w-3 h-3 shrink-0" />
                            <SelectValue placeholder={t('projects.noMilestone', 'Bez faze')} />
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t('projects.noMilestone', 'Bez faze')}</SelectItem>
                          {milestones.map(m => (
                            <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      milestoneName && (
                        <span className="flex items-center gap-0.5 truncate max-w-[80px]">
                          <Target className="w-3 h-3 shrink-0" />
                          {milestoneName}
                        </span>
                      )
                    )}
                  </div>
                </div>

                {/* Amount & Date Column */}
                <div className="flex flex-col items-end shrink-0 gap-0.5">
                  <p className={cn(
                    "font-mono font-bold text-sm leading-tight",
                    isIncome ? "text-income" : "text-expense"
                  )}>
                    {isIncome ? '+' : '-'}{formatAmount(expense.amount)}
                  </p>
                  <span className="text-[10px] text-muted-foreground/70">
                    {format(new Date(expense.date), 'd. MMM', { locale: hr })}
                  </span>
                </div>
                
                {/* Action Buttons */}
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-primary"
                    onClick={() => {
                      setSelectedExpense(expense);
                      setDetailDialogOpen(true);
                    }}
                    title={t('common.view', 'Pregledaj')}
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                  </Button>

                  {(isManager || isOwnExpense) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-primary"
                      onClick={() => handleOpenEdit(expense)}
                      title={t('common.edit', 'Uredi')}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                  )}

                  {(isManager || isOwnExpense) && (
                    <button
                      onClick={() => handleDeleteExpense(expense.id)}
                      className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                      title={t('common.delete', 'Obriši')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
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

            {/* Expense Nature Toggle */}
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

      {/* Transaction Notes/Comments Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5" />
              {t('transactions.comments', 'Komentari')}
            </DialogTitle>
          </DialogHeader>

          {selectedExpense && (
            <div className="space-y-4">
              {/* Transaction summary */}
              <div className="p-3 rounded-lg bg-muted/50 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-background flex items-center justify-center text-lg shrink-0">
                  {getCategoryInfo(selectedExpense.category as any).icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{selectedExpense.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(selectedExpense.date), 'd. MMM yyyy', { locale: hr })}
                  </p>
                </div>
                <div className={cn(
                  "font-mono font-medium shrink-0",
                  selectedExpense.type === 'income' ? "text-income" : "text-expense"
                )}>
                  {selectedExpense.type === 'income' ? '+' : '-'}{formatAmount(selectedExpense.amount)}
                </div>
              </div>

              {/* Notes thread */}
              <TransactionNotesThread
                expenseId={selectedExpense.id}
                projectId={projectId}
                onNoteAdded={onRefetch}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Transaction Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('transactions.edit', 'Uredi transakciju')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Type selector */}
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

            {/* Amount */}
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
                  {currency.symbol}
                </span>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label>{t('common.description')}</Label>
              <Input
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder={t('transactions.descriptionPlaceholder', 'npr. Materijali za gradnju')}
              />
            </div>

            {/* Milestone */}
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

            {/* Category */}
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

            {/* Date */}
            <div className="space-y-2">
              <Label>{t('common.date')}</Label>
              <Popover>
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
                    onSelect={(d) => d && setEditDate(d)}
                    initialFocus
                    locale={hr}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                onClick={handleSaveEdit}
                disabled={saving || !editAmount || !editDescription.trim()}
              >
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {t('common.save')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('transactions.deleteTitle', 'Obriši transakciju')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('transactions.confirmDelete', 'Jeste li sigurni da želite obrisati ovu transakciju?')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject Confirmation Dialog */}
      <AlertDialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('projects.rejectTitle', 'Odbij transakciju')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('projects.confirmRejectTransaction', 'Jeste li sigurni da želite odbiti ovu transakciju?')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmReject}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common.reject', 'Odbij')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
