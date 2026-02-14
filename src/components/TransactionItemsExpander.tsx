import { useState, useEffect } from 'react';
import { ReceiptItem } from '@/types/expense';
import { supabase } from '@/integrations/supabase/client';
import { getLocalReceiptItems } from '@/lib/storage/indexedDB';
import { useStorage } from '@/contexts/StorageContext';
import { useAuth } from '@/hooks/useAuth';
import { useCurrency } from '@/contexts/CurrencyContext';
import { ShoppingCart, ChevronDown, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';

interface TransactionItemsExpanderProps {
  expenseId: string;
  isExpanded: boolean;
  onToggle: () => void;
}

export const TransactionItemsExpander = ({ expenseId, isExpanded, onToggle }: TransactionItemsExpanderProps) => {
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const { storageMode } = useStorage();
  const { user } = useAuth();
  const { formatAmount } = useCurrency();
  const { t } = useTranslation();
  const isLocalMode = storageMode === 'local' && !user;

  useEffect(() => {
    if (isExpanded && !loaded) {
      loadItems();
    }
  }, [isExpanded]);

  const loadItems = async () => {
    setLoading(true);
    try {
      if (isLocalMode) {
        const localItems = await getLocalReceiptItems(expenseId);
        setItems(localItems);
      } else {
        const { data, error } = await supabase
          .from('receipt_items')
          .select('*')
          .eq('expense_id', expenseId);
        if (error) throw error;
        setItems(data || []);
      }
      setLoaded(true);
    } catch (error) {
      console.error('Error loading items:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 pb-1"
      >
        <ShoppingCart className="w-3 h-3" />
        <span>{t('common.items', 'Artikli')}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mx-2 mb-2 p-2 rounded-lg bg-muted/30 border border-border/50">
              {loading ? (
                <div className="flex items-center justify-center py-3">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              ) : items.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">
                  {t('transactions.noItems', 'Nema artikala za ovu transakciju')}
                </p>
              ) : (
                <div className="space-y-1">
                  {items.map((item, index) => (
                    <div
                      key={item.id || index}
                      className="flex items-center justify-between text-xs py-1 px-1"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="truncate">{item.name}</span>
                        {item.quantity && item.quantity > 1 && (
                          <span className="text-muted-foreground shrink-0">×{item.quantity}</span>
                        )}
                      </div>
                      <span className="font-mono font-medium shrink-0 ml-2">
                        {formatAmount(item.total_price)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
