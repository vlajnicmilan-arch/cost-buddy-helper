import { useExpenses } from '@/hooks/useExpenses';
import { useAuth } from '@/hooks/useAuth';
import { SummaryCard } from '@/components/SummaryCard';
import { TransactionItem } from '@/components/TransactionItem';
import { AddExpenseDialog } from '@/components/AddExpenseDialog';
import { CategoryBreakdown } from '@/components/CategoryBreakdown';
import { BankConnection } from '@/components/BankConnection';
import { Wallet, TrendingUp, TrendingDown, LogOut, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';

const Index = () => {
  const { user, loading: authLoading, signOut } = useAuth();
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
  } = useExpenses();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <header className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground tracking-tight">Trošak</h1>
            <p className="text-muted-foreground mt-1">Upravljaj svojim financijama</p>
          </div>
          <div className="flex items-center gap-3">
            <AddExpenseDialog onAdd={addExpense} />
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleSignOut}
              className="rounded-xl"
            >
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </header>

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
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
