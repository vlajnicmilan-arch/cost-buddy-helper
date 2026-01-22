import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IncomeSource } from '@/types/incomeSource';
import { Expense, getCategoryInfo, getPaymentSourceInfo } from '@/types/expense';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { Pencil, Link2, CircleDashed, Check, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';

interface UnassignedIncomeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expenses: Expense[];
  incomeSources: IncomeSource[];
  onUpdateExpense: (expense: Expense) => Promise<void>;
  onEditTransaction: (expense: Expense) => void;
}

export const UnassignedIncomeDialog = ({
  open,
  onOpenChange,
  expenses,
  incomeSources,
  onUpdateExpense,
  onEditTransaction
}: UnassignedIncomeDialogProps) => {
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<string>('');
  const [saving, setSaving] = useState(false);

  // Unassigned income transactions
  const unassignedIncome = useMemo(() => {
    return expenses
      .filter(e => e.type === 'income' && !e.income_source_id)
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [expenses]);

  const totalUnassigned = useMemo(() => 
    unassignedIncome.reduce((sum, e) => sum + e.amount, 0), 
    [unassignedIncome]
  );

  const formatAmount = (value: number) => {
    return new Intl.NumberFormat('hr-HR', {
      style: 'currency',
      currency: 'EUR',
    }).format(value);
  };

  const handleStartAssign = (expenseId: string) => {
    setAssigningId(expenseId);
    setSelectedSourceId('');
  };

  const handleCancelAssign = () => {
    setAssigningId(null);
    setSelectedSourceId('');
  };

  const handleConfirmAssign = async (expense: Expense) => {
    if (!selectedSourceId) {
      toast.error('Odaberi izvor prihoda');
      return;
    }

    setSaving(true);
    try {
      await onUpdateExpense({
        ...expense,
        income_source_id: selectedSourceId
      });
      
      const sourceName = incomeSources.find(s => s.id === selectedSourceId)?.name;
      toast.success(`Prihod dodijeljen izvoru "${sourceName}"`);
      setAssigningId(null);
      setSelectedSourceId('');
    } catch (error) {
      toast.error('Greška pri dodjeljivanju');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <CircleDashed className="w-5 h-5 text-muted-foreground" />
            Prihodi bez izvora
          </DialogTitle>
        </DialogHeader>

        {/* Summary */}
        <div className="p-4 rounded-xl bg-muted/50 border border-dashed shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Nedodijeljeni prihodi</p>
              <p className="text-sm text-muted-foreground">
                {unassignedIncome.length} {unassignedIncome.length === 1 ? 'prihod' : 'prihoda'} čeka dodjelu
              </p>
            </div>
            <p className="font-mono font-semibold text-lg text-income">
              +{formatAmount(totalUnassigned)}
            </p>
          </div>
        </div>

        {/* Info about assigning */}
        {incomeSources.length > 0 && unassignedIncome.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 text-sm text-muted-foreground shrink-0">
            <Link2 className="w-4 h-4 shrink-0" />
            <span>Klikni na ikonu veze da dodijeliš prihod izvoru</span>
          </div>
        )}

        {/* Transaction List */}
        <ScrollArea className="flex-1 -mx-6 px-6">
          {unassignedIncome.length === 0 ? (
            <div className="py-12 text-center">
              <Check className="w-12 h-12 mx-auto text-income/30 mb-3" />
              <p className="text-muted-foreground">Svi prihodi su dodijeljeni!</p>
              <p className="text-sm text-muted-foreground mt-1">
                Nema prihoda bez izvora
              </p>
            </div>
          ) : incomeSources.length === 0 ? (
            <div className="py-12 text-center">
              <CircleDashed className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">Nema definiranih izvora</p>
              <p className="text-sm text-muted-foreground mt-1">
                Kreiraj izvor prihoda da bi mogao dodijeliti prihode
              </p>
            </div>
          ) : (
            <div className="space-y-2 py-2">
              <AnimatePresence>
                {unassignedIncome.map((expense) => {
                  const categoryInfo = getCategoryInfo(expense.category);
                  const paymentInfo = getPaymentSourceInfo(expense.payment_source || 'cash');
                  const isAssigning = assigningId === expense.id;
                  
                  return (
                    <motion.div
                      key={expense.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      layout
                      className="p-3 rounded-xl bg-muted/50 hover:bg-muted/80 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {/* Icon */}
                        <div className="w-10 h-10 rounded-lg bg-background flex items-center justify-center text-lg shrink-0">
                          {categoryInfo.icon}
                        </div>

                        {/* Details */}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{expense.description}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{format(expense.date, 'dd.MM.yyyy', { locale: hr })}</span>
                            <span>•</span>
                            <span>{paymentInfo.icon} {paymentInfo.name}</span>
                          </div>
                        </div>

                        {/* Amount */}
                        <p className="font-mono font-semibold whitespace-nowrap text-income shrink-0">
                          +{formatAmount(expense.amount)}
                        </p>

                        {/* Actions */}
                        {!isAssigning && (
                          <div className="flex gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Dodijeli izvoru"
                              onClick={() => handleStartAssign(expense.id)}
                            >
                              <Link2 className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Uredi"
                              onClick={() => onEditTransaction(expense)}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                      </div>

                      {/* Assignment UI */}
                      {isAssigning && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-3 pt-3 border-t flex items-center gap-2"
                        >
                          <Select
                            value={selectedSourceId}
                            onValueChange={setSelectedSourceId}
                          >
                            <SelectTrigger className="flex-1">
                              <SelectValue placeholder="Odaberi izvor..." />
                            </SelectTrigger>
                            <SelectContent>
                              {incomeSources.map((source) => (
                                <SelectItem key={source.id} value={source.id}>
                                  <div className="flex items-center gap-2">
                                    <span>{source.icon}</span>
                                    <span>{source.name}</span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-9 w-9 text-destructive hover:text-destructive shrink-0"
                            onClick={handleCancelAssign}
                            disabled={saving}
                          >
                            <X className="w-4 h-4" />
                          </Button>

                          <Button
                            size="icon"
                            className="h-9 w-9 shrink-0"
                            onClick={() => handleConfirmAssign(expense)}
                            disabled={!selectedSourceId || saving}
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                        </motion.div>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
