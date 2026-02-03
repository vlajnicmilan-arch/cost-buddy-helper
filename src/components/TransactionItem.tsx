import { Expense, getCategoryInfo, getPaymentSourceInfo } from '@/types/expense';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import { useCurrency } from '@/contexts/CurrencyContext';
import { cn } from '@/lib/utils';
import { Trash2, Sparkles, MessageCircle, Calendar } from 'lucide-react';
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
  const hasSecondaryText = expense.merchant_name && expense.description !== expense.merchant_name;

  return (
    <motion.div 
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      onClick={handleClick}
      className={cn(
        "group flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors border border-transparent hover:border-border/50",
        onClick && "cursor-pointer"
      )}
    >
      {/* Category Icon */}
      <div 
        className="w-10 h-10 rounded-lg flex items-center justify-center text-lg shrink-0"
        style={{ backgroundColor: `hsl(var(--${category.color}) / 0.15)` }}
      >
        {category.icon}
      </div>
      
      {/* Main Content */}
      <div className="flex-1 min-w-0">
        {/* Title Row */}
        <div className="flex items-center gap-2">
          <p className="font-semibold text-foreground truncate text-sm">
            {displayTitle}
          </p>
          {expense.ai_extracted && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Sparkles className="w-3.5 h-3.5 text-accent shrink-0" />
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
                  <MessageCircle className="w-3.5 h-3.5 text-primary" />
                  <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-primary rounded-full" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p className="text-sm">{expense.note}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        
        {/* Info Row - simplified and cleaner */}
        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
          {/* Payment Source */}
          <span className="inline-flex items-center gap-1">
            {customSource ? (
              <>
                <span 
                  className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px]"
                  style={{ backgroundColor: customSource.color, color: 'white' }}
                >
                  {customSource.icon}
                </span>
                <span className="truncate max-w-[60px]">{customSource.name}</span>
              </>
            ) : (
              <>
                <span className="text-xs">{paymentSource.icon}</span>
                <span>{paymentSource.name}</span>
              </>
            )}
          </span>
          
          {/* Card Info */}
          {cardInfo && (
            <>
              <span className="text-muted-foreground/50">•</span>
              <span className="bg-muted/80 px-1.5 py-0.5 rounded text-[10px] font-mono">
                •••• {cardInfo.last_four_digits}
              </span>
            </>
          )}
          
          {/* Category for expenses */}
          {expense.type === 'expense' && (
            <>
              <span className="text-muted-foreground/50">•</span>
              <span className="truncate max-w-[80px]">{category.name}</span>
            </>
          )}
          
          {/* Transfer indicator */}
          {expense.type === 'transfer' && (
            <>
              <span className="text-muted-foreground/50">•</span>
              <span className="text-primary font-medium">{t('transactions.transfer')}</span>
            </>
          )}
          
          {/* Date */}
          <span className="text-muted-foreground/50">•</span>
          <span className="inline-flex items-center gap-0.5">
            <Calendar className="w-3 h-3" />
            {formatDate(expense.date)}
          </span>
        </div>
        
        {/* Secondary description if merchant exists */}
        {hasSecondaryText && (
          <p className="text-xs text-muted-foreground/70 mt-0.5 truncate italic">
            {expense.description}
          </p>
        )}
      </div>

      {/* Amount & Delete */}
      <div className="flex items-center gap-2 shrink-0">
        <p className={cn(
          "font-mono font-bold text-sm text-right min-w-[70px]",
          expense.type === 'expense' ? 'text-destructive' : 
          expense.type === 'transfer' ? 'text-muted-foreground' : 'text-income'
        )}>
          {expense.type === 'expense' ? '-' : expense.type === 'transfer' ? '↔' : '+'}{formatAmount(Number(expense.amount))}
        </p>
        
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(expense.id);
          }}
          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
};
