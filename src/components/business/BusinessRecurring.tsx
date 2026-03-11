import { useState, useEffect } from 'react';
import { Plus, Calendar, Pause, Play, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { RecurringTransactionDialog } from '@/components/recurring/RecurringTransactionDialog';

interface RecurringTx {
  id: string;
  description: string;
  amount: number;
  type: string;
  frequency: string;
  next_due_date: string;
  is_active: boolean;
  category: string;
}

export const BusinessRecurring = () => {
  const { formatAmount } = useCurrency();
  const { user } = useAuth();
  const [items, setItems] = useState<RecurringTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  const fetchItems = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('recurring_transactions')
      .select('id, description, amount, type, frequency, next_due_date, is_active, category')
      .eq('user_id', user.id)
      .order('next_due_date', { ascending: true });
    setItems(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchItems(); }, [user]);

  const toggleActive = async (id: string, active: boolean) => {
    await supabase.from('recurring_transactions').update({ is_active: !active }).eq('id', id);
    fetchItems();
  };

  const deleteItem = async (id: string) => {
    await supabase.from('recurring_transactions').delete().eq('id', id);
    toast.success('Obrisano');
    fetchItems();
  };

  const freqLabel: Record<string, string> = {
    daily: 'Dnevno',
    weekly: 'Tjedno',
    monthly: 'Mjesečno',
    yearly: 'Godišnje',
  };

  const active = items.filter(i => i.is_active);
  const paused = items.filter(i => !i.is_active);

  const monthlyTotal = active.reduce((sum, i) => {
    const factor = i.frequency === 'daily' ? 30 : i.frequency === 'weekly' ? 4.33 : i.frequency === 'yearly' ? 1 / 12 : 1;
    return sum + (i.type === 'expense' ? i.amount * factor : 0);
  }, 0);

  return (
    <div className="space-y-4">
      {/* Monthly obligation estimate */}
      <Card className="border-none shadow-sm">
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-muted-foreground">Mjesečne obveze (procjena)</p>
              <p className="text-lg font-bold text-expense">{formatAmount(monthlyTotal)}</p>
            </div>
            <Button size="sm" className="h-8 gap-1 text-xs" onClick={() => setAddOpen(true)}>
              <Plus className="w-3 h-3" />
              Novo
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Active */}
      {active.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground px-1">Aktivne ({active.length})</p>
          {active.map(item => (
            <Card key={item.id} className="border-none shadow-sm">
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.description}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted-foreground">{freqLabel[item.frequency] || item.frequency}</span>
                      <span className="text-[10px] text-muted-foreground">
                        Sljedeće: {format(new Date(item.next_due_date), 'dd.MM.yyyy')}
                      </span>
                    </div>
                  </div>
                  <span className={`text-sm font-bold ${item.type === 'income' ? 'text-income' : 'text-expense'}`}>
                    {formatAmount(item.amount)}
                  </span>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toggleActive(item.id, true)}>
                    <Pause className="w-3.5 h-3.5 text-muted-foreground" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteItem(item.id)}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Paused */}
      {paused.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground px-1">Pauzirane ({paused.length})</p>
          {paused.map(item => (
            <div key={item.id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 opacity-60">
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{item.description}</p>
              </div>
              <span className="text-xs text-muted-foreground">{formatAmount(item.amount)}</span>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toggleActive(item.id, false)}>
                <Play className="w-3.5 h-3.5 text-income" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteItem(item.id)}>
                <Trash2 className="w-3 h-3 text-destructive/50" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {items.length === 0 && !loading && (
        <div className="text-center py-8">
          <Calendar className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">Nema ponavljajućih obveza</p>
        </div>
      )}

      <RecurringTransactionDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSave={() => { setAddOpen(false); fetchItems(); }}
      />
    </div>
  );
};
