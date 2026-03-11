import { useMemo, useState } from 'react';
import { Expense, getCategoryInfo } from '@/types/expense';
import { useCurrency } from '@/contexts/CurrencyContext';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { FileText, TrendingUp, TrendingDown, X as XIcon, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';


interface ImportBatchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  batchId: string;
  allExpenses: Expense[];
  onDeleteBatch?: (expenseIds: string[]) => Promise<void>;
}

export const ImportBatchDialog = ({ open, onOpenChange, batchId, allExpenses, onDeleteBatch }: ImportBatchDialogProps) => {
  const { formatAmount } = useCurrency();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const batchExpenses = useMemo(() => {
    return allExpenses
      .filter(e => e.import_batch_id === batchId)
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [allExpenses, batchId]);

  const { totalIncome, totalExpenses, importDate } = useMemo(() => {
    let inc = 0, exp = 0;
    let earliest: Date | null = null;
    for (const e of batchExpenses) {
      if (e.type === 'income') inc += e.amount;
      else if (e.type === 'expense') exp += e.amount;
      const created = e.created_at ? new Date(e.created_at) : e.date;
      if (!earliest || created < earliest) earliest = created;
    }
    return { totalIncome: inc, totalExpenses: exp, importDate: earliest || new Date() };
  }, [batchExpenses]);

  

  const handleDeleteBatch = async () => {
    if (!onDeleteBatch) return;
    setDeleting(true);
    try {
      await onDeleteBatch(batchExpenses.map(e => e.id));
      onOpenChange(false);
    } finally {
      setDeleting(false);
      setConfirmOpen(false);
    }
  };

  return (
    <>
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[60] bg-background flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-background/95 backdrop-blur-sm sticky top-0 z-10">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-9 h-9 rounded-full flex items-center justify-center text-lg shrink-0 bg-destructive/15 text-destructive">
                <FileText className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <h1 className="text-base font-semibold truncate">Uvezeno izvješće</h1>
                <p className="text-xs text-muted-foreground">
                  {format(importDate, 'd. MMM yyyy', { locale: hr })} • {batchExpenses.length} transakcija
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {onDeleteBatch && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setConfirmOpen(true)} 
                  className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} className="h-8 w-8">
                <XIcon className="h-5 w-5" />
              </Button>
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="max-w-2xl mx-auto w-full px-4 py-4 space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-muted/50">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="w-3 h-3 text-primary" />
                    <p className="text-xs text-muted-foreground">Prihodi</p>
                  </div>
                  <p className="text-sm font-semibold text-primary font-mono">+{formatAmount(totalIncome)}</p>
                </div>
                <div className="p-3 rounded-xl bg-muted/50">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingDown className="w-3 h-3 text-destructive" />
                    <p className="text-xs text-muted-foreground">Rashodi</p>
                  </div>
                  <p className="text-sm font-semibold text-expense font-mono">-{formatAmount(totalExpenses)}</p>
                </div>
              </div>

              {/* Transaction list */}
              <div className="space-y-0">
                {batchExpenses.map((expense) => {
                  const categoryInfo = getCategoryInfo(expense.category);
                  return (
                    <div
                      key={expense.id}
                      className="py-2.5 px-2 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-8 h-8 rounded-md flex items-center justify-center text-base shrink-0"
                          style={{ backgroundColor: `hsl(var(--${categoryInfo.color}) / 0.15)` }}
                        >
                          {categoryInfo.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground truncate text-sm leading-tight">
                            {expense.merchant_name || expense.description}
                          </p>
                          <div className="flex items-center gap-1 mt-0.5 text-[11px] text-muted-foreground">
                            <span className="truncate max-w-[80px]">{categoryInfo.name}</span>
                            <span className="text-muted-foreground/40">•</span>
                            <span>{format(expense.date, 'd. MMM', { locale: hr })}</span>
                          </div>
                        </div>
                        <p className={cn(
                          "font-mono font-bold text-base leading-tight shrink-0",
                          expense.type === 'expense' ? 'text-expense' :
                          expense.type === 'transfer' ? 'text-muted-foreground' : 'text-income'
                        )}>
                          {expense.type === 'expense' ? '-' : '+'}{formatAmount(expense.amount)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </ScrollArea>
        </motion.div>
      )}
    </AnimatePresence>

    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Obriši cijeli uvoz?</AlertDialogTitle>
          <AlertDialogDescription>
            Ovo će trajno obrisati svih {batchExpenses.length} transakcija iz ovog uvoza. Ova radnja se ne može poništiti.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Odustani</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDeleteBatch}
            disabled={deleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleting ? 'Brisanje...' : `Obriši ${batchExpenses.length} transakcija`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
};
