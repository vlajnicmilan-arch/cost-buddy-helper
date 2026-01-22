import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Expense, getCategoryInfo, getPaymentSourceInfo, ReceiptItem } from '@/types/expense';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { Pencil, Trash2, Sparkles, CreditCard, Calendar, Tag, FileText, ShoppingCart, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { getLocalReceiptItems } from '@/lib/storage/indexedDB';
import { useStorage } from '@/contexts/StorageContext';
import { useAuth } from '@/hooks/useAuth';

interface TransactionDetailDialogProps {
  expense: Expense | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (expense: Expense) => void;
  onDelete: (id: string) => void;
}

export const TransactionDetailDialog = ({
  expense,
  open,
  onOpenChange,
  onEdit,
  onDelete
}: TransactionDetailDialogProps) => {
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const { storageMode } = useStorage();
  const { user } = useAuth();
  const isLocalMode = storageMode === 'local' && !user;

  useEffect(() => {
    if (expense && open) {
      loadReceiptItems();
    }
  }, [expense, open]);

  const loadReceiptItems = async () => {
    if (!expense) return;
    
    setLoadingItems(true);
    try {
      if (isLocalMode) {
        const localItems = await getLocalReceiptItems(expense.id);
        setItems(localItems);
      } else {
        const { data, error } = await supabase
          .from('receipt_items')
          .select('*')
          .eq('expense_id', expense.id);
        
        if (error) throw error;
        setItems(data || []);
      }
    } catch (error) {
      console.error('Error loading receipt items:', error);
    } finally {
      setLoadingItems(false);
    }
  };

  if (!expense) return null;

  const categoryInfo = getCategoryInfo(expense.category);
  const paymentInfo = getPaymentSourceInfo(expense.payment_source || 'cash');

  const formatAmount = (value: number) => {
    return new Intl.NumberFormat('hr-HR', {
      style: 'currency',
      currency: 'EUR',
    }).format(value);
  };

  const handleEdit = () => {
    onEdit(expense);
    onOpenChange(false);
  };

  const handleDelete = () => {
    onDelete(expense.id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-2xl">{categoryInfo.icon}</span>
            <span className="truncate">{expense.description}</span>
            {expense.ai_extracted && (
              <Sparkles className="w-4 h-4 text-accent shrink-0" />
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Amount */}
          <div className={cn(
            "p-4 rounded-xl text-center",
            expense.type === 'income' ? "bg-income/10" : "bg-expense/10"
          )}>
            <p className="text-sm text-muted-foreground mb-1">
              {expense.type === 'income' ? 'Prihod' : 'Trošak'}
            </p>
            <p className={cn(
              "text-3xl font-bold font-mono",
              expense.type === 'income' ? "text-income" : "text-expense"
            )}>
              {expense.type === 'expense' ? '-' : '+'}{formatAmount(Number(expense.amount))}
            </p>
          </div>

          {/* Payment Source - Highlighted */}
          <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-2xl">
                {paymentInfo.icon}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Izvor plaćanja</p>
                <p className="font-semibold text-lg">{paymentInfo.name}</p>
              </div>
            </div>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Date */}
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Calendar className="w-4 h-4" />
                <span className="text-xs">Datum</span>
              </div>
              <p className="font-medium">
                {format(expense.date, 'dd. MMMM yyyy.', { locale: hr })}
              </p>
            </div>

            {/* Category */}
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Tag className="w-4 h-4" />
                <span className="text-xs">Kategorija</span>
              </div>
              <p className="font-medium flex items-center gap-1">
                <span>{categoryInfo.icon}</span>
                <span>{categoryInfo.name}</span>
              </p>
            </div>

            {/* Merchant */}
            {expense.merchant_name && (
              <div className="p-3 rounded-lg bg-muted/50 col-span-2">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <FileText className="w-4 h-4" />
                  <span className="text-xs">Trgovac</span>
                </div>
                <p className="font-medium">{expense.merchant_name}</p>
              </div>
            )}
          </div>

          {/* Receipt Items */}
          {loadingItems ? (
            <div className="py-4 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : items.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <ShoppingCart className="w-4 h-4" />
                <span className="text-sm font-medium">Artikli ({items.length})</span>
              </div>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {items.map((item, index) => (
                  <div 
                    key={item.id || index}
                    className="flex items-center justify-between p-2 rounded-lg bg-muted/30 text-sm"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="truncate">{item.name}</span>
                      {item.quantity && item.quantity > 1 && (
                        <span className="text-muted-foreground">×{item.quantity}</span>
                      )}
                    </div>
                    <span className="font-mono font-medium shrink-0">
                      {formatAmount(item.total_price)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Timestamps */}
          {expense.created_at && (
            <p className="text-xs text-muted-foreground text-center">
              Kreirano: {format(new Date(expense.created_at), 'dd.MM.yyyy. HH:mm', { locale: hr })}
              {expense.updated_at && expense.updated_at !== expense.created_at && (
                <> • Ažurirano: {format(new Date(expense.updated_at), 'dd.MM.yyyy. HH:mm', { locale: hr })}</>
              )}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button 
            variant="outline" 
            className="flex-1"
            onClick={handleEdit}
          >
            <Pencil className="w-4 h-4 mr-2" />
            Uredi
          </Button>
          <Button 
            variant="destructive" 
            className="flex-1"
            onClick={handleDelete}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Obriši
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};