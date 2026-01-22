import { useExpenses } from '@/hooks/useExpenses';
import { useAuth } from '@/hooks/useAuth';
import { useStorage } from '@/contexts/StorageContext';
import { useAutoBackup } from '@/hooks/useAutoBackup';
import { SummaryCard } from '@/components/SummaryCard';
import { TransactionItem } from '@/components/TransactionItem';
import { AddExpenseDialog } from '@/components/AddExpenseDialog';
import { CategoryBreakdown } from '@/components/CategoryBreakdown';
import { BankConnection } from '@/components/BankConnection';
import { BackupRestore } from '@/components/BackupRestore';
import { TransactionListDialog } from '@/components/TransactionListDialog';
import { TransactionDetailDialog } from '@/components/TransactionDetailDialog';
import { EditTransactionDialog } from '@/components/EditTransactionDialog';
import { TransferListDialog } from '@/components/TransferListDialog';
import { IncomeSourcesPanel } from '@/components/income-sources/IncomeSourcesPanel';
import { CustomCategoriesPanel } from '@/components/custom-categories/CustomCategoriesPanel';
import { ReportsDialog } from '@/components/reports/ReportsDialog';
import { Expense } from '@/types/expense';
import { Wallet, TrendingUp, TrendingDown, LogOut, Loader2, Settings, Smartphone, Cloud, ArrowLeftRight, LayoutDashboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const Index = () => {
  const { user, loading: authLoading, signOut } = useAuth();
  const { storageMode } = useStorage();
  const navigate = useNavigate();
  const [incomeDialogOpen, setIncomeDialogOpen] = useState(false);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Expense | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  
  const { 
    expenses, 
    loading: expensesLoading,
    addExpense, 
    updateExpense,
    deleteExpense, 
    importFromCSV,
    findDuplicates,
    totalExpenses, 
    totalIncome, 
    totalTransfers,
    monthlyTransfers,
    monthlyTransferCount,
    balance,
    expensesByCategory,
    isLocalMode,
    refetch
  } = useExpenses();

  // Get all transfers for the dialog
  const allTransfers = useMemo(() => 
    expenses.filter(e => e.type === 'transfer').sort((a, b) => b.date.getTime() - a.date.getTime()),
    [expenses]
  );

  // Initialize auto-backup for local mode
  useAutoBackup();

  useEffect(() => {
    // Only redirect to auth if using cloud mode and not logged in
    if (!authLoading && !user && storageMode === 'cloud') {
      navigate('/auth');
    }
  }, [user, authLoading, navigate, storageMode]);

  const handleSignOut = async () => {
    if (isLocalMode) {
      // For local mode, go to setup to change storage
      navigate('/setup');
    } else {
      await signOut();
      navigate('/auth');
    }
  };

  if (authLoading && storageMode === 'cloud') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user && storageMode === 'cloud') {
    return null;
  }

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 mb-6 sm:mb-8">
          <div className="flex items-center justify-between sm:block">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">FinMate</h1>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-sm sm:text-base text-muted-foreground hidden sm:block">Upravljaj svojim financijama</p>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/50 text-xs text-muted-foreground">
                        {isLocalMode ? (
                          <>
                            <Smartphone className="w-3 h-3" />
                            Lokalno
                          </>
                        ) : (
                          <>
                            <Cloud className="w-3 h-3" />
                            Cloud
                          </>
                        )}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{isLocalMode ? 'Podaci su spremljeni na ovom uređaju' : 'Podaci su u oblaku'}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
            {/* Mobile-only quick actions */}
            <div className="flex items-center gap-1 sm:hidden">
              <Button 
                variant="outline" 
                size="icon" 
                onClick={() => navigate('/dashboard')}
                className="rounded-xl h-9 w-9"
              >
                <LayoutDashboard className="w-4 h-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => navigate('/setup')}
                className="rounded-xl h-9 w-9"
              >
                <Settings className="w-4 h-4" />
              </Button>
              {!isLocalMode && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={handleSignOut}
                  className="rounded-xl h-9 w-9"
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
          
          {/* Action buttons row */}
          <div className="flex items-center gap-2">
            <ReportsDialog expenses={expenses} />
            <AddExpenseDialog onAdd={addExpense} />
            {/* Desktop-only buttons */}
            <div className="hidden sm:flex items-center gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      onClick={() => navigate('/dashboard')}
                      className="rounded-xl"
                    >
                      <LayoutDashboard className="w-5 h-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Dashboard</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => navigate('/setup')}
                      className="rounded-xl"
                    >
                      <Settings className="w-5 h-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Promijeni način pohrane</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {!isLocalMode && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={handleSignOut}
                  className="rounded-xl"
                >
                  <LogOut className="w-5 h-5" />
                </Button>
              )}
            </div>
          </div>
        </header>

        {/* Local Mode Banner */}
        {isLocalMode && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-muted/50 rounded-xl flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <Smartphone className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Lokalni način rada</p>
                <p className="text-xs text-muted-foreground">Podaci ostaju samo na ovom uređaju</p>
              </div>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => navigate('/setup')}
              className="rounded-lg text-xs"
            >
              Prebaci u oblak
            </Button>
          </motion.div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <SummaryCard
            title="Stanje"
            amount={balance}
            variant="balance"
            icon={<Wallet className="w-5 h-5" />}
          />
          <SummaryCard
            title="Prihodi"
            amount={totalIncome}
            variant="income"
            icon={<TrendingUp className="w-5 h-5" />}
            onClick={() => setIncomeDialogOpen(true)}
          />
          <SummaryCard
            title="Troškovi"
            amount={totalExpenses}
            variant="expense"
            icon={<TrendingDown className="w-5 h-5" />}
            onClick={() => setExpenseDialogOpen(true)}
          />
        </div>

        {/* Transfers Summary - Clickable with toggle */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 p-4 bg-muted/30 border border-border/50 rounded-xl"
        >
          <div 
            onClick={() => setTransferDialogOpen(true)}
            className="flex items-center justify-between cursor-pointer hover:opacity-80 transition-opacity"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <ArrowLeftRight className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">Prijenosi</p>
                <p className="text-xs text-muted-foreground">
                  {allTransfers.length === 0 
                    ? 'Nema prijenosa između vlastitih računa' 
                    : `${allTransfers.length} ${allTransfers.length === 1 ? 'prijenos' : 'prijenosa'} ukupno`}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-mono font-semibold text-lg text-muted-foreground">
                ↔ {new Intl.NumberFormat('hr-HR', { style: 'currency', currency: 'EUR' }).format(totalTransfers)}
              </p>
              <p className="text-xs text-muted-foreground">Klikni za detalje →</p>
            </div>
          </div>
          
          {/* Quick stats row */}
          {allTransfers.length > 0 && monthlyTransferCount > 0 && (
            <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
              <span>Ovaj mjesec: {monthlyTransferCount} {monthlyTransferCount === 1 ? 'prijenos' : 'prijenosa'}</span>
              <span className="font-mono">{new Intl.NumberFormat('hr-HR', { style: 'currency', currency: 'EUR' }).format(monthlyTransfers)}</span>
            </div>
          )}
        </motion.div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Income Sources - Mobile First (visible only on mobile, above transactions) */}
          <div className="lg:hidden">
            <IncomeSourcesPanel
              expenses={expenses}
              onUpdateExpense={updateExpense}
              onDeleteExpense={deleteExpense}
              onRefreshExpenses={refetch}
            />
          </div>

          {/* Transactions */}
          <div className="lg:col-span-2 glass-card rounded-2xl p-6 animate-fade-in">
            <h2 className="text-lg font-semibold mb-4">Nedavne transakcije</h2>
            {expensesLoading ? (
              <div className="py-12 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : expenses.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-muted-foreground">Još nema transakcija</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Dodaj prvu transakciju klikom na "Dodaj"
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <AnimatePresence>
                  {expenses.map((expense) => (
                    <TransactionItem
                      key={expense.id}
                      expense={expense}
                      onDelete={deleteExpense}
                      onClick={(e) => {
                        setSelectedTransaction(e);
                        setDetailDialogOpen(true);
                      }}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            {/* Income Sources - Desktop (hidden on mobile since it's shown above) */}
            <div className="hidden lg:block">
              <IncomeSourcesPanel
                expenses={expenses}
                onUpdateExpense={updateExpense}
                onDeleteExpense={deleteExpense}
                onRefreshExpenses={refetch}
              />
            </div>
            <CategoryBreakdown 
              expensesByCategory={expensesByCategory} 
              total={totalExpenses}
              expenses={expenses}
              onUpdateExpense={updateExpense}
              onDeleteExpense={deleteExpense}
            />
            <CustomCategoriesPanel />
            <BankConnection onImportCSV={importFromCSV} findDuplicates={findDuplicates} />
            <BackupRestore onDataImported={refetch} />
          </div>
        </div>
      </div>

      {/* Transaction Dialogs */}
      <TransactionListDialog
        open={incomeDialogOpen}
        onOpenChange={setIncomeDialogOpen}
        type="income"
        expenses={expenses}
        onUpdate={updateExpense}
        onDelete={deleteExpense}
        total={totalIncome}
      />
      <TransactionListDialog
        open={expenseDialogOpen}
        onOpenChange={setExpenseDialogOpen}
        type="expense"
        expenses={expenses}
        onUpdate={updateExpense}
        onDelete={deleteExpense}
        total={totalExpenses}
      />

      {/* Transfer List Dialog */}
      <TransferListDialog
        open={transferDialogOpen}
        onOpenChange={setTransferDialogOpen}
        transfers={allTransfers}
        totalAmount={totalTransfers}
      />

      {/* Transaction Detail Dialog */}
      <TransactionDetailDialog
        expense={selectedTransaction}
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        onEdit={(expense) => {
          setSelectedTransaction(expense);
          setDetailDialogOpen(false);
          setEditDialogOpen(true);
        }}
        onDelete={deleteExpense}
      />

      {/* Edit Transaction Dialog */}
      <EditTransactionDialog
        expense={selectedTransaction}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSave={updateExpense}
      />
    </div>
  );
};

export default Index;
