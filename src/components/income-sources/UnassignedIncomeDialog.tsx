import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IncomeSource } from '@/types/incomeSource';
import { Expense, getCategoryInfo, getPaymentSourceInfo } from '@/types/expense';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { Pencil, Link2, CircleDashed, Check, X, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
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
  const [autoAssigning, setAutoAssigning] = useState(false);

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

  // Auto-assign based on description matching
  const handleAutoAssign = async () => {
    if (incomeSources.length === 0) {
      toast.error('Nema definiranih izvora prihoda');
      return;
    }

    setAutoAssigning(true);
    let assignedCount = 0;

    try {
      for (const expense of unassignedIncome) {
        const desc = expense.description.toLowerCase();
        const merchant = expense.merchant_name?.toLowerCase() || '';
        
        // Try to match with source name or description
        const matchedSource = incomeSources.find(source => {
          const sourceName = source.name.toLowerCase();
          const sourceDesc = source.description?.toLowerCase() || '';
          
          return desc.includes(sourceName) || 
                 merchant.includes(sourceName) ||
                 (sourceDesc && (desc.includes(sourceDesc) || merchant.includes(sourceDesc)));
        });

        if (matchedSource) {
          await onUpdateExpense({
            ...expense,
            income_source_id: matchedSource.id
          });
          assignedCount++;
        }
      }

      if (assignedCount > 0) {
        toast.success(`Automatski dodijeljeno ${assignedCount} prihoda`);
      } else {
        toast.info('Nije pronađeno podudaranje za automatsko dodjeljivanje');
      }
    } catch (error) {
      toast.error('Greška pri automatskom dodjeljivanju');
    } finally {
      setAutoAssigning(false);
    }
  };

  // Assign all to a single source
  const handleAssignAll = async (sourceId: string) => {
    if (!sourceId) return;

    setAutoAssigning(true);
    try {
      for (const expense of unassignedIncome) {
        await onUpdateExpense({
          ...expense,
          income_source_id: sourceId
        });
      }
      
      const sourceName = incomeSources.find(s => s.id === sourceId)?.name;
      toast.success(`Svi prihodi dodijeljeni izvoru "${sourceName}"`);
    } catch (error) {
      toast.error('Greška pri dodjeljivanju');
    } finally {
      setAutoAssigning(false);
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

        {/* Bulk Actions */}
        {incomeSources.length > 0 && unassignedIncome.length > 0 && (
          <div className="flex flex-col gap-2 shrink-0">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={handleAutoAssign}
                disabled={autoAssigning}
              >
                {autoAssigning ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Link2 className="w-4 h-4 mr-2" />
                )}
                Auto-dodijeli
              </Button>
              <Select onValueChange={handleAssignAll} disabled={autoAssigning}>
                <SelectTrigger className="flex-1 bg-background">
                  <SelectValue placeholder="Dodijeli sve..." />
                </SelectTrigger>
                <SelectContent className="bg-popover z-[100]">
                  {incomeSources.map((source) => (
                    <SelectItem key={source.id} value={source.id}>
                      <span className="flex items-center gap-2">
                        <span>{source.icon}</span>
                        <span>{source.name}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Auto-dodijeli pretražuje po imenu izvora u opisu transakcije
            </p>
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
              {unassignedIncome.map((expense) => {
                const categoryInfo = getCategoryInfo(expense.category);
                const paymentInfo = getPaymentSourceInfo(expense.payment_source || 'cash');
                const isAssigning = assigningId === expense.id;
                
                return (
                  <div
                    key={expense.id}
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
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartAssign(expense.id);
                            }}
                          >
                            <Link2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Uredi"
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditTransaction(expense);
                            }}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Assignment UI - Show source buttons */}
                    {isAssigning && (
                      <div className="mt-3 pt-3 border-t">
                        <p className="text-xs text-muted-foreground mb-2">Odaberi izvor:</p>
                        <div className="flex flex-wrap gap-2">
                          {incomeSources.map((source) => (
                            <Button
                              key={source.id}
                              variant="outline"
                              size="sm"
                              className="gap-1"
                              disabled={saving}
                              onClick={async (e) => {
                                e.stopPropagation();
                                setSaving(true);
                                try {
                                  await onUpdateExpense({
                                    ...expense,
                                    income_source_id: source.id
                                  });
                                  toast.success(`Dodijeljeno izvoru "${source.name}"`);
                                  setAssigningId(null);
                                } catch (error) {
                                  toast.error('Greška pri dodjeljivanju');
                                } finally {
                                  setSaving(false);
                                }
                              }}
                            >
                              {saving ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <span>{source.icon}</span>
                              )}
                              <span>{source.name}</span>
                            </Button>
                          ))}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCancelAssign();
                            }}
                            disabled={saving}
                          >
                            <X className="w-4 h-4" />
                            Odustani
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
