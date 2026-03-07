import { Expense, getCategoryInfo, getPaymentSourceInfo, PAYMENT_SOURCES } from '@/types/expense';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import { useCustomCategories } from '@/hooks/useCustomCategories';
import { useCurrency } from '@/contexts/CurrencyContext';
import { cn } from '@/lib/utils';
import { Trash2, Sparkles, MessageCircle, CreditCard } from 'lucide-react';
import { motion, useMotionValue, useTransform, useAnimation, PanInfo } from 'framer-motion';
import { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';

export interface TransactionContextLookup {
  budgets?: { id: string; name: string; icon?: string | null; color?: string | null }[];
  projects?: { id: string; name: string; icon?: string | null; color?: string | null }[];
}

interface TransactionItemProps {
  expense: Expense;
  onDelete: (id: string) => void;
  onClick?: (expense: Expense) => void;
  contextLookup?: TransactionContextLookup;
}

const SWIPE_THRESHOLD = -72;
const DELETE_ZONE = -120;

export const TransactionItem = ({ expense, onDelete, onClick, contextLookup }: TransactionItemProps) => {
  const { customPaymentSources } = useCustomPaymentSources();
  const { customCategories } = useCustomCategories();
  const { formatAmount } = useCurrency();
  const { t } = useTranslation();

  // Resolve category: check custom categories first, then system ones
  const category = useMemo(() => {
    const custom = customCategories.find(c => c.id === expense.category || c.name === expense.category);
    if (custom) {
      return { id: custom.id, name: custom.name, icon: custom.icon, color: custom.color, isCustom: true };
    }
    return { ...getCategoryInfo(expense.category), isCustom: false };
  }, [expense.category, customCategories]);

  const paymentSource = getPaymentSourceInfo(expense.payment_source || 'cash');

  // Detect installment info from note (e.g. "6x rata" or "12x rata • some note")
  const installmentMatch = expense.note?.match(/^(\d+)x rata/);
  const installmentLabel = installmentMatch ? `${installmentMatch[1]}x` : null;

  // Resolve budget/project context badges
  const budgetInfo = useMemo(() => {
    if (!expense.budget_id || !contextLookup?.budgets) return null;
    return contextLookup.budgets.find(b => b.id === expense.budget_id) || null;
  }, [expense.budget_id, contextLookup?.budgets]);

  const projectInfo = useMemo(() => {
    if (!expense.project_id || !contextLookup?.projects) return null;
    return contextLookup.projects.find(p => p.id === expense.project_id) || null;
  }, [expense.project_id, contextLookup?.projects]);

  const x = useMotionValue(0);
  const controls = useAnimation();
  const isDraggingRef = useRef(false);

  // Delete button reveals from behind — opacity and scale based on swipe distance
  const deleteOpacity = useTransform(x, [0, SWIPE_THRESHOLD], [0, 1]);
  const deleteScale = useTransform(x, [0, SWIPE_THRESHOLD], [0.7, 1]);

  // Card dims slightly while swiping
  const itemOpacity = useTransform(x, [DELETE_ZONE, SWIPE_THRESHOLD, 0], [0.3, 0.85, 1]);

  const cardInfo = useMemo(() => {
    if (!expense.payment_source_card_id) return null;
    for (const source of customPaymentSources) {
      const card = source.cards?.find(c => c.id === expense.payment_source_card_id);
      if (card) return card;
    }
    return null;
  }, [expense.payment_source_card_id, customPaymentSources]);

  const customSource = useMemo(() => {
    const sourceId = expense.payment_source;
    if (!sourceId) return null;
    let source = customPaymentSources.find(s => s.id === sourceId);
    if (source) return source;
    if (sourceId.startsWith('custom:')) {
      const uuid = sourceId.replace('custom:', '');
      source = customPaymentSources.find(s => s.id === uuid);
      if (source) return source;
    }
    return null;
  }, [expense.payment_source, customPaymentSources]);

  const isStandardSource = useMemo(() => {
    const sourceId = expense.payment_source;
    if (!sourceId) return false;
    return PAYMENT_SOURCES.some(s => s.id === sourceId);
  }, [expense.payment_source]);

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('hr-HR', {
      day: 'numeric',
      month: 'short',
    }).format(date);
  };

  const handleDragStart = () => {
    isDraggingRef.current = true;
  };

  const handleDragEnd = async (_: unknown, info: PanInfo) => {
    const currentX = x.get();

    if (currentX < DELETE_ZONE) {
      // Swiped far enough — delete
      await controls.start({ x: -400, opacity: 0, transition: { duration: 0.25 } });
      onDelete(expense.id);
    } else if (currentX < SWIPE_THRESHOLD) {
      // Snap to reveal delete button
      controls.start({ x: SWIPE_THRESHOLD, transition: { type: 'spring', stiffness: 400, damping: 30 } });
    } else {
      // Snap back
      controls.start({ x: 0, transition: { type: 'spring', stiffness: 400, damping: 30 } });
    }

    setTimeout(() => { isDraggingRef.current = false; }, 50);
  };

  const handleClick = () => {
    if (isDraggingRef.current) return;
    // If swiped open, close on tap instead of opening detail
    if (x.get() < -10) {
      controls.start({ x: 0, transition: { type: 'spring', stiffness: 400, damping: 30 } });
      return;
    }
    onClick?.(expense);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(expense.id);
  };

  return (
    <div className="relative overflow-hidden rounded-lg">
      {/* Delete background — revealed on swipe */}
      <motion.div
        className="absolute inset-y-0 right-0 flex items-center justify-center w-20 bg-destructive rounded-lg"
        style={{ opacity: deleteOpacity, scale: deleteScale }}
      >
        <Trash2 className="w-5 h-5 text-destructive-foreground" />
      </motion.div>

      {/* Swipeable card */}
      <motion.div
        drag="x"
        dragConstraints={{ left: DELETE_ZONE - 20, right: 0 }}
        dragElastic={{ left: 0.15, right: 0 }}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        animate={controls}
        style={{ x, opacity: itemOpacity }}
        onClick={handleClick}
        className={cn(
          "group flex items-center gap-2 py-2.5 px-2 rounded-lg bg-background hover:bg-muted/50 transition-colors touch-pan-y",
          onClick && "cursor-pointer"
        )}
      >
        {/* Category Icon */}
        <div
          className="w-8 h-8 rounded-md flex items-center justify-center text-base shrink-0"
          style={{ backgroundColor: (category as any).isCustom ? `${category.color}20` : `hsl(var(--${category.color}) / 0.15)` }}
        >
          {category.icon}
        </div>

        {/* Main Content */}
        <div className="flex-1 min-w-0 mr-2">
          {/* Title Row */}
          <div className="flex items-center gap-1.5">
            <p className="font-medium text-foreground truncate text-sm leading-tight">
              {expense.merchant_name || expense.description}
            </p>
            {expense.expense_nature && (expense.project_id || expense.budget_id) && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className={cn(
                    "w-2 h-2 rounded-full shrink-0",
                    expense.expense_nature === 'regular' ? "bg-income" : "bg-destructive"
                  )} />
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">
                    {expense.expense_nature === 'regular'
                      ? t('transactions.regular', 'Redovan')
                      : t('transactions.extraordinary', 'Vanredan')}
                  </p>
                </TooltipContent>
              </Tooltip>
            )}
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
            {installmentLabel && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-0.5 px-1 py-0 rounded bg-primary/15 text-primary text-[9px] font-semibold shrink-0">
                    <CreditCard className="w-2.5 h-2.5" />
                    {installmentLabel}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">{t('installments.payInInstallments', 'Plaćanje na rate')}</p>
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

          {/* Info Row */}
          <div className="flex items-center gap-1 mt-0.5 text-[11px] text-muted-foreground leading-tight">
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
            {cardInfo && (
              <span className="text-[10px] font-mono text-muted-foreground/80">
                ••{cardInfo.last_four_digits}
              </span>
            )}
            <span className="text-muted-foreground/40">•</span>
            {expense.type === 'expense' && (
              <span className="truncate max-w-[60px]">{category.name}</span>
            )}
            {expense.type === 'transfer' && (
              <span className="text-primary">{t('transactions.transfer')}</span>
            )}
            {expense.type === 'income' && (
              <span className="text-income">{t('transactions.income', 'Prihod')}</span>
            )}
          </div>
        </div>

        {/* Amount & Date Column */}
        <div className="flex flex-col items-end shrink-0 gap-0.5">
          <p className={cn(
            "font-mono font-bold text-base leading-tight",
            expense.type === 'expense' ? 'text-expense' :
            expense.type === 'transfer' ? 'text-muted-foreground' : 'text-income'
          )}>
            {expense.type === 'expense' ? '-' : expense.type === 'transfer' ? '↔' : '+'}{formatAmount(Number(expense.amount))}
          </p>
          <div className="flex items-center gap-1">
            {installmentLabel && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0 rounded-full bg-primary/15 text-primary text-[10px] font-bold">
                <CreditCard className="w-2.5 h-2.5" />
                {installmentLabel}
              </span>
            )}
            <span className="text-[10px] text-muted-foreground/70">
              {formatDate(expense.date)}
            </span>
          </div>
        </div>

        {/* Desktop delete button — hover only, hidden on touch */}
        <button
          onClick={handleDeleteClick}
          className="hidden sm:block opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all shrink-0"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </motion.div>
    </div>
  );
};

