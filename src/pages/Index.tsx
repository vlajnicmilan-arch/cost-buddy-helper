import { useExpenses } from '@/hooks/useExpenses';
import { useAuth } from '@/hooks/useAuth';
import { useStorage } from '@/contexts/StorageContext';
import { SummaryCard } from '@/components/SummaryCard';
import { TransactionItem } from '@/components/TransactionItem';
import { AddExpenseDialog } from '@/components/AddExpenseDialog';
import { CategoryBreakdown } from '@/components/CategoryBreakdown';
import { BankConnection } from '@/components/BankConnection';
import { BackupRestore } from '@/components/BackupRestore';
import { Wallet, TrendingUp, TrendingDown, LogOut, Loader2, Settings, Smartphone, Cloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const Index = () => {
  const { user, loading: authLoading, signOut } = useAuth();
  const { storageMode } = useStorage();
  const navigate = useNavigate();
  
  const { 
    expenses, 
    loading: expensesLoading,
    addExpense, 
    deleteExpense, 
    importFromCSV,
    totalExpenses, 
    totalIncome, 
    balance,
    expensesByCategory,
    isLocalMode,
    refetch
  } = useExpenses();

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
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <header className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground tracking-tight">FinMate</h1>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-muted-foreground">Upravljaj svojim financijama</p>
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
          <div className="flex items-center gap-2">
            <AddExpenseDialog onAdd={addExpense} />
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
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
          />
          <SummaryCard
            title="Troškovi"
            amount={totalExpenses}
            variant="expense"
            icon={<TrendingDown className="w-5 h-5" />}
          />
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            <CategoryBreakdown 
              expensesByCategory={expensesByCategory} 
              total={totalExpenses} 
            />
            <BankConnection onImportCSV={importFromCSV} />
            <BackupRestore onDataImported={refetch} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
