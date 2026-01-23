import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Expense, getCategoryInfo, getPaymentSourceInfo, ReceiptItem } from '@/types/expense';
import { useCurrency } from '@/contexts/CurrencyContext';
import { format } from 'date-fns';
import { hr, enUS, de } from 'date-fns/locale';
import { Pencil, Trash2, Sparkles, CreditCard, Calendar, Tag, FileText, ShoppingCart, Loader2, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { getLocalReceiptItems } from '@/lib/storage/indexedDB';
import { useStorage } from '@/contexts/StorageContext';
import { useAuth } from '@/hooks/useAuth';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import { useTranslation } from 'react-i18next';

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
  const { formatAmount } = useCurrency();
  const { customPaymentSources } = useCustomPaymentSources();
  const { t, i18n } = useTranslation();
  const isLocalMode = storageMode === 'local' && !user;
  
  const dateLocale = i18n.language === 'de' ? de : i18n.language === 'en' ? enUS : hr;

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

  // Resolve payment source info - check for custom payment source first
  const paymentInfo = useMemo(() => {
    if (!expense) {
      return { id: 'cash', name: 'Gotovina', icon: '💵', color: undefined };
    }
    
    // Check if payment_source starts with 'custom:' or if we have a payment_source_card_id
    if (expense.payment_source_card_id) {
      // Find the custom source that has this card
      for (const source of customPaymentSources) {
        const card = source.cards?.find(c => c.id === expense.payment_source_card_id);
        if (card) {
          return {
            id: source.id,
            name: `${source.name} (${card.card_name || '****' + card.last_four_digits})`,
            icon: source.icon,
            color: source.color
          };
        }
      }
    }
    
    // Check if payment_source is a custom: prefixed id
    if (expense.payment_source?.startsWith('custom:')) {
      const customId = expense.payment_source.replace('custom:', '');
      const customSource = customPaymentSources.find(s => s.id === customId);
      if (customSource) {
        return {
          id: customSource.id,
          name: customSource.name,
          icon: customSource.icon,
          color: customSource.color
        };
      }
    }
    
    // Check if payment_source matches a custom source ID directly
    const directMatch = customPaymentSources.find(s => s.id === expense.payment_source);
    if (directMatch) {
      return {
        id: directMatch.id,
        name: directMatch.name,
        icon: directMatch.icon,
        color: directMatch.color
      };
    }
    
    // Fall back to standard payment source
    const standardInfo = getPaymentSourceInfo(expense.payment_source || 'cash');
    return {
      id: standardInfo.id,
      name: standardInfo.name,
      icon: standardInfo.icon,
      color: undefined
    };
  }, [expense, customPaymentSources]);

  if (!expense) return null;

  const categoryInfo = getCategoryInfo(expense.category);


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
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-start gap-2">
            <span className="text-2xl shrink-0">{categoryInfo.icon}</span>
            <span className="break-words whitespace-normal">{expense.description}</span>
            {expense.ai_extracted && (
              <Sparkles className="w-4 h-4 text-accent shrink-0" />
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2 overflow-y-auto flex-1 min-h-0">
          {/* Amount */}
          <div className={cn(
            "p-4 rounded-xl text-center",
            expense.type === 'income' ? "bg-income/10" : 
            expense.type === 'transfer' ? "bg-primary/10" : "bg-expense/10"
          )}>
            <p className="text-sm text-muted-foreground mb-1">
              {expense.type === 'income' ? t('transactions.income') : expense.type === 'transfer' ? t('transactions.transfer') : t('transactions.expense')}
            </p>
            <p className={cn(
              "text-3xl font-bold font-mono",
              expense.type === 'income' ? "text-income" : 
              expense.type === 'transfer' ? "text-primary" : "text-expense"
            )}>
              {expense.type === 'expense' ? '-' : expense.type === 'transfer' ? '↔' : '+'}{formatAmount(Number(expense.amount))}
            </p>
            {expense.type === 'transfer' && (
              <p className="text-xs text-muted-foreground mt-1">
                {t('common.transfersNoImpact')}
              </p>
            )}
          </div>

          {/* Payment Source - Highlighted */}
          <div 
            className="p-4 rounded-xl border"
            style={paymentInfo.color ? {
              backgroundColor: `${paymentInfo.color}10`,
              borderColor: `${paymentInfo.color}40`
            } : undefined}
          >
            <div className="flex items-center gap-3">
              <div 
                className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                style={paymentInfo.color ? {
                  backgroundColor: `${paymentInfo.color}20`,
                  color: paymentInfo.color
                } : undefined}
              >
                {paymentInfo.icon}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('transactions.paymentSource')}</p>
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
                <span className="text-xs">{t('common.date')}</span>
              </div>
              <p className="font-medium">
                {format(expense.date, 'dd. MMMM yyyy.', { locale: dateLocale })}
              </p>
            </div>

            {/* Category */}
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Tag className="w-4 h-4" />
                <span className="text-xs">{t('common.category')}</span>
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
                  <FileText className="w-4 h-4 shrink-0" />
                  <span className="text-xs">{t('common.merchant')}</span>
                </div>
                <p className="font-medium break-words whitespace-normal">{expense.merchant_name}</p>
              </div>
            )}

            {/* Note */}
            {expense.note && (
              <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 col-span-2">
                <div className="flex items-center gap-2 text-primary mb-1">
                  <MessageCircle className="w-4 h-4 shrink-0" />
                  <span className="text-xs font-medium">{t('transactions.note')}</span>
                </div>
                <p className="text-sm break-words whitespace-normal">{expense.note}</p>
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
                <span className="text-sm font-medium">{t('common.items')} ({items.length})</span>
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
              {t('common.created')}: {format(new Date(expense.created_at), 'dd.MM.yyyy. HH:mm', { locale: dateLocale })}
              {expense.updated_at && expense.updated_at !== expense.created_at && (
                <> • {t('common.updated')}: {format(new Date(expense.updated_at), 'dd.MM.yyyy. HH:mm', { locale: dateLocale })}</>
              )}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2 shrink-0">
          <Button 
            variant="outline" 
            className="flex-1"
            onClick={handleEdit}
          >
            <Pencil className="w-4 h-4 mr-2" />
            {t('common.edit')}
          </Button>
          <Button 
            variant="destructive" 
            className="flex-1"
            onClick={handleDelete}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            {t('common.delete')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};