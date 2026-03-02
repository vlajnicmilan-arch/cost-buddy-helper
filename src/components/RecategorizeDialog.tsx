import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { Expense, getCategoryInfo, CATEGORIES, Category } from '@/types/expense';
import { useCustomCategories } from '@/hooks/useCustomCategories';
import { useCurrency } from '@/contexts/CurrencyContext';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { Sparkles, Loader2, Check, X, ArrowRight, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { ScrollArea } from '@/components/ui/scroll-area';

interface RecategorizeDialogProps {
  expenses: Expense[];
  onUpdateExpenses: (expenses: Expense[]) => Promise<void>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface RecategorizeSuggestion {
  expense: Expense;
  items: { name: string }[];
  oldCategory: string;
  newCategory: string;
  accepted: boolean;
}

export const RecategorizeDialog = ({ expenses, onUpdateExpenses, open, onOpenChange }: RecategorizeDialogProps) => {
  const [phase, setPhase] = useState<'idle' | 'scanning' | 'review' | 'applying'>('idle');
  const [suggestions, setSuggestions] = useState<RecategorizeSuggestion[]>([]);
  const [progress, setProgress] = useState(0);
  const [totalToScan, setTotalToScan] = useState(0);
  const [scanned, setScanned] = useState(0);
  const { customCategories } = useCustomCategories();
  const { formatAmount } = useCurrency();

  const getCategoryDisplay = (categoryId: string) => {
    const systemCat = CATEGORIES.find(c => c.id === categoryId);
    if (systemCat) return { name: systemCat.name, icon: systemCat.icon };
    const customCat = customCategories.find(c => c.id === categoryId || c.name === categoryId);
    if (customCat) return { name: customCat.name, icon: customCat.icon };
    return { name: categoryId, icon: '📦' };
  };

  const startScanning = async () => {
    setPhase('scanning');
    setSuggestions([]);
    setProgress(0);
    setScanned(0);

    // Get all expense IDs that have receipt items
    const expenseIds = expenses.filter(e => e.type !== 'transfer').map(e => e.id);
    
    const { data: itemsData, error } = await supabase
      .from('receipt_items')
      .select('expense_id, name')
      .in('expense_id', expenseIds.length > 0 ? expenseIds : ['none']);

    if (error || !itemsData || itemsData.length === 0) {
      toast.error('Nema transakcija s artiklima za analizu');
      setPhase('idle');
      return;
    }

    // Group items by expense_id
    const itemsByExpense = new Map<string, { name: string }[]>();
    itemsData.forEach(item => {
      const list = itemsByExpense.get(item.expense_id) || [];
      list.push({ name: item.name });
      itemsByExpense.set(item.expense_id, list);
    });

    const expensesWithItems = expenses.filter(e => itemsByExpense.has(e.id));
    setTotalToScan(expensesWithItems.length);

    const newSuggestions: RecategorizeSuggestion[] = [];
    const customCatNames = customCategories.map(c => c.name);

    for (let i = 0; i < expensesWithItems.length; i++) {
      const expense = expensesWithItems[i];
      const items = itemsByExpense.get(expense.id) || [];

      try {
        const { data, error: fnError } = await supabase.functions.invoke('categorize-transaction', {
          body: {
            description: expense.description,
            merchant_name: expense.merchant_name || '',
            custom_categories: customCatNames,
            items: items,
          },
        });

        if (!fnError && data?.category && data.category !== expense.category) {
          newSuggestions.push({
            expense,
            items,
            oldCategory: expense.category,
            newCategory: data.category,
            accepted: true,
          });
        }
      } catch (err) {
        console.error('Recategorize error for', expense.id, err);
      }

      setScanned(i + 1);
      setProgress(((i + 1) / expensesWithItems.length) * 100);

      // Small delay to avoid rate limiting
      if (i < expensesWithItems.length - 1) {
        await new Promise(r => setTimeout(r, 300));
      }
    }

    setSuggestions(newSuggestions);
    setPhase('review');

    if (newSuggestions.length === 0) {
      toast.info('Sve transakcije su već ispravno kategorizirane! ✅');
    }
  };

  const toggleSuggestion = (index: number) => {
    setSuggestions(prev => prev.map((s, i) => i === index ? { ...s, accepted: !s.accepted } : s));
  };

  const toggleAll = () => {
    const allAccepted = suggestions.every(s => s.accepted);
    setSuggestions(prev => prev.map(s => ({ ...s, accepted: !allAccepted })));
  };

  const applySuggestions = async () => {
    const toApply = suggestions.filter(s => s.accepted);
    if (toApply.length === 0) {
      toast.error('Nema odabranih prijedloga');
      return;
    }

    setPhase('applying');
    try {
      const updatedExpenses = toApply.map(s => ({
        ...s.expense,
        category: s.newCategory as Category,
        updated_at: new Date().toISOString(),
      }));

      await onUpdateExpenses(updatedExpenses);
      toast.success(`Rekategorizirano ${toApply.length} transakcija! ✨`);
      handleClose();
    } catch (error) {
      toast.error('Greška pri ažuriranju');
      setPhase('review');
    }
  };

  const handleClose = () => {
    setPhase('idle');
    setSuggestions([]);
    setProgress(0);
    setScanned(0);
    setTotalToScan(0);
    onOpenChange(false);
  };

  const acceptedCount = suggestions.filter(s => s.accepted).length;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => isOpen ? onOpenChange(true) : handleClose()}>
      <DialogContent showBackButton={false} className="sm:max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        <div className="p-6 pb-2">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              AI Rekategorizacija po artiklima
            </DialogTitle>
          </DialogHeader>
        </div>

        {phase === 'idle' && (
          <div className="flex-1 p-6 pt-2 space-y-4">
            <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
              <p className="text-sm text-foreground">
                Ova funkcija prolazi kroz sve transakcije koje imaju skenirane artikle i predlaže preciznije kategorije na temelju AI analize.
              </p>
              <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                <li>Analizira nazive artikala umjesto generičnog opisa</li>
                <li>Predlaže promjene koje možeš prihvatiti ili odbiti</li>
                <li>Neće mijenjati transakcije bez artikala</li>
              </ul>
            </div>
            <Button onClick={startScanning} className="w-full gap-2" size="lg">
              <Sparkles className="w-4 h-4" />
              Pokreni analizu
            </Button>
          </div>
        )}

        {phase === 'scanning' && (
          <div className="flex-1 p-6 pt-2 space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Analiziram transakcije...</span>
                <span className="font-medium">{scanned} / {totalToScan}</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          </div>
        )}

        {phase === 'review' && (
          <>
            <div className="flex-1 overflow-hidden px-6">
              {suggestions.length === 0 ? (
                <div className="py-12 text-center space-y-2">
                  <Check className="w-12 h-12 mx-auto text-green-500" />
                  <p className="text-foreground font-medium">Sve kategorije su točne!</p>
                  <p className="text-sm text-muted-foreground">AI nije pronašao transakcije kojima treba promijeniti kategoriju.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Pronađeno <span className="font-medium text-foreground">{suggestions.length}</span> prijedloga
                    </p>
                    <Button variant="ghost" size="sm" onClick={toggleAll} className="text-xs">
                      {suggestions.every(s => s.accepted) ? 'Odznači sve' : 'Označi sve'}
                    </Button>
                  </div>
                  <ScrollArea className="h-[40vh]">
                    <div className="space-y-2 pr-2">
                      {suggestions.map((suggestion, index) => {
                        const oldCat = getCategoryDisplay(suggestion.oldCategory);
                        const newCat = getCategoryDisplay(suggestion.newCategory);
                        return (
                          <div
                            key={suggestion.expense.id}
                            className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                              suggestion.accepted ? 'bg-primary/5 border-primary/30' : 'bg-muted/20 opacity-60'
                            }`}
                            onClick={() => toggleSuggestion(index)}
                          >
                            <Checkbox
                              checked={suggestion.accepted}
                              onCheckedChange={() => toggleSuggestion(index)}
                              onClick={(e) => e.stopPropagation()}
                              className="mt-1"
                            />
                            <div className="flex-1 min-w-0 space-y-1">
                              <p className="text-sm font-medium truncate">{suggestion.expense.description}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                🛒 {suggestion.items.map(i => i.name).join(', ')}
                              </p>
                              <div className="flex items-center gap-2 text-xs">
                                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">
                                  {oldCat.icon} {oldCat.name}
                                </span>
                                <ArrowRight className="w-3 h-3 text-muted-foreground" />
                                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 dark:text-green-400">
                                  {newCat.icon} {newCat.name}
                                </span>
                              </div>
                            </div>
                            <p className="text-sm font-mono text-expense shrink-0">
                              -{formatAmount(suggestion.expense.amount)}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 p-4 border-t shrink-0 bg-background">
              {suggestions.length > 0 ? (
                <>
                  <Button variant="outline" onClick={handleClose} className="gap-2">
                    <X className="w-4 h-4" />
                    Odustani
                  </Button>
                  <Button onClick={applySuggestions} className="flex-1 gap-2" disabled={acceptedCount === 0}>
                    <Check className="w-4 h-4" />
                    Primijeni ({acceptedCount})
                  </Button>
                </>
              ) : (
                <Button onClick={handleClose} className="w-full">Zatvori</Button>
              )}
            </div>
          </>
        )}

        {phase === 'applying' && (
          <div className="flex-1 p-6 pt-2 flex items-center justify-center">
            <div className="text-center space-y-2">
              <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
              <p className="text-sm text-muted-foreground">Primjenjujem promjene...</p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
