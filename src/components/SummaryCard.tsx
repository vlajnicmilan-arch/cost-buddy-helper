import { cn } from '@/lib/utils';

interface SummaryCardProps {
  title: string;
  amount: number;
  variant: 'balance' | 'income' | 'expense';
  icon: React.ReactNode;
}

export const SummaryCard = ({ title, amount, variant, icon }: SummaryCardProps) => {
  const formatAmount = (value: number) => {
    return new Intl.NumberFormat('hr-HR', {
      style: 'currency',
      currency: 'EUR',
    }).format(value);
  };

  return (
    <div className="glass-card rounded-2xl p-6 animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-muted-foreground">{title}</span>
        <div className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center",
          variant === 'balance' && "bg-primary/10 text-primary",
          variant === 'income' && "bg-income/10 text-income",
          variant === 'expense' && "bg-expense/10 text-expense",
        )}>
          {icon}
        </div>
      </div>
      <p className={cn(
        "text-2xl font-mono font-bold",
        variant === 'balance' && "text-foreground",
        variant === 'income' && "text-income",
        variant === 'expense' && "text-expense",
      )}>
        {variant === 'expense' ? '-' : ''}{formatAmount(Math.abs(amount))}
      </p>
    </div>
  );
};
