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

  // Determine display title - prefer merchant name for OCR scanned receipts
  const displayTitle = expense.merchant_name || expense.description;

  return (
    <motion.div 
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      onClick={handleClick}
      className={cn(
        "group flex items-center gap-2 py-2.5 px-2 rounded-lg hover:bg-muted/50 transition-colors",
        onClick && "cursor-pointer"
      )}
    >
      {/* Category Icon - smaller */}
      <div 
        className="w-8 h-8 rounded-md flex items-center justify-center text-base shrink-0"
        style={{ backgroundColor: `hsl(var(--${category.color}) / 0.15)` }}
      >
        {category.icon}
      </div>
      
      {/* Main Content */}
      <div className="flex-1 min-w-0 mr-2">
        {/* Title Row */}
        <div className="flex items-center gap-1.5">
          <p className="font-medium text-foreground truncate text-sm leading-tight">
            {displayTitle}
          </p>
          {expense.ai_extracted && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Sparkles className="w-3 h-3 text-accent shrink-0" />
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">{t('transactions.aiExtracted', 'Skenirano s računa')}</p>
              </TooltipContent>
            </Tooltip>
          )}
          {expense.note && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="relative shrink-0">
                  <MessageCircle className="w-3 h-3 text-primary" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p className="text-sm">{expense.note}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        
        {/* Info Row - compact */}
        <div className="flex items-center gap-1 mt-0.5 text-[11px] text-muted-foreground leading-tight">
          {/* Payment Source */}
          <span className="inline-flex items-center gap-0.5 shrink-0">
            {customSource ? (
              <>
                <span 
                  className="w-3 h-3 rounded-full flex items-center justify-center text-[8px]"
                  style={{ backgroundColor: customSource.color, color: 'white' }}
                >
                  {customSource.icon}
                </span>
                <span className="truncate max-w-[50px]">{customSource.name}</span>
              </>
            ) : (
              <>
                <span className="text-[10px]">{paymentSource.icon}</span>
                <span>{paymentSource.name}</span>
              </>
            )}
          </span>
          
          {/* Card Info */}
          {cardInfo && (
            <span className="text-[10px] font-mono text-muted-foreground/80">
              ••{cardInfo.last_four_digits}
            </span>
          )}
          
          <span className="text-muted-foreground/40">•</span>
          
          {/* Category for expenses */}
          {expense.type === 'expense' && (
            <span className="truncate max-w-[60px]">{category.name}</span>
          )}
          
          {/* Transfer indicator */}
          {expense.type === 'transfer' && (
            <span className="text-primary">{t('transactions.transfer')}</span>
          )}
          
          {/* Income indicator */}
          {expense.type === 'income' && (
            <span className="text-income">{t('transactions.income', 'Prihod')}</span>
          )}
        </div>
      </div>

      {/* Amount & Date Column */}
      <div className="flex flex-col items-end shrink-0 gap-0.5">
        <p className={cn(
          "font-mono font-bold text-sm leading-tight",
          expense.type === 'expense' ? 'text-destructive' : 
          expense.type === 'transfer' ? 'text-muted-foreground' : 'text-income'
        )}>
          {expense.type === 'expense' ? '-' : expense.type === 'transfer' ? '↔' : '+'}{formatAmount(Number(expense.amount))}
        </p>
        <span className="text-[10px] text-muted-foreground/70">
          {formatDate(expense.date)}
        </span>
      </div>
      
      {/* Delete Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(expense.id);
        }}
        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all shrink-0"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  );
};
