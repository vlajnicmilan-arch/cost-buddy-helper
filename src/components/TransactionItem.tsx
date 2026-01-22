import { Expense, getCategoryInfo, getPaymentSourceInfo } from '@/types/expense';
import { cn } from '@/lib/utils';
import { Trash2, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

interface TransactionItemProps {
  expense: Expense;
  onDelete: (id: string) => void;
  onClick?: (expense: Expense) => void;
}

export const TransactionItem = ({ expense, onDelete, onClick }: TransactionItemProps) => {
  const category = getCategoryInfo(expense.category);
  const paymentSource = getPaymentSourceInfo(expense.payment_source || 'cash');
  
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

  const handleClick = () => {
    if (onClick) {
      onClick(expense);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      onClick={handleClick}
      className={cn(
        "group flex items-center gap-4 p-4 rounded-xl hover:bg-muted/50 transition-colors",
        onClick && "cursor-pointer"
      )}
    >
      <div 
        className="w-12 h-12 rounded-xl flex items-center justify-center text-xl shrink-0"
        style={{ backgroundColor: `hsl(var(--${category.color}) / 0.1)` }}
      >
        {category.icon}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-foreground truncate">{expense.description}</p>
          {expense.ai_extracted && (
            <Sparkles className="w-3.5 h-3.5 text-accent shrink-0" />
          )}
        </div>
        <p className="text-sm text-muted-foreground flex items-center gap-1 flex-wrap">
          {expense.merchant_name && <span>{expense.merchant_name} •</span>}
          <span className="inline-flex items-center gap-0.5">
            <span>{paymentSource.icon}</span>
            <span>{paymentSource.name}</span>
          </span>
          {expense.type === 'expense' && (
            <span>• {category.name}</span>
          )}
          <span>• {formatDate(expense.date)}</span>
        </p>
      </div>

      <div className="flex items-center gap-3">
        <p className={cn(
          "font-mono font-semibold text-right",
          expense.type === 'expense' ? 'text-expense' : 'text-income'
        )}>
          {expense.type === 'expense' ? '-' : '+'}{formatAmount(Number(expense.amount))}
        </p>
        
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(expense.id);
          }}
          className="opacity-0 group-hover:opacity-100 p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
};