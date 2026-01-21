import { Expense, getCategoryInfo } from '@/types/expense';
import { cn } from '@/lib/utils';
import { Trash2 } from 'lucide-react';

interface TransactionItemProps {
  expense: Expense;
  onDelete: (id: string) => void;
}

export const TransactionItem = ({ expense, onDelete }: TransactionItemProps) => {
  const category = getCategoryInfo(expense.category);
  
  const formatAmount = (value: number) => {
    return new Intl.NumberFormat('hr-HR', {
      style: 'currency',
      currency: 'EUR',
    }).format(value);
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('hr-HR', {
      day: 'numeric',
      month: 'short',
    }).format(date);
  };

  return (
    <div className="group flex items-center gap-4 p-4 rounded-xl hover:bg-muted/50 transition-colors animate-slide-up">
      <div className={cn(
        "w-12 h-12 rounded-xl flex items-center justify-center text-xl shrink-0",
        `bg-${category.color}/10`
      )} style={{ backgroundColor: `hsl(var(--${category.color}) / 0.1)` }}>
        {category.icon}
      </div>
      
      <div className="flex-1 min-w-0">
        <p className="font-medium text-foreground truncate">{expense.description}</p>
        <p className="text-sm text-muted-foreground">
          {category.name} • {formatDate(expense.date)}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <p className={cn(
          "font-mono font-semibold text-right",
          expense.type === 'expense' ? 'text-expense' : 'text-income'
        )}>
          {expense.type === 'expense' ? '-' : '+'}{formatAmount(expense.amount)}
        </p>
        
        <button
          onClick={() => onDelete(expense.id)}
          className="opacity-0 group-hover:opacity-100 p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
