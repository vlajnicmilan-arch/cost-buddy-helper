import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IncomeSource } from '@/types/incomeSource';
import { Expense, getCategoryInfo } from '@/types/expense';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { Pencil, Link2, CircleDashed, Check, X, Loader2, Plus, Trash2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { IncomeSourceDialog } from './IncomeSourceDialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

interface UnassignedIncomeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expenses: Expense[];
  incomeSources: IncomeSource[];
  onUpdateExpense: (expense: Expense) => Promise<void>;
  onEditTransaction: (expense: Expense) => void;
  onDeleteExpense: (id: string) => Promise<void>;
  onAddIncomeSource: (source: Omit<IncomeSource, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => Promise<IncomeSource | void>;
}

export const UnassignedIncomeDialog = ({
  open,
  onOpenChange,
  expenses,
  incomeSources,
  onUpdateExpense,
  onEditTransaction,
  onDeleteExpense,
  onAddIncomeSource
}: UnassignedIncomeDialogProps) => {
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [showNewSourceDialog, setShowNewSourceDialog] = useState(false);
  const [pendingExpenseForNewSource, setPendingExpenseForNewSource] = useState<Expense | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteClick = (e: React.MouseEvent, expense: Expense) => {
    e.stopPropagation();
    setExpenseToDelete(expense);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!expenseToDelete) return;
    setDeleting(true);
    try {
      await onDeleteExpense(expenseToDelete.id);
      toast.success('Transakcija obrisana');
    } catch (error) {
      toast.error('Greška pri brisanju');
    } finally {
      setDeleting(false);
      setDeleteConfirmOpen(false);
      setExpenseToDelete(null);
    }
  };

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

  const handleCreateNewSource = (expense: Expense) => {
    setPendingExpenseForNewSource(expense);
    setShowNewSourceDialog(true);
  };

  const handleNewSourceSave = async (source: Omit<IncomeSource, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
    await onAddIncomeSource(source);
    setShowNewSourceDialog(false);
    // Note: The expense will need to be assigned manually after the source is created
    // since we don't have the new source ID until the parent refreshes
    if (pendingExpenseForNewSource) {
      toast.info('Izvor kreiran! Klikni na transakciju da je dodijeliš novom izvoru.');
      setPendingExpenseForNewSource(null);
      setAssigningId(null);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] max-w-[420px] h-[80vh] max-h-[600px] flex flex-col gap-3 p-4 overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base">
              <CircleDashed className="w-4 h-4 text-muted-foreground" />
              Prihodi bez izvora
            </DialogTitle>
          </DialogHeader>

          {/* Summary */}
          <div className="p-3 rounded-lg bg-muted/50 border border-dashed shrink-0">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-sm">Nedodijeljeni prihodi</p>
                <p className="text-xs text-muted-foreground">
                  {unassignedIncome.length} {unassignedIncome.length === 1 ? 'prihod' : 'prihoda'}
                </p>
              </div>
              <p className="font-mono font-semibold text-income shrink-0">
                +{formatAmount(totalUnassigned)}
              </p>
            </div>
          </div>

          {/* Bulk Actions */}
          {incomeSources.length > 0 && unassignedIncome.length > 0 && (
            <div className="flex gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-xs h-8"
                onClick={handleAutoAssign}
                disabled={autoAssigning}
              >
                {autoAssigning ? (
                  <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                ) : (
                  <Link2 className="w-3 h-3 mr-1.5" />
                )}
                Auto
              </Button>
              <Select onValueChange={handleAssignAll} disabled={autoAssigning}>
                <SelectTrigger className="flex-1 bg-background text-xs h-8">
                  <SelectValue placeholder="Sve u..." />
                </SelectTrigger>
                <SelectContent className="bg-popover z-[200]">
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
          )}

          {/* Transaction List */}
          <div className="flex-1 min-h-0 overflow-y-auto -mx-4 px-4">
            <div className="space-y-2 pb-4">
              {unassignedIncome.length === 0 ? (
                <div className="py-8 text-center">
                  <Check className="w-10 h-10 mx-auto text-income/30 mb-2" />
                  <p className="text-sm text-muted-foreground">Svi prihodi su dodijeljeni!</p>
                </div>
              ) : incomeSources.length === 0 ? (
                <div className="py-8 text-center">
                  <CircleDashed className="w-10 h-10 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">Nema definiranih izvora</p>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="mt-3"
                    onClick={() => setShowNewSourceDialog(true)}
                  >
                    <Plus className="w-3 h-3 mr-1.5" />
                    Kreiraj novi izvor
                  </Button>
                </div>
              ) : (
                unassignedIncome.map((expense) => {
                  const categoryInfo = getCategoryInfo(expense.category);
                  const isAssigning = assigningId === expense.id;
                  
                  return (
                    <div
                      key={expense.id}
                      className={`p-3 rounded-lg transition-colors ${
                        isAssigning 
                          ? 'bg-primary/10 border border-primary/30' 
                          : 'bg-muted/50 hover:bg-muted/80 cursor-pointer'
                      }`}
                      onClick={() => {
                        if (!isAssigning) {
                          handleStartAssign(expense.id);
                        }
                      }}
                    >
                      {/* Transaction Row */}
                      <div className="flex items-start gap-2">
                        <div className="w-8 h-8 rounded-md bg-background flex items-center justify-center text-base shrink-0">
                          {categoryInfo.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-medium text-sm leading-tight line-clamp-2">{expense.description}</p>
                            <p className="font-mono text-sm font-semibold text-income shrink-0 whitespace-nowrap">
                              +{formatAmount(expense.amount)}
                            </p>
                          </div>
                          <div className="flex items-center justify-between mt-1 gap-1">
                            <p className="text-xs text-muted-foreground">
                              {format(expense.date, 'dd.MM.yyyy', { locale: hr })}
                            </p>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onEditTransaction(expense);
                                }}
                              >
                                <Pencil className="w-3 h-3 mr-1" />
                                Uredi
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={(e) => handleDeleteClick(e, expense)}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Assignment UI */}
                      {isAssigning && (
                        <div className="mt-3 pt-3 border-t border-primary/20">
                          <p className="text-xs text-muted-foreground mb-2">Dodijeli izvoru:</p>
                          <div className="flex flex-wrap gap-1.5">
                            {incomeSources.map((source) => (
                              <Button
                                key={source.id}
                                variant="outline"
                                size="sm"
                                className="gap-1 h-7 text-xs px-2"
                                disabled={saving}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSaving(true);
                                  onUpdateExpense({
                                    ...expense,
                                    income_source_id: source.id
                                  }).then(() => {
                                    toast.success(`Dodijeljeno izvoru "${source.name}"`);
                                    setAssigningId(null);
                                  }).catch(() => {
                                    toast.error('Greška pri dodjeljivanju');
                                  }).finally(() => {
                                    setSaving(false);
                                  });
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
                              variant="outline"
                              size="sm"
                              className="gap-1 h-7 text-xs px-2 border-dashed"
                              disabled={saving}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCreateNewSource(expense);
                              }}
                            >
                              <Plus className="w-3 h-3" />
                              Novi
                            </Button>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="mt-2 w-full h-7 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCancelAssign();
                            }}
                            disabled={saving}
                          >
                            <X className="w-3 h-3 mr-1" />
                            Odustani
                          </Button>
                        </div>
                      )}

                      {/* Hint */}
                      {!isAssigning && (
                        <p className="text-[10px] text-muted-foreground mt-2 text-center opacity-50">
                          Klikni za dodjelu
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* New Source Dialog */}
      <IncomeSourceDialog
        open={showNewSourceDialog}
        onOpenChange={setShowNewSourceDialog}
        onSave={handleNewSourceSave}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent className="max-w-[90vw] w-[340px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Obriši transakciju?</AlertDialogTitle>
            <AlertDialogDescription>
              {expenseToDelete && (
                <span>
                  "{expenseToDelete.description}" - {formatAmount(expenseToDelete.amount)}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Odustani</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDelete} 
              className="bg-destructive text-destructive-foreground"
              disabled={deleting}
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Obriši'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};