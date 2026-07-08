import { useState, useEffect, useCallback } from 'react';
import { useBackButton } from '@/hooks/useBackButton';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useTranslation } from 'react-i18next';
import { BudgetWithStats, BUDGET_PERIOD_LABELS } from '@/types/budget';
import { useBudgetMembers } from '@/hooks/useBudgetMembers';
import { useBudgetPendingTransactions } from '@/hooks/useBudgetPendingTransactions';
import { BudgetMembersTab } from './BudgetMembersTab';
import { cn } from '@/lib/utils';
import { Expense, getCategoryInfo } from '@/types/expense';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { TransactionDetailDialog } from '@/components/TransactionDetailDialog';
import { EditTransactionDialog } from '@/components/EditTransactionDialog';
import { TransactionItem } from '@/components/TransactionItem';
import { useExpenses } from '@/hooks/useExpenses';
import { BudgetHistoryTab } from './BudgetHistoryTab';
import { 
  X,
  Edit,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  Users,
  Calendar,
  Clock,
  Check,
  Receipt,
  Loader2,
  History
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface BudgetFullScreenViewProps {
  open: boolean;
  onClose: () => void;
  budget: BudgetWithStats | null;
  onEdit: () => void;
}

export const BudgetFullScreenView = ({
  open,
  onClose,
  budget,
  onEdit,
}: BudgetFullScreenViewProps) => {
  const { formatAmount } = useCurrency();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('overview');
  useBackButton(open, onClose);
  const { members, invitations, loading: membersLoading, isOwner, refetch: refetchMembers } = useBudgetMembers(budget?.id || null);
  const { 
    pendingTransactions, 
    approveTransaction, 
    rejectTransaction, 
    pendingCount 
  } = useBudgetPendingTransactions(budget?.id || null);
  const { deleteExpense, updateExpense } = useExpenses();

  // Budget transactions
  const [budgetExpenses, setBudgetExpenses] = useState<Expense[]>([]);
  const [loadingExpenses, setLoadingExpenses] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editExpense, setEditExpense] = useState<Expense | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const fetchBudgetExpenses = useCallback(async () => {
    if (!budget?.id) return;
    setLoadingExpenses(true);
    try {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('budget_id', budget.id)
        .order('date', { ascending: false });
      if (error) throw error;
      setBudgetExpenses((data || []).map(e => ({
        ...e,
        date: new Date(e.date),
        amount: Number(e.amount),
        type: e.type as any,
        category: e.category as any,
        payment_source: e.payment_source as any,
        expense_nature: e.expense_nature as 'regular' | 'extraordinary' | undefined,
      })));
    } catch (err) {
      console.error('Error fetching budget expenses:', err);
    } finally {
      setLoadingExpenses(false);
    }
  }, [budget?.id]);

  useEffect(() => {
    if (open && budget?.id) {
      fetchBudgetExpenses();
    }
  }, [open, budget?.id, fetchBudgetExpenses]);

  const handleExpenseClick = (expense: Expense) => {
    setSelectedExpense(expense);
    setDetailOpen(true);
  };

  const handleEditFromDetail = (expense: Expense) => {
    setDetailOpen(false);
    setTimeout(() => {
      setEditExpense(expense);
      setEditOpen(true);
    }, 100);
  };

  const handleDeleteExpense = async (id: string) => {
    await deleteExpense(id);
    fetchBudgetExpenses();
    setDetailOpen(false);
  };

  const handleSaveExpense = async (expense: Expense) => {
    await updateExpense(expense);
    fetchBudgetExpenses();
    setEditOpen(false);
  };

  // Reset tab when budget changes
  useEffect(() => {
    if (!open) {
      setActiveTab('overview');
    }
  }, [open, budget?.id]);

  // Handle back navigation
  useEffect(() => {
    if (!open) return;

    const handlePopState = (e: PopStateEvent) => {
      e.preventDefault();
      onClose();
    };

    window.history.pushState({ budgetView: true }, '');
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [open, onClose]);

  if (!budget) return null;

  const TrendIcon = budget.trend === 'up' 
    ? TrendingUp 
    : budget.trend === 'down' 
      ? TrendingDown 
      : Minus;

  const getProgressColor = (percentage: number, isOver: boolean, isWarning: boolean) => {
    if (isOver) return 'bg-destructive';
    if (isWarning) return 'bg-budget-warning';
    return 'bg-primary';
  };

  return (
    <>
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-background"
        >
          <div className="h-full flex flex-col">
            {/* Header */}
            <header className="flex items-center justify-between p-4 border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0">
                  <X className="w-5 h-5" />
                </Button>
                <div 
                  className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-xl sm:text-2xl shrink-0"
                  style={{ backgroundColor: `${budget.color}20` }}
                >
                  {budget.icon || '💰'}
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg sm:text-xl font-bold truncate">{budget.name}</h1>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="capitalize">{t(`budget.period.${budget.period_type}`, BUDGET_PERIOD_LABELS[budget.period_type])}</span>
                    {budget.daysRemaining !== undefined && budget.daysRemaining >= 0 && (
                      <>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {budget.daysRemaining} {t('common.daysLeft', 'dana')}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={onEdit}>
                <Edit className="w-4 h-4 mr-1" />
                {t('common.edit', 'Uredi')}
              </Button>
            </header>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-4xl mx-auto p-4 sm:p-6">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList className="grid w-full grid-cols-4 mb-6">
                    <TabsTrigger value="overview" className="gap-1.5 text-xs sm:text-sm">
                      <BarChart3 className="w-4 h-4" />
                      <span className="hidden sm:inline">{t('budget.overview', 'Pregled')}</span>
                    </TabsTrigger>
                    <TabsTrigger value="history" className="gap-1.5 text-xs sm:text-sm">
                      <History className="w-4 h-4" />
                      <span className="hidden sm:inline">{t('budget.history', 'Povijest')}</span>
                    </TabsTrigger>
                    <TabsTrigger value="transactions" className="gap-1.5 text-xs sm:text-sm">
                      <Receipt className="w-4 h-4" />
                      <span className="hidden sm:inline">{t('budget.transactions', 'Transakcije')}</span>
                      <span className="sm:hidden">({budgetExpenses.length})</span>
                    </TabsTrigger>
                    <TabsTrigger value="members" className="gap-1.5 text-xs sm:text-sm">
                      <Users className="w-4 h-4" />
                      <span className="hidden sm:inline">{t('budget.members', 'Članovi')}</span>
                      <span className="sm:hidden">({members.length})</span>
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="overview" className="space-y-6">
                    {/* Pending Transactions Section - only visible to owners */}
                    {isOwner && pendingCount > 0 && (
                      <div className="p-4 rounded-lg border-2 border-warning/50 bg-warning/10 space-y-3">
                        <div className="flex items-center gap-2 text-warning-foreground">
                          <Clock className="w-5 h-5" />
                          <span className="font-medium">
                            {t('budget.pendingApproval', 'Transakcije na čekanju')} ({pendingCount})
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
                                          {tx.submitter_name}
                                        </span>
                                      </>
                                    )}
                                    {tx.hours_remaining !== undefined && (
                                      <>
                                        <span>•</span>
                                        <span className={tx.hours_remaining < 6 ? 'text-destructive' : ''}>
                                          {tx.hours_remaining}h {t('budget.remaining', 'preostalo')}
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
                                    onClick={() => approveTransaction(tx.id)}
                                  >
                                    <Check className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                    onClick={() => rejectTransaction(tx.id)}
                                  >
                                    <X className="w-4 h-4" />
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        
                        <p className="text-xs text-muted-foreground">
                          {t('budget.autoRejectNote', 'Transakcije koje nisu odobrene unutar 24 sata bit će automatski odbijene.')}
                        </p>
                      </div>
                    )}

                    {/* Main Progress Card */}
                    <div className="p-5 sm:p-6 rounded-2xl bg-card border border-border">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium text-muted-foreground">{t('budget.overallProgress')}</span>
                        <div className="flex items-center gap-2">
                          {(budget.isOverBudget || budget.isWarning) && (
                            <AlertTriangle className={cn(
                              "w-5 h-5",
                              budget.isOverBudget ? "text-destructive" : "text-warning"
                            )} />
                          )}
                          <span className={cn(
                            "text-lg font-bold",
                            budget.isOverBudget && "text-destructive",
                            budget.isWarning && !budget.isOverBudget && "text-warning"
                          )}>
                            {budget.percentage.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                      <div className="h-4 bg-muted rounded-full overflow-hidden mb-4">
                        <motion.div 
                          className={cn("h-full rounded-full", getProgressColor(budget.percentage, budget.isOverBudget, budget.isWarning))}
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(budget.percentage, 100)}%` }}
                          transition={{ duration: 0.5 }}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-mono font-bold text-2xl sm:text-3xl">{formatAmount(budget.spent)}</p>
                          <p className="text-sm text-muted-foreground">{t('budget.spent')}</p>
                        </div>
                        <div className="text-right">
                          <p className={cn(
                            "font-mono font-bold text-2xl sm:text-3xl",
                            budget.remaining < 0 ? "text-destructive" : "text-income"
                          )}>
                            {formatAmount(budget.remaining)}
                          </p>
                          <p className="text-sm text-muted-foreground">{t('budget.remaining')}</p>
                        </div>
                      </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      <div className="p-4 rounded-xl bg-card border border-border">
                        <p className="text-xs text-muted-foreground mb-1">{t('budget.totalBudget')}</p>
                        <p className="font-mono font-bold text-lg">{formatAmount(budget.total_amount)}</p>
                      </div>
                      <div className="p-4 rounded-xl bg-card border border-border">
                        <p className="text-xs text-muted-foreground mb-1">{t('budget.dailyAverage')}</p>
                        <p className="font-mono font-bold text-lg">{formatAmount(budget.dailyAverage || 0)}</p>
                      </div>
                      {budget.trend && (
                        <div className="p-4 rounded-xl bg-card border border-border">
                          <p className="text-xs text-muted-foreground mb-1">{t('budget.trend')}</p>
                          <div className="flex items-center gap-2">
                            <div className={cn(
                              "p-1.5 rounded-lg",
                              budget.trend === 'up' && "bg-expense/10 text-expense",
                              budget.trend === 'down' && "bg-income/10 text-income",
                              budget.trend === 'stable' && "bg-muted text-muted-foreground"
                            )}>
                              <TrendIcon className="w-4 h-4" />
                            </div>
                            <span className="text-sm font-medium">
                              {budget.trend === 'up' && t('budget.trendUp')}
                              {budget.trend === 'down' && t('budget.trendDown')}
                              {budget.trend === 'stable' && t('budget.trendStable')}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Categories Breakdown */}
                    {budget.categories.length > 0 && (
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-module">{t('budget.byCategories')}</h3>
                        <div className="space-y-3">
                          {budget.categories.map((cat) => (
                            <div key={cat.id} className="p-4 rounded-xl bg-card border border-border">
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-3">
                                  <span className="text-2xl">{cat.icon || '📂'}</span>
                                  <span className="font-medium">{cat.category === '__budget_manual_assigned__' ? t('budget.manualAssigned') : cat.category}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  {(cat.isOverBudget || cat.isWarning) && (
                                    <AlertTriangle className={cn(
                                      "w-4 h-4",
                                      cat.isOverBudget ? "text-destructive" : "text-warning"
                                    )} />
                                  )}
                                  <span className="font-medium">{cat.percentage.toFixed(0)}%</span>
                                </div>
                              </div>
                              <div className="h-2 bg-muted rounded-full overflow-hidden mb-2">
                                <div 
                                  className={cn("h-full rounded-full", getProgressColor(cat.percentage, cat.isOverBudget, cat.isWarning))}
                                  style={{ width: `${Math.min(cat.percentage, 100)}%` }}
                                />
                              </div>
                              <div className="flex justify-between text-sm text-muted-foreground">
                                <span>{formatAmount(cat.spent)} / {formatAmount(cat.limit_amount)}</span>
                                <span className={cat.remaining < 0 ? "text-destructive" : ""}>
                                  {cat.remaining < 0 ? '-' : ''}{formatAmount(Math.abs(cat.remaining))} {t('budget.left')}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="history" className="space-y-4">
                    <BudgetHistoryTab budget={budget} />
                  </TabsContent>
                  <TabsContent value="transactions" className="space-y-4">
                    {loadingExpenses ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : budgetExpenses.length === 0 ? (
                      <div className="text-center py-8">
                        <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-muted/50 flex items-center justify-center">
                          <Receipt className="w-7 h-7 text-muted-foreground" />
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {t('budget.noTransactions', 'Nema transakcija povezanih s ovim budžetom')}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {budgetExpenses.map((expense) => (
                          <TransactionItem
                            key={expense.id}
                            expense={expense}
                            onDelete={handleDeleteExpense}
                            onClick={handleExpenseClick}
                          />
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="members">
                    <BudgetMembersTab
                      budgetId={budget.id}
                      members={members}
                      invitations={invitations}
                      isOwner={isOwner}
                      loading={membersLoading}
                      onRefetch={refetchMembers}
                    />
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>

    <TransactionDetailDialog
      expense={selectedExpense}
      open={detailOpen}
      onOpenChange={(open) => {
        setDetailOpen(open);
        if (!open) setSelectedExpense(null);
      }}
      onEdit={handleEditFromDetail}
      onDelete={handleDeleteExpense}
    />

    <EditTransactionDialog
      expense={editExpense}
      open={editOpen}
      onOpenChange={setEditOpen}
      onSave={handleSaveExpense}
    />
    </>
  );
};
