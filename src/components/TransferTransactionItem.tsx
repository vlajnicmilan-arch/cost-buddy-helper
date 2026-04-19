import React, { useMemo, useRef } from 'react';
import { motion, useMotionValue, useTransform, useAnimation, PanInfo } from 'framer-motion';
import { ArrowRight, ArrowLeftRight, Trash2, MessageCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import { useHaptics } from '@/hooks/useHaptics';
import { cn } from '@/lib/utils';
import { Expense } from '@/types/expense';
import { resolveTransferEndpoints, TransferEndpointInfo } from '@/lib/transferMatching';
import { TransactionContextLookup } from '@/components/TransactionItem';

interface TransferTransactionItemProps {
  expense: Expense;
  onDelete: (id: string) => void;
  onClick?: (expense: Expense) => void;
  contextLookup?: TransactionContextLookup;
}

const SWIPE_THRESHOLD = -72;
const DELETE_ZONE = -120;

const EndpointPill = ({ info }: { info: TransferEndpointInfo }) => {
  const isEmoji = !info.color; // standard payment sources don't carry a color
  return (
    <span className="inline-flex items-center gap-1 max-w-[110px] min-w-0">
      <span
        className={cn(
          'shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px]',
          isEmoji ? 'bg-muted' : ''
        )}
        style={!isEmoji ? { backgroundColor: info.color, color: 'white' } : undefined}
      >
        {info.icon}
      </span>
      <span className="truncate text-foreground/90 font-medium">{info.name}</span>
      {info.cardLast4 && (
        <span className="font-mono text-muted-foreground/70 text-[10px] shrink-0">
          ••{info.cardLast4}
        </span>
      )}
    </span>
  );
};

const TransferTransactionItemInner = ({
  expense,
  onDelete,
  onClick,
  contextLookup,
}: TransferTransactionItemProps) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const { mediumTap } = useHaptics();
  const hookSources = useCustomPaymentSources();
  const customSources = contextLookup?.customPaymentSources ?? hookSources.customPaymentSources;

  const transfer = useMemo(
    () => resolveTransferEndpoints(expense, customSources as any),
    [expense, customSources]
  );

  const x = useMotionValue(0);
  const controls = useAnimation();
  const isDraggingRef = useRef(false);
  const deleteOpacity = useTransform(x, [0, SWIPE_THRESHOLD], [0, 1]);
  const deleteScale = useTransform(x, [0, SWIPE_THRESHOLD], [0.7, 1]);
  const itemOpacity = useTransform(x, [DELETE_ZONE, SWIPE_THRESHOLD, 0], [0.3, 0.85, 1]);

  const formatDate = (date: Date) =>
    new Intl.DateTimeFormat('hr-HR', { day: 'numeric', month: 'short' }).format(date);

  const handleDragStart = () => {
    isDraggingRef.current = true;
  };

  const handleDragEnd = async (_: unknown, _info: PanInfo) => {
    const currentX = x.get();
    if (currentX < DELETE_ZONE) {
      await controls.start({ x: -400, opacity: 0, transition: { duration: 0.25 } });
      onDelete(expense.id);
    } else if (currentX < SWIPE_THRESHOLD) {
      controls.start({ x: SWIPE_THRESHOLD, transition: { type: 'spring', stiffness: 400, damping: 30 } });
    } else {
      controls.start({ x: 0, transition: { type: 'spring', stiffness: 400, damping: 30 } });
    }
    setTimeout(() => {
      isDraggingRef.current = false;
    }, 50);
  };

  const handleClick = () => {
    if (isDraggingRef.current) return;
    if (x.get() < -10) {
      controls.start({ x: 0, transition: { type: 'spring', stiffness: 400, damping: 30 } });
      return;
    }
    onClick?.(expense);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    mediumTap();
    onDelete(expense.id);
  };

  if (!transfer) return null;

  const title =
    expense.description && expense.description.trim() && expense.description !== 'Prijenos'
      ? expense.description
      : t('transactions.transferTitle', 'Prijenos između računa');

  return (
    <div className="relative overflow-hidden rounded-lg">
      {/* Delete background */}
      <motion.div
        className="absolute inset-y-0 right-0 flex items-center justify-center w-20 bg-destructive rounded-lg"
        style={{ opacity: deleteOpacity, scale: deleteScale }}
      >
        <Trash2 className="w-5 h-5 text-destructive-foreground" />
      </motion.div>

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
          'group flex items-center gap-2 py-2.5 px-2 rounded-lg bg-background hover:bg-muted/50 transition-colors touch-pan-y',
          onClick && 'cursor-pointer'
        )}
      >
        {/* Transfer icon */}
        <div className="w-8 h-8 rounded-md flex items-center justify-center text-base shrink-0 bg-primary/15 text-primary">
          <ArrowLeftRight className="w-4 h-4" />
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0 mr-2">
          {/* Title */}
          <div className="flex items-center gap-1.5">
            <p className="font-medium text-foreground truncate text-sm leading-tight">{title}</p>
            {expense.note && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <MessageCircle className="w-3 h-3 text-primary shrink-0" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="text-sm">{expense.note}</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          {/* From → To row */}
          <div className="flex items-center gap-1 mt-0.5 text-[11px] text-muted-foreground leading-tight min-w-0">
            <EndpointPill info={transfer.from} />
            <ArrowRight className="w-3 h-3 text-primary shrink-0" />
            <EndpointPill info={transfer.to} />
          </div>
        </div>

        {/* Amount & Date */}
        <div className="flex flex-col items-end shrink-0 gap-0.5">
          <p className="font-mono font-bold text-base leading-tight text-muted-foreground">
            ↔{formatAmount(Number(expense.amount), expense.currency as any)}
          </p>
          <span className="text-[10px] text-muted-foreground/70">{formatDate(expense.date)}</span>
        </div>

        {/* Desktop hover delete */}
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

export const TransferTransactionItem = React.memo(TransferTransactionItemInner, (prev, next) => {
  return (
    prev.expense.id === next.expense.id &&
    prev.expense.amount === next.expense.amount &&
    prev.expense.description === next.expense.description &&
    prev.expense.payment_source === next.expense.payment_source &&
    prev.expense.payment_source_card_id === next.expense.payment_source_card_id &&
    prev.expense.income_source_id === next.expense.income_source_id &&
    prev.expense.note === next.expense.note &&
    prev.expense.currency === next.expense.currency &&
    prev.expense.date.getTime() === next.expense.date.getTime() &&
    prev.contextLookup === next.contextLookup &&
    prev.onDelete === next.onDelete &&
    prev.onClick === next.onClick
  );
});
