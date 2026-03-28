import React from 'react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { useCurrency } from '@/contexts/CurrencyContext';

interface SummaryCardProps {
  title: string;
  amount: number;
  variant: 'balance' | 'income' | 'expense';
  icon: React.ReactNode;
  isActive?: boolean;
  onClick?: () => void;
}

export const SummaryCard = React.memo(({ title, amount, variant, icon, isActive, onClick }: SummaryCardProps) => {
  const { formatAmount } = useCurrency();

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      className={cn(
        "glass-card rounded-xl sm:rounded-2xl p-3 sm:p-6 transition-all duration-200",
        onClick && "cursor-pointer hover:scale-[1.02] hover:shadow-lg",
        isActive && "ring-2 ring-primary ring-offset-2 ring-offset-background"
      )}
    >
      <div className="flex items-center justify-between mb-2 sm:mb-3">
        <span className="text-xs sm:text-sm font-medium text-muted-foreground">{title}</span>
        <div className={cn(
          "w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl flex items-center justify-center",
          variant === 'balance' && "bg-primary/10 text-primary",
          variant === 'income' && "bg-income/10 text-income",
          variant === 'expense' && "bg-expense/10 text-expense",
        )}>
          {icon}
        </div>
      </div>
      <p className={cn(
        "text-lg sm:text-2xl font-mono font-bold",
        variant === 'balance' && "text-foreground",
        variant === 'income' && "text-income",
        variant === 'expense' && "text-expense",
      )}>
        {variant === 'expense' ? '-' : ''}{formatAmount(Math.abs(amount))}
      </p>
    </motion.div>
  );
});
