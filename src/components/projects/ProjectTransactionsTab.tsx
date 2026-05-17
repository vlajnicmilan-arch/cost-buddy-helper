import { useState, useEffect, useMemo } from 'react';
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
import { useCustomCategories } from '@/hooks/useCustomCategories';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import { useBalanceUpdater } from '@/hooks/useBalanceUpdater';
import { useAppState } from '@/contexts/AppStateContext';
import { resolveCategory, getCategoryBgStyle } from '@/hooks/useResolvedCategory';
import { ProjectMilestone, ProjectRole } from '@/types/project';
import { useProjectPendingTransactions } from '@/hooks/useProjectPendingTransactions';
import { TransactionNotesThread } from '@/components/TransactionNotesThread';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { invokeNotifyFunction } from '@/lib/notifyHelper';
import { 
  FileText, Loader2, TrendingUp, TrendingDown, Plus, CalendarIcon, 
  Target, Trash2, Clock, Check, X, AlertCircle, User, MessageCircle,
  Eye, Pencil, Search, Filter, Milestone, CreditCard, Printer, Download
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { TransactionItemsExpander } from '@/components/TransactionItemsExpander';
import { DateRange } from 'react-day-picker';
import { enUS, de } from 'date-fns/locale';
import { getDateRange, makeCalendarDisabled } from '@/lib/dateValidation';
import { AdvanceLinkSection } from '@/components/add-expense/AdvanceLinkSection';

interface ProjectExpense {
  id: string;
  user_id: string;
  amount: number;
  description: string;
  category: string;
  date: string;
  type: string;
  milestone_id?: string | null;
  status?: string | null;
  submitted_by?: string | null;
  expense_nature?: string | null;
  payment_source?: string | null;
  work_type?: 'material' | 'labor' | 'equipment' | 'other' | null;
  is_advance?: boolean | null;
  collaborator_id?: string | null;
  linked_advance_ids?: string[] | null;
}

interface ProjectTransactionsTabProps {
  projectId: string;
  projectName?: string;
  expenses: ProjectExpense[];
  milestones: ProjectMilestone[];
  isManager: boolean;
  userRole: ProjectRole;
  loading: boolean;
  onRefetch: () => void;
}

export const ProjectTransactionsTab = ({
  projectId,
  projectName,
  expenses,
  milestones,
  isManager,
  userRole,
  loading,
  onRefetch
}: ProjectTransactionsTabProps) => {
  const { t, i18n } = useTranslation();
  const { formatAmount, currency } = useCurrency();
  const { user } = useAuth();
  const { customCategories } = useCustomCategories();
  const { activeBusinessProfileId } = useAppState();
  const { customPaymentSources } = useCustomPaymentSources({ includePersonal: true });
  const { updateBalance, handleTransactionUpdate } = useBalanceUpdater({ onBalanceUpdated: onRefetch });
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

  // Payment source name lookup
  const [paymentSourceNames, setPaymentSourceNames] = useState<Record<string, string>>({});

  // Fetch profiles for all transaction authors
  useEffect(() => {
    const fetchProfiles = async () => {
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

  // Fetch payment source names
  useEffect(() => {
    const fetchSourceNames = async () => {
      const sourceIds = [...new Set(
        expenses
          .map(e => e.payment_source)
          .filter(Boolean)
          .map(s => s!.replace('custom:', ''))
          .filter(id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id))
      )];
      if (sourceIds.length === 0) return;

      const { data } = await supabase
        .from('custom_payment_sources')
        .select('id, name, icon')
        .in('id', sourceIds);

      if (data) {
        const nameMap: Record<string, string> = {};
        data.forEach(s => {
          nameMap[s.id] = `${s.icon} ${s.name}`;
          nameMap[`custom:${s.id}`] = `${s.icon} ${s.name}`;
        });
        setPaymentSourceNames(nameMap);
      }
    };

    fetchSourceNames();
  }, [expenses]);

  const getPaymentSourceLabel = (source: string): string => {
    return paymentSourceNames[source] || source;
  };

  // Add expense dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingMilestone, setUpdatingMilestone] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedItemsId, setExpandedItemsId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filterMilestoneId, setFilterMilestoneId] = useState<string>('all');
  const [filterDateRange, setFilterDateRange] = useState<DateRange | undefined>(undefined);
  const [filterPaymentSource, setFilterPaymentSource] = useState<string>('all');
  const [filterExpenseNature, setFilterExpenseNature] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterWorkType, setFilterWorkType] = useState<string>('all');

  const dateLocale = i18n?.language === 'de' ? de : i18n?.language === 'en' ? enUS : hr;
  
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
  const [paymentSourceValue, setPaymentSourceValue] = useState<string>('none');
  const [editPaymentSourceValue, setEditPaymentSourceValue] = useState<string>('none');
  const [expenseNature, setExpenseNature] = useState<'regular' | 'extraordinary'>('regular');

  // Advance / collaborator state — add dialog
  const [isAdvance, setIsAdvance] = useState(false);
  const [collaboratorId, setCollaboratorId] = useState<string | null>(null);
  const [linkedAdvanceIds, setLinkedAdvanceIds] = useState<string[]>([]);

  // Advance / collaborator state — edit dialog
  const [editIsAdvance, setEditIsAdvance] = useState(false);
  const [editCollaboratorId, setEditCollaboratorId] = useState<string | null>(null);
  const [editLinkedAdvanceIds, setEditLinkedAdvanceIds] = useState<string[]>([]);

  // Calendar popover open states (auto-close on select)
  const [filterDateOpen, setFilterDateOpen] = useState(false);
  const [addDateOpen, setAddDateOpen] = useState(false);
  const [editDateOpen, setEditDateOpen] = useState(false);

  // Date ranges per transaction type (expense vs income)
  const addDateRangeLimits = useMemo(() => getDateRange('transactionDynamic', expenseType as 'expense' | 'income'), [expenseType]);
  const editDateRangeLimits = useMemo(() => getDateRange('transactionDynamic', editType as 'expense' | 'income'), [editType]);
  const reportDateLimits = useMemo(() => getDateRange('report'), []);

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
    setPaymentSourceValue('none');
    setExpenseNature('regular');
    setIsAdvance(false);
    setCollaboratorId(null);
    setLinkedAdvanceIds([]);
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

      showSuccess(t('projects.milestoneUpdated', 'Faza ažurirana'));
      onRefetch();
    } catch (error) {
      console.error('Error updating milestone:', error);
      showError(t('common.error'));
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
      const paymentSourceForInsert = paymentSourceValue !== 'none' ? paymentSourceValue : null;
      const parsedAmount = parseFloat(amount);

      const { data: inserted, error } = await supabase
        .from('expenses')
        .insert({
          user_id: user.id,
          project_id: projectId,
          milestone_id: milestoneId !== 'none' ? milestoneId : null,
          business_profile_id: activeBusinessProfileId || null,
          payment_source: paymentSourceForInsert,
          amount: parsedAmount,
          description: description.trim(),
          category,
          type: expenseType,
          date: date.toISOString(),
          status,
          submitted_by: needsApproval ? user.id : null,
          expense_nature: expenseNature
        } as any)
        .select()
        .single();

      if (error) throw error;

      // Update payment source balance if approved (pending shouldn't affect balance)
      if (status === 'approved' && paymentSourceForInsert) {
        await updateBalance(paymentSourceForInsert, parsedAmount, expenseType);
      }

      // Notify project members (fire-and-forget) for directly approved transactions.
      if (inserted && status === 'approved') {
        invokeNotifyFunction({
          functionName: 'notify-project-transaction',
          body: { expense_id: (inserted as any).id, project_id: projectId, action: 'created' },
        });
      }

      // Owner-loan auto-creation: business project expense paid from personal source
      if (activeBusinessProfileId && inserted && status === 'approved' && expenseType === 'expense') {
        const { createOwnerLoanIfCrossMode } = await import('@/lib/ownerLoanLogic');
        createOwnerLoanIfCrossMode({
          expenseId: (inserted as any).id,
          userId: user.id,
          businessProfileId: activeBusinessProfileId,
          paymentSource: paymentSourceForInsert,
          amount: parsedAmount,
          description: description.trim(),
        }).catch(e => console.error('Owner-loan creation failed:', e));
      }

      if (needsApproval) {
        showSuccess(t('projects.expenseSubmitted', 'Transakcija poslana na odobrenje'));
      } else {
        showSuccess(t('projects.expenseAdded', 'Trošak dodan'));
      }
      setAddDialogOpen(false);
      resetForm();
      onRefetch();
      if (needsApproval) {
        refetchPending();
      }
    } catch (error) {
      console.error('Error adding expense:', error);
      showError(t('common.error'));
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
      // Delete linked owner-loan first (best-effort)
      const { deleteOwnerLoanForExpense } = await import('@/lib/ownerLoanLogic');
      deleteOwnerLoanForExpense(expenseToDelete).catch(e => console.error('Owner-loan delete failed:', e));

      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', expenseToDelete);

      if (error) throw error;

      showSuccess(t('common.deleted'));
      onRefetch();
    } catch (error) {
      console.error('Error deleting expense:', error);
      showError(t('common.error'));
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
    setEditPaymentSourceValue(expense.payment_source || 'none');
    setEditDialogOpen(true);
  };

  // Save edited expense
  const handleSaveEdit = async () => {
    if (!editingExpense || !editAmount || !editDescription.trim()) return;

    setSaving(true);
    try {
      const newPaymentSource = editPaymentSourceValue !== 'none' ? editPaymentSourceValue : null;
      const newAmount = parseFloat(editAmount);
      const oldPaymentSource = editingExpense.payment_source || undefined;
      const oldAmount = editingExpense.amount;
      const oldType = editingExpense.type as TransactionType;

      const { error } = await supabase
        .from('expenses')
        .update({
          type: editType,
          amount: newAmount,
          description: editDescription.trim(),
          category: editCategory,
          date: editDate.toISOString(),
          milestone_id: editMilestoneId !== 'none' ? editMilestoneId : null,
          business_profile_id: activeBusinessProfileId || null,
          payment_source: newPaymentSource
        } as any)
        .eq('id', editingExpense.id);

      if (error) throw error;

      // Sync balances: reverse old, apply new
      await handleTransactionUpdate(
        oldPaymentSource,
        oldAmount,
        oldType,
        newPaymentSource || undefined,
        newAmount,
        editType
      );

      // Notify project members about the update — only when something material changed.
      const significantChange =
        oldAmount !== newAmount ||
        oldType !== editType ||
        editingExpense.description !== editDescription.trim() ||
        editingExpense.category !== editCategory ||
        (editingExpense.milestone_id || null) !== (editMilestoneId !== 'none' ? editMilestoneId : null);
      if (significantChange) {
        invokeNotifyFunction({
          functionName: 'notify-project-transaction',
          body: { expense_id: editingExpense.id, project_id: projectId, action: 'updated' },
        });
      }

      // Sync owner-loan after edit
      if (activeBusinessProfileId && editType === 'expense' && user) {
        const { syncOwnerLoanForExpense } = await import('@/lib/ownerLoanLogic');
        syncOwnerLoanForExpense({
          expenseId: editingExpense.id,
          userId: user.id,
          businessProfileId: activeBusinessProfileId,
          paymentSource: newPaymentSource,
          amount: newAmount,
          description: editDescription.trim(),
        }).catch(e => console.error('Owner-loan sync failed:', e));
      }

      showSuccess(t('common.saved', 'Spremljeno'));
      setEditDialogOpen(false);
      setEditingExpense(null);
      onRefetch();
    } catch (error) {
      console.error('Error updating expense:', error);
      showError(t('common.error'));
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

  // Filtered expenses memo
  const filteredExpenses = useMemo(() => {
    return expenses.filter(e => {
      if (searchTerm.trim() && !e.description.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      if (filterMilestoneId === 'none' && e.milestone_id) return false;
      if (filterMilestoneId !== 'all' && filterMilestoneId !== 'none' && e.milestone_id !== filterMilestoneId) return false;
      if (filterDateRange?.from) {
        const itemDate = new Date(e.date);
        itemDate.setHours(0, 0, 0, 0);
        const from = new Date(filterDateRange.from);
        from.setHours(0, 0, 0, 0);
        if (itemDate < from) return false;
        if (filterDateRange.to) {
          const to = new Date(filterDateRange.to);
          to.setHours(23, 59, 59, 999);
          if (itemDate > to) return false;
        }
      }
      if (filterPaymentSource !== 'all' && e.payment_source !== filterPaymentSource) return false;
      if (filterExpenseNature !== 'all' && e.expense_nature !== filterExpenseNature) return false;
      if (filterCategory !== 'all' && e.category !== filterCategory) return false;
      if (filterWorkType !== 'all' && e.work_type !== filterWorkType) return false;
      return true;
    });
  }, [expenses, searchTerm, filterMilestoneId, filterDateRange, filterPaymentSource, filterExpenseNature, filterCategory, filterWorkType]);

  const hasActiveFilters = searchTerm.trim() || filterMilestoneId !== 'all' || filterDateRange?.from || filterPaymentSource !== 'all' || filterExpenseNature !== 'all' || filterCategory !== 'all' || filterWorkType !== 'all';

  const filteredTotals = useMemo(() => {
    const totalExpenses = filteredExpenses.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0);
    const totalIncome = filteredExpenses.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0);
    const totalMaterial = filteredExpenses.filter(e => e.type === 'expense' && e.work_type === 'material').reduce((s, e) => s + e.amount, 0);
    const totalLabor = filteredExpenses.filter(e => e.type === 'expense' && e.work_type === 'labor').reduce((s, e) => s + e.amount, 0);
    return { totalExpenses, totalIncome, net: totalIncome - totalExpenses, totalMaterial, totalLabor };
  }, [filteredExpenses]);

  const handlePrintFiltered = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const rows = filteredExpenses.map(e => {
      const cat = resolveCategory(e.category, customCategories);
      const milestone = getMilestoneName(e.milestone_id);
      return `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${format(new Date(e.date), 'dd.MM.yyyy')}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${e.description}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${cat.name}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${milestone || '-'}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${e.expense_nature === 'extraordinary' ? t('projects.extraordinary', 'Vanredni') : t('projects.regular', 'Redovni')}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;color:${e.type === 'income' ? '#16a34a' : '#dc2626'}">${e.type === 'income' ? '+' : '-'}${formatAmount(e.amount)}</td>
      </tr>`;
    }).join('');

    printWindow.document.write(`<!DOCTYPE html><html><head><title>${projectName || ''} - ${t('projects.filteredTransactions', 'Filtrirane transakcije')}</title>
      <style>body{font-family:system-ui,sans-serif;padding:24px}table{width:100%;border-collapse:collapse}th{text-align:left;padding:8px;border-bottom:2px solid #333;font-size:13px}td{font-size:13px}.summary{margin-top:16px;padding:12px;background:#f5f5f5;border-radius:8px;font-size:14px}h1{font-size:18px;margin-bottom:4px}h2{font-size:15px;color:#666;margin-top:0}</style></head><body>
      ${projectName ? `<h1>${projectName}</h1>` : ''}
      <h2>${hasActiveFilters ? t('projects.filteredTransactions', 'Filtrirane transakcije') : t('projects.allTransactions', 'Sve transakcije')} (${filteredExpenses.length})</h2>
      <table><thead><tr>
        <th>${t('common.date', 'Datum')}</th>
        <th>${t('common.description', 'Opis')}</th>
        <th>${t('common.category', 'Kategorija')}</th>
        <th>${t('projects.milestone', 'Faza')}</th>
        <th>${t('projects.expenseNature', 'Vrsta')}</th>
        <th style="text-align:right">${t('common.amount', 'Iznos')}</th>
      </tr></thead><tbody>${rows}</tbody></table>
      <div class="summary">
        <strong>${t('transactions.expense', 'Troškovi')}:</strong> ${formatAmount(filteredTotals.totalExpenses)} &nbsp;|&nbsp;
        <strong>${t('transactions.income', 'Prihodi')}:</strong> ${formatAmount(filteredTotals.totalIncome)} &nbsp;|&nbsp;
        <strong>${t('common.balance', 'Razlika')}:</strong> ${formatAmount(filteredTotals.net)}
      </div></body></html>`);
    printWindow.document.close();
    printWindow.print();
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
              const categoryInfo = resolveCategory(tx.category, customCategories);
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
        <div className="space-y-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t('transactions.searchByName', 'Pretraži transakcije...')}
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

          {/* Filter Toggle */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              className={cn(
                'h-8 text-xs gap-1.5',
                showFilters && 'bg-primary/10 border-primary'
              )}
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="w-3.5 h-3.5" />
              {t('filters.filters', 'Filteri')}
              {(filterMilestoneId !== 'all' || filterDateRange?.from || filterPaymentSource !== 'all' || filterExpenseNature !== 'all') && (
                <span className="w-2 h-2 rounded-full bg-primary" />
              )}
            </Button>

            {(filterMilestoneId !== 'all' || filterDateRange?.from || filterPaymentSource !== 'all' || filterExpenseNature !== 'all' || searchTerm) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs px-2 text-muted-foreground hover:text-destructive"
                onClick={() => {
                  setSearchTerm('');
                  setFilterMilestoneId('all');
                  setFilterDateRange(undefined);
                  setFilterPaymentSource('all');
                  setFilterExpenseNature('all');
                }}
              >
                <X className="w-3 h-3 mr-1" />
                {t('filters.clear', 'Očisti')}
              </Button>
            )}
          </div>

          {/* Advanced Filters */}
          {showFilters && (
            <div className="flex flex-wrap gap-2 p-3 rounded-lg bg-muted/50 border">
              {/* Milestone Filter */}
              {milestones.length > 0 && (
                <Select
                  value={filterMilestoneId}
                  onValueChange={setFilterMilestoneId}
                >
                  <SelectTrigger className="w-[180px] h-8 text-xs">
                    <Milestone className="w-3.5 h-3.5 mr-1.5" />
                    <SelectValue placeholder={t('projects.allMilestones', 'Sve faze')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('projects.allMilestones', 'Sve faze')}</SelectItem>
                    <SelectItem value="none">{t('transactions.noMilestone', 'Bez faze')}</SelectItem>
                    {milestones.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Date Range */}
              <Popover open={filterDateOpen} onOpenChange={setFilterDateOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      'h-8 text-xs gap-1.5 justify-start',
                      filterDateRange?.from && 'bg-primary/10 border-primary'
                    )}
                  >
                    <CalendarIcon className="w-3.5 h-3.5" />
                    {filterDateRange?.from ? (
                      filterDateRange?.to ? (
                        <>
                          {format(filterDateRange.from, 'dd.MM.yy', { locale: dateLocale })} -{' '}
                          {format(filterDateRange.to, 'dd.MM.yy', { locale: dateLocale })}
                        </>
                      ) : (
                        format(filterDateRange.from, 'dd.MM.yyyy', { locale: dateLocale })
                      )
                    ) : (
                      t('filters.selectPeriod', 'Odaberi period')
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="range"
                    selected={filterDateRange}
                    onSelect={(range) => {
                      setFilterDateRange(range);
                      if (range?.from && range?.to) setFilterDateOpen(false);
                    }}
                    numberOfMonths={1}
                    locale={dateLocale}
                    disabled={makeCalendarDisabled(reportDateLimits)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>

              {/* Payment Source Filter */}
              {(() => {
                const sources = [...new Set(expenses.map(e => e.payment_source).filter(Boolean))] as string[];
                if (sources.length === 0) return null;
                return (
                  <Select
                    value={filterPaymentSource}
                    onValueChange={setFilterPaymentSource}
                  >
                    <SelectTrigger className="w-[180px] h-8 text-xs">
                      <CreditCard className="w-3.5 h-3.5 mr-1.5" />
                      <SelectValue placeholder={t('filters.allSources', 'Svi izvori')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('filters.allSources', 'Svi izvori')}</SelectItem>
                      {sources.map((source) => (
                        <SelectItem key={source} value={source}>
                          {getPaymentSourceLabel(source)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                );
              })()}

              {/* Expense Nature Filter */}
              <Select
                value={filterExpenseNature}
                onValueChange={setFilterExpenseNature}
              >
                <SelectTrigger className="w-[160px] h-8 text-xs">
                  <AlertCircle className="w-3.5 h-3.5 mr-1.5" />
                  <SelectValue placeholder={t('filters.allNatures', 'Sve vrste')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('filters.allNatures', 'Sve vrste')}</SelectItem>
                  <SelectItem value="regular">{t('projects.regular', 'Redovni')}</SelectItem>
                  <SelectItem value="extraordinary">{t('projects.extraordinary', 'Vanredni')}</SelectItem>
                </SelectContent>
              </Select>

              {/* Work Type Filter (Material vs Labor) */}
              <Select
                value={filterWorkType}
                onValueChange={setFilterWorkType}
              >
                <SelectTrigger className="w-[160px] h-8 text-xs">
                  <Filter className="w-3.5 h-3.5 mr-1.5" />
                  <SelectValue placeholder={t('filters.allWorkTypes', 'Materijal/Rad')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('filters.allWorkTypes', 'Materijal/Rad')}</SelectItem>
                  <SelectItem value="material">🧱 {t('workType.material', 'Materijal')}</SelectItem>
                  <SelectItem value="labor">👷 {t('workType.labor', 'Rad')}</SelectItem>
                  <SelectItem value="equipment">🛠️ {t('workType.equipment', 'Oprema')}</SelectItem>
                  <SelectItem value="other">📦 {t('workType.other', 'Ostalo')}</SelectItem>
                </SelectContent>
              </Select>

              {/* Category Filter */}
              {(() => {
                const usedCategories = [...new Set(expenses.map(e => e.category))];
                return (
                  <Select
                    value={filterCategory}
                    onValueChange={setFilterCategory}
                  >
                    <SelectTrigger className="w-[180px] h-8 text-xs">
                      <Filter className="w-3.5 h-3.5 mr-1.5" />
                      <SelectValue placeholder={t('filters.allCategories', 'Sve kategorije')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('filters.allCategories', 'Sve kategorije')}</SelectItem>
                      {usedCategories.map((catId) => {
                        const catInfo = resolveCategory(catId, customCategories);
                        return (
                          <SelectItem key={catId} value={catId}>
                            {catInfo.icon} {catInfo.name}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                );
              })()}
            </div>
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
          {/* Print button - always visible */}
          {filteredExpenses.length > 0 && (
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs text-muted-foreground">
                {hasActiveFilters
                  ? t('filters.resultsCount', '{{count}} rezultata', { count: filteredExpenses.length })
                  : `${filteredExpenses.length} ${t('projects.transactions', 'transakcija')}`
                }
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={handlePrintFiltered}
              >
                <Printer className="w-3.5 h-3.5" />
                {t('common.print', 'Ispis')}
              </Button>
            </div>
          )}

          {filteredExpenses.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">{t('filters.noResults', 'Nema rezultata za odabrane filtere')}</p>
            </div>
          ) : (
            <>
              {filteredExpenses.map((expense) => {
                const categoryInfo = resolveCategory(expense.category, customCategories);
                const isIncome = expense.type === 'income';
                const milestoneName = getMilestoneName(expense.milestone_id);
                const authorId = expense.submitted_by || expense.user_id;
                const authorName = profiles[authorId] || 'Član';
                const isOwnExpense = authorId === user?.id;

                return (
                  <div 
                    key={expense.id} 
                    className="flex items-center gap-2 py-2.5 px-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer active:bg-muted/70"
                    onClick={() => {
                      setSelectedExpense(expense);
                      setDetailDialogOpen(true);
                    }}
                  >
                    <div 
                      className="w-8 h-8 rounded-md flex items-center justify-center text-base shrink-0"
                      style={{ backgroundColor: `hsl(var(--${categoryInfo.color}) / 0.15)` }}
                    >
                      {categoryInfo.icon}
                    </div>
                    
                    <div className="flex-1 min-w-0 mr-2">
                      <div className="flex items-center gap-1.5">
                        <p className="font-medium text-foreground truncate text-sm leading-tight">
                          {expense.description}
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
                      
                      <div className="flex items-center gap-1 mt-0.5 text-[11px] text-muted-foreground leading-tight">
                        <span className="flex items-center gap-0.5 shrink-0">
                          <User className="w-3 h-3" />
                          {isOwnExpense ? t('common.you', 'Ti') : authorName}
                        </span>
                        <span className="text-muted-foreground/50">•</span>
                        <span className="truncate max-w-[60px]">{categoryInfo.name}</span>
                        {milestoneName && (
                          <>
                            <span className="text-muted-foreground/50">•</span>
                            <span className="flex items-center gap-0.5 truncate max-w-[80px]">
                              <Target className="w-3 h-3 shrink-0" />
                              {milestoneName}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

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
                  </div>
                );
              })}

              {/* Summary totals */}
              <div className="mt-3 p-3 rounded-lg bg-muted/50 border flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="text-muted-foreground text-xs font-medium">{t('common.total', 'Ukupno')}:</span>
                {filteredTotals.totalExpenses > 0 && (
                  <span className="flex items-center gap-1 text-expense font-medium">
                    <TrendingDown className="w-3.5 h-3.5" />
                    -{formatAmount(filteredTotals.totalExpenses)}
                  </span>
                )}
                {filteredTotals.totalIncome > 0 && (
                  <span className="flex items-center gap-1 text-income font-medium">
                    <TrendingUp className="w-3.5 h-3.5" />
                    +{formatAmount(filteredTotals.totalIncome)}
                  </span>
                )}
                <span className={cn(
                  "font-bold ml-auto",
                  filteredTotals.net >= 0 ? "text-income" : "text-expense"
                )}>
                  {filteredTotals.net >= 0 ? '+' : ''}{formatAmount(filteredTotals.net)}
                </span>
              </div>
            </>
          )}
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
                    onSelect={(d) => { if (d) { setDate(d); setAddDateOpen(false); } }}
                    disabled={makeCalendarDisabled(addDateRangeLimits)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Payment source */}
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

      {/* Transaction Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col overflow-hidden p-0">
          <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              {t('transactions.details', 'Detalji transakcije')}
            </DialogTitle>
          </DialogHeader>

          {selectedExpense && (
            <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6 space-y-4">
              {/* Transaction summary */}
              <div className="p-3 rounded-lg bg-muted/50 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-background flex items-center justify-center text-lg shrink-0">
                  {resolveCategory(selectedExpense.category, customCategories).icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{selectedExpense.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(selectedExpense.date), 'd. MMM yyyy', { locale: hr })}
                    {getMilestoneName(selectedExpense.milestone_id) && (
                      <> • <Target className="w-3 h-3 inline" /> {getMilestoneName(selectedExpense.milestone_id)}</>
                    )}
                  </p>
                </div>
                <div className={cn(
                  "font-mono font-medium shrink-0",
                  selectedExpense.type === 'income' ? "text-income" : "text-expense"
                )}>
                  {selectedExpense.type === 'income' ? '+' : '-'}{formatAmount(selectedExpense.amount)}
                </div>
              </div>

              {/* Items */}
              <TransactionItemsExpander
                expenseId={selectedExpense.id}
                isExpanded={true}
                onToggle={() => {}}
              />

              {/* Action buttons */}
              {(() => {
                const authorId = selectedExpense.submitted_by || selectedExpense.user_id;
                const isOwnExpense = authorId === user?.id;
                return (isManager || isOwnExpense) ? (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        setDetailDialogOpen(false);
                        handleOpenEdit(selectedExpense);
                      }}
                    >
                      <Pencil className="w-4 h-4 mr-2" />
                      {t('common.edit', 'Uredi')}
                    </Button>
                    <Button
                      variant="outline"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => {
                        setDetailDialogOpen(false);
                        handleDeleteExpense(selectedExpense.id);
                      }}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      {t('common.delete', 'Obriši')}
                    </Button>
                  </div>
                ) : null;
              })()}

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
                    onSelect={(d) => { if (d) { setEditDate(d); setEditDateOpen(false); } }}
                    disabled={makeCalendarDisabled(editDateRangeLimits)}
                    initialFocus
                    locale={hr}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Payment source */}
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
