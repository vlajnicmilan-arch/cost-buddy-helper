import { useExpenses } from '@/hooks/useExpenses';
import { SummaryCard } from '@/components/SummaryCard';
import { TransactionItem } from '@/components/TransactionItem';
import { AddExpenseDialog } from '@/components/AddExpenseDialog';
import { CategoryBreakdown } from '@/components/CategoryBreakdown';
import { Wallet, TrendingUp, TrendingDown } from 'lucide-react';

const Index = () => {
  const { 
    expenses, 
    addExpense, 
    deleteExpense, 
    totalExpenses, 
    totalIncome, 
    balance,
    expensesByCategory,
  } = useExpenses();

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <header className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground tracking-tight">Trošak</h1>
            <p className="text-muted-foreground mt-1">Upravljaj svojim financijama</p>
          </div>
          <AddExpenseDialog onAdd={addExpense} />
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
            {expenses.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-muted-foreground">Još nema transakcija</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Dodaj prvu transakciju klikom na "Dodaj"
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {expenses.map((expense) => (
                  <TransactionItem
                    key={expense.id}
                    expense={expense}
                    onDelete={deleteExpense}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Category Breakdown */}
          <div className="lg:col-span-1">
            <CategoryBreakdown 
              expensesByCategory={expensesByCategory} 
              total={totalExpenses} 
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
