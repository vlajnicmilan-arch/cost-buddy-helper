import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Expense, getCategoryInfo, getPaymentSourceInfo, ReceiptItem } from '@/types/expense';
import { useCurrency } from '@/contexts/CurrencyContext';
import { format } from 'date-fns';
import { hr, enUS, de } from 'date-fns/locale';
import { Pencil, Trash2, Sparkles, CreditCard, Calendar, Tag, FileText, ShoppingCart, Loader2, MessageCircle, User, Receipt, X, ZoomIn, ZoomOut, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { getLocalReceiptItems } from '@/lib/storage/indexedDB';
import { useStorage } from '@/contexts/StorageContext';
import { useAuth } from '@/hooks/useAuth';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import { useTranslation } from 'react-i18next';
import { TransactionNotesThread } from './TransactionNotesThread';
import { AspectRatio } from '@/components/ui/aspect-ratio';
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
  const [submitterName, setSubmitterName] = useState<string | null>(null);
  const [showReceiptImage, setShowReceiptImage] = useState(false);
  const [imageZoom, setImageZoom] = useState(1);
  const { storageMode } = useStorage();
  const { user } = useAuth();
  const { formatAmount } = useCurrency();
  const { customPaymentSources } = useCustomPaymentSources();
  const { t, i18n } = useTranslation();
  const isLocalMode = storageMode === 'local' && !user;
  
  const dateLocale = i18n.language === 'de' ? de : i18n.language === 'en' ? enUS : hr;

  // Fetch submitter name for project/income source transactions
  useEffect(() => {
    const fetchSubmitterName = async () => {
      if (!expense || (!expense.project_id && !expense.income_source_id)) {
        setSubmitterName(null);
        return;
      }

      const authorId = expense.submitted_by || expense.user_id;
      if (authorId === user?.id) {
        setSubmitterName(t('common.you', 'Ti'));
        return;
      }

      const { data } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('user_id', authorId)
        .single();

      setSubmitterName(data?.display_name || t('common.member', 'Član'));
    };

    fetchSubmitterName();
  }, [expense, user, t]);

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


  const handleEdit = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    // Close detail dialog first, then open edit after a tick
    // to prevent Radix Dialog close animation from interfering
    onOpenChange(false);
    setTimeout(() => {
      onEdit(expense);
    }, 100);
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
            {/* Submitted By - for project/income source transactions */}
            {(expense.project_id || expense.income_source_id) && submitterName && (
              <div className="p-3 rounded-lg bg-primary/5 border border-primary/10 col-span-2">
                <div className="flex items-center gap-2 text-primary mb-1">
                  <User className="w-4 h-4" />
                  <span className="text-xs font-medium">{t('transactions.submittedBy', 'Unio/la')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Avatar className="w-6 h-6">
                    <AvatarFallback className="text-xs bg-primary/20 text-primary">
                      {submitterName.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <p className="font-medium">{submitterName}</p>
                </div>
              </div>
            )}

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
          </div>

          {/* Receipt Image */}
          {expense.receipt_url && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Receipt className="w-4 h-4" />
                  <span className="text-sm font-medium">{t('transactions.receiptImage', 'Slika računa')}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-xs text-muted-foreground"
                  onClick={() => window.open(expense.receipt_url!, '_blank', 'noopener,noreferrer')}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  {t('common.openInNewWindow', 'Otvori u novom prozoru')}
                </Button>
              </div>
              <div 
                className="relative cursor-pointer group rounded-lg overflow-hidden border"
                onClick={() => setShowReceiptImage(true)}
              >
                <AspectRatio ratio={4/3}>
                  <img 
                    src={expense.receipt_url} 
                    alt={t('transactions.receiptImage', 'Slika računa')}
                    className="object-cover w-full h-full transition-transform group-hover:scale-105"
                  />
                </AspectRatio>
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                  <ZoomIn className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            </div>
          )}

          {/* Notes Thread - for income source and project transactions */}
          {(expense.income_source_id || expense.project_id) && (
            <TransactionNotesThread
              expenseId={expense.id}
              incomeSourceId={expense.income_source_id}
              projectId={expense.project_id}
              initialNote={expense.note}
            />
          )}

          {/* Single note display for personal transactions */}
          {!expense.income_source_id && !expense.project_id && expense.note && (
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
              <div className="flex items-center gap-2 text-primary mb-1">
                <MessageCircle className="w-4 h-4 shrink-0" />
                <span className="text-xs font-medium">{t('transactions.note')}</span>
              </div>
              <p className="text-sm break-words whitespace-normal">{expense.note}</p>
            </div>
          )}

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
            onClick={(e) => handleEdit(e)}
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

      {/* Receipt Image Fullscreen Modal */}
      {showReceiptImage && expense.receipt_url && (
        <Dialog open={showReceiptImage} onOpenChange={setShowReceiptImage}>
          <DialogContent className="max-w-[95vw] max-h-[95vh] w-auto h-auto p-0 border-0 bg-black/95">
            <div className="relative w-full h-full flex items-center justify-center">
              {/* Close button */}
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 z-50 bg-black/50 hover:bg-black/70 text-white"
                onClick={() => {
                  setShowReceiptImage(false);
                  setImageZoom(1);
                }}
              >
                <X className="w-5 h-5" />
              </Button>

              {/* Zoom controls */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 flex gap-2 bg-black/50 rounded-full p-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/20 h-8 w-8"
                  onClick={() => setImageZoom(prev => Math.max(0.5, prev - 0.25))}
                  disabled={imageZoom <= 0.5}
                >
                  <ZoomOut className="w-4 h-4" />
                </Button>
                <span className="text-white text-sm flex items-center px-2 min-w-[3rem] justify-center">
                  {Math.round(imageZoom * 100)}%
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/20 h-8 w-8"
                  onClick={() => setImageZoom(prev => Math.min(3, prev + 0.25))}
                  disabled={imageZoom >= 3}
                >
                  <ZoomIn className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/20 h-8 w-8"
                  onClick={() => window.open(expense.receipt_url!, '_blank', 'noopener,noreferrer')}
                  title={t('common.openInNewWindow', 'Otvori u novom prozoru')}
                >
                  <ExternalLink className="w-4 h-4" />
                </Button>
              </div>

              {/* Image */}
              <div className="overflow-auto max-w-full max-h-[90vh] p-4">
                <img 
                  src={expense.receipt_url} 
                  alt={t('transactions.receiptImage', 'Slika računa')}
                  className="max-w-none transition-transform duration-200"
                  style={{ transform: `scale(${imageZoom})`, transformOrigin: 'center' }}
                />
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  );
};