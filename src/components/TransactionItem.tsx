import { Expense, getCategoryInfo, getPaymentSourceInfo } from '@/types/expense';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import { useCurrency } from '@/contexts/CurrencyContext';
import { cn } from '@/lib/utils';
import { Trash2, Sparkles, MessageCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface TransactionItemProps {
  expense: Expense;
  onDelete: (id: string) => void;
  onClick?: (expense: Expense) => void;
}

export const TransactionItem = ({ expense, onDelete, onClick }: TransactionItemProps) => {
  const category = getCategoryInfo(expense.category);
  const paymentSource = getPaymentSourceInfo(expense.payment_source || 'cash');
  const { customPaymentSources } = useCustomPaymentSources();
  const { formatAmount } = useCurrency();
  const { t } = useTranslation();

  // Find card info if transaction has a card assigned
  const cardInfo = useMemo(() => {
    if (!expense.payment_source_card_id) return null;
    for (const source of customPaymentSources) {
      const card = source.cards?.find(c => c.id === expense.payment_source_card_id);
      if (card) return card;
    }
    return null;
  }, [expense.payment_source_card_id, customPaymentSources]);

  // Check if payment source is a custom one
  const customSource = useMemo(() => {
    return customPaymentSources.find(s => s.id === expense.payment_source);
  }, [expense.payment_source, customPaymentSources]);
  

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
          {expense.note && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="relative shrink-0">
                  <MessageCircle className="w-4 h-4 text-primary" />
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-primary rounded-full animate-pulse" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p className="text-sm">{expense.note}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        <p className="text-sm text-muted-foreground flex items-center gap-1 flex-wrap">
          {expense.merchant_name && <span>{expense.merchant_name} •</span>}
          <span className="inline-flex items-center gap-0.5">
            {customSource ? (
              <>
                <span 
                  className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[10px]"
                  style={{ backgroundColor: customSource.color }}
                >
                  {customSource.icon}
                </span>
                <span>{customSource.name}</span>
              </>
            ) : (
              <>
                <span>{paymentSource.icon}</span>
                <span>{paymentSource.name}</span>
              </>
            )}
          </span>
          {cardInfo && (
            <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
              💳 •••• {cardInfo.last_four_digits}
            </span>
          )}
          {expense.type === 'transfer' && (
            <span className="text-primary">• {t('transactions.transfer')}</span>
          )}
          {expense.type === 'expense' && (
            <span>• {category.name}</span>
          )}
          <span>• {formatDate(expense.date)}</span>
        </p>
      </div>

      <div className="flex items-center gap-3">
        <p className={cn(
          "font-mono font-semibold text-right",
          expense.type === 'expense' ? 'text-expense' : 
          expense.type === 'transfer' ? 'text-muted-foreground' : 'text-income'
        )}>
          {expense.type === 'expense' ? '-' : expense.type === 'transfer' ? '↔' : '+'}{formatAmount(Number(expense.amount))}
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