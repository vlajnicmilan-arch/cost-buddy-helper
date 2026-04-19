import { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useBackButton } from '@/hooks/useBackButton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Expense, getCategoryInfo, getPaymentSourceInfo, ReceiptItem } from '@/types/expense';
import { useCurrency } from '@/contexts/CurrencyContext';
import { format } from 'date-fns';
import { hr, enUS, de } from 'date-fns/locale';
import { Pencil, Trash2, Sparkles, CreditCard, Calendar, Tag, FileText, ShoppingCart, Loader2, MessageCircle, User, Receipt, X, ZoomIn, ZoomOut, Eye, Briefcase, FolderOpen, Share2, Download, MapPin, Smartphone, Cloud, Upload, ArrowRight, ArrowLeftRight } from 'lucide-react';
import { resolveTransferEndpoints } from '@/lib/transferMatching';
import { Badge } from '@/components/ui/badge';
import { exportFile } from '@/lib/fileExport';
import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { getLocalReceiptItems } from '@/lib/storage/indexedDB';
import { useStorage } from '@/contexts/StorageContext';
import { useAuth } from '@/hooks/useAuth';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import { useCustomCategories } from '@/hooks/useCustomCategories';
import { useTranslation } from 'react-i18next';
import { TransactionNotesThread } from './TransactionNotesThread';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { useNativeShare } from '@/hooks/useNativeShare';
import { LocalFileCache } from '@/hooks/useLocalFileCache';
import { LocalStorage } from '@/hooks/useLocalStorage';


interface TransactionDetailDialogProps {
  expense: Expense | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (expense: Expense) => void;
  onDelete: (id: string) => void;
  contentClassName?: string;
}

export const TransactionDetailDialog = ({
  expense,
  open,
  onOpenChange,
  onEdit,
  onDelete,
  contentClassName
}: TransactionDetailDialogProps) => {
  
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [submitterName, setSubmitterName] = useState<string | null>(null);
  const [showReceiptImage, setShowReceiptImage] = useState(false);
  const [imageZoom, setImageZoom] = useState(1);
  const [freshReceiptUrl, setFreshReceiptUrl] = useState<string | null>(null);
  const [isLocalReceipt, setIsLocalReceipt] = useState(false);

  // Stable close helper for receipt viewer
  const closeReceiptViewer = useCallback(() => {
    setShowReceiptImage(false);
    setImageZoom(1);
  }, []);

  // Register receipt viewer with back button (priority 10 = higher than dialog's default 0)
  useBackButton(showReceiptImage, closeReceiptViewer, 10);

  // Reset viewer state when dialog closes or expense changes
  useEffect(() => {
    if (!open) {
      setShowReceiptImage(false);
      setImageZoom(1);
    }
  }, [open, expense?.id]);
  const { storageMode } = useStorage();
  const { user } = useAuth();
  const { formatAmount } = useCurrency();
  const { customPaymentSources } = useCustomPaymentSources();
  const { customCategories } = useCustomCategories();
  const { t, i18n } = useTranslation();
  const { shareTransaction } = useNativeShare();
  const isLocalMode = storageMode === 'local' && !user;
  
  const dateLocale = i18n.language === 'de' ? de : i18n.language === 'en' ? enUS : hr;

  // Fetch budget/project names for context badges
  const [budgetName, setBudgetName] = useState<{ name: string; icon?: string | null } | null>(null);
  const [projectName, setProjectName] = useState<{ name: string; icon?: string | null } | null>(null);

  useEffect(() => {
    const fetchContext = async () => {
      if (!expense || !open) return;

      if (expense.budget_id) {
        const { data } = await supabase
          .from('budget_plans')
          .select('name, icon')
          .eq('id', expense.budget_id)
          .single();
        setBudgetName(data ? { name: data.name, icon: data.icon } : null);
      } else {
        setBudgetName(null);
      }

      if (expense.project_id) {
        const { data } = await supabase
          .from('projects')
          .select('name, icon')
          .eq('id', expense.project_id)
          .single();
        setProjectName(data ? { name: data.name, icon: data.icon } : null);
      } else {
        setProjectName(null);
      }
    };
    fetchContext();
  }, [expense?.budget_id, expense?.project_id, open]);

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

  // Refresh receipt signed URL when dialog opens
  useEffect(() => {
    const refreshReceiptUrl = async () => {
      if (!expense?.receipt_url || !open) {
        setFreshReceiptUrl(null);
        setIsLocalReceipt(false);
        return;
      }

      // Handle local receipt images
      if (expense.receipt_url.startsWith('local:')) {
        setIsLocalReceipt(true);
        const localPath = expense.receipt_url.replace('local:', '');
        
        // Try native filesystem first
        const nativeImage = await LocalFileCache.readReceiptImage(localPath);
        if (nativeImage) {
          setFreshReceiptUrl(nativeImage);
          return;
        }

        // Web fallback: try localStorage/IndexedDB
        const webImage = await LocalStorage.get(localPath);
        if (webImage) {
          setFreshReceiptUrl(webImage);
          return;
        }

        setFreshReceiptUrl(null);
        return;
      }
      
      setIsLocalReceipt(false);
      
      try {
        let filePath = expense.receipt_url;
        
        // If it's a full URL (old format with signed token), extract the file path
        if (filePath.startsWith('http')) {
          const url = new URL(filePath);
          const pathMatch = url.pathname.match(/\/storage\/v1\/object\/sign\/receipts\/(.+)/);
          if (pathMatch) {
            filePath = pathMatch[1];
          } else {
            setFreshReceiptUrl(expense.receipt_url);
            return;
          }
        }
        
        // Remove 'receipts/' prefix if present
        filePath = filePath.replace(/^receipts\//, '');
        
        // Try createSignedUrl first
        const { data, error } = await supabase.storage
          .from('receipts')
          .createSignedUrl(filePath, 3600);
        
        if (!error && data?.signedUrl) {
          setFreshReceiptUrl(data.signedUrl);
          return;
        }
        
        console.warn('createSignedUrl failed, trying download:', error?.message);
        
        // Fallback: download the file and create a blob URL
        const { data: blobData, error: dlError } = await supabase.storage
          .from('receipts')
          .download(filePath);
        
        if (!dlError && blobData) {
          const blobUrl = URL.createObjectURL(blobData);
          setFreshReceiptUrl(blobUrl);
          return;
        }
        
        console.error('Both signed URL and download failed:', dlError?.message);
      } catch (e) {
        console.error('Error refreshing receipt URL:', e);
      }
      
      setFreshReceiptUrl(null);
    };

    refreshReceiptUrl();
    
    // Cleanup blob URLs
    return () => {
      if (freshReceiptUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(freshReceiptUrl);
      }
    };
  }, [expense?.receipt_url, open]);

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

  // Resolve category: check custom categories first, then system ones
  const categoryInfo = useMemo(() => {
    if (!expense) return { id: 'other', name: 'Ostalo', icon: '📦', color: 'category-other', isCustom: false };
    const custom = customCategories.find(c => c.id === expense.category || c.name === expense.category);
    if (custom) {
      return { id: custom.id, name: custom.name, icon: custom.icon, color: custom.color, isCustom: true };
    }
    return { ...getCategoryInfo(expense.category), isCustom: false };
  }, [expense?.category, customCategories]);

  if (!expense) return null;

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
      <DialogContent className={cn("sm:max-w-md max-h-[85vh] flex flex-col overflow-hidden", contentClassName)}>
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
              {expense.type === 'expense' ? '-' : expense.type === 'transfer' ? '↔' : '+'}{formatAmount(Number(expense.amount), expense.currency as any)}
            </p>
            {expense.type === 'transfer' && (
              <p className="text-xs text-muted-foreground mt-1">
                {t('common.transfersNoImpact')}
              </p>
            )}
          </div>

          {/* Context Badges — Budget / Project */}
          {(budgetName || projectName) && (
            <div className="flex flex-wrap gap-2">
              {budgetName && (
                <Badge variant="secondary" className="gap-1.5 px-3 py-1.5 text-sm font-medium bg-primary/10 text-primary border-primary/20">
                  <Briefcase className="w-3.5 h-3.5" />
                  <span>{budgetName.icon || '📋'}</span>
                  {budgetName.name}
                </Badge>
              )}
              {projectName && (
                <Badge variant="secondary" className="gap-1.5 px-3 py-1.5 text-sm font-medium bg-accent/10 text-accent-foreground border-accent/20">
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>{projectName.icon || '📁'}</span>
                  {projectName.name}
                </Badge>
              )}
            </div>
          )}

          {/* Payment Source — for transfer: show From → To, otherwise single source */}
          {expense.type === 'transfer' ? (
            (() => {
              const transfer = resolveTransferEndpoints(expense, customPaymentSources as any);
              if (!transfer) return null;
              const renderEndpoint = (info: typeof transfer.from, label: string) => (
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground mb-1">{label}</p>
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-lg shrink-0"
                      style={info.color ? { backgroundColor: `${info.color}20`, color: info.color } : { backgroundColor: 'hsl(var(--muted))' }}
                    >
                      {info.icon}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{info.name}</p>
                      {info.cardLast4 && (
                        <p className="text-[10px] font-mono text-muted-foreground">••{info.cardLast4}</p>
                      )}
                    </div>
                  </div>
                </div>
              );
              return (
                <div className="p-4 rounded-xl border bg-primary/5 border-primary/20">
                  <div className="flex items-center gap-2 mb-3 text-primary">
                    <ArrowLeftRight className="w-4 h-4" />
                    <p className="text-sm font-medium">{t('transactions.transferTitle', 'Prijenos između računa')}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {renderEndpoint(transfer.from, t('transactions.transferFrom', 'Iz računa'))}
                    <ArrowRight className="w-5 h-5 text-primary shrink-0" />
                    {renderEndpoint(transfer.to, t('transactions.transferTo', 'U račun'))}
                  </div>
                </div>
              );
            })()
          ) : (
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
          )}

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

            {/* Location */}
            {(expense as any).location_name && (
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <MapPin className="w-4 h-4" />
                  <span className="text-xs">{t('transactions.location', 'Lokacija')}</span>
                </div>
                <p className="font-medium text-sm">{(expense as any).location_name}</p>
              </div>
            )}

            {expense.type !== 'transfer' && (
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
            )}

            {/* Expense Nature - for project/budget transactions */}
            {expense.expense_nature && (expense.project_id || expense.budget_id) && (
              <div className="p-3 rounded-lg bg-muted/50 col-span-2">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <span className={cn(
                    "w-3 h-3 rounded-full",
                    expense.expense_nature === 'regular' ? "bg-income" : "bg-destructive"
                  )} />
                  <span className="text-xs">{t('transactions.expenseNature', 'Vrsta troška')}</span>
                </div>
                <p className="font-medium">
                  {expense.expense_nature === 'regular' 
                    ? t('transactions.regular', 'Redovan') 
                    : t('transactions.extraordinary', 'Vanredan')}
                </p>
              </div>
            )}

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
              {freshReceiptUrl ? (
                <>
                  <div 
                    className="relative cursor-pointer group rounded-lg overflow-hidden border"
                    onClick={() => setShowReceiptImage(true)}
                  >
                    {/* Eye button top-left */}
                    <button
                      className="absolute top-2 left-2 z-10 flex min-h-[36px] min-w-[36px] items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
                      onClick={(e) => { e.stopPropagation(); setShowReceiptImage(true); }}
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    {/* Local badge top-right */}
                    {isLocalReceipt && (
                      <Badge variant="outline" className="absolute top-2 right-2 z-10 text-[10px] px-1.5 py-0.5 gap-1 bg-background/80 backdrop-blur-sm">
                        <Smartphone className="w-3 h-3" />
                        {t('transactions.localOnly', 'Na uređaju')}
                      </Badge>
                    )}
                    <AspectRatio ratio={4/3}>
                      <img 
                        src={freshReceiptUrl} 
                        alt={t('transactions.receiptImage', 'Slika računa')}
                        className="object-cover w-full h-full transition-transform group-hover:scale-105"
                      />
                    </AspectRatio>
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center pointer-events-none">
                      <ZoomIn className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                  {/* Contextual Save + Share buttons */}
                  <div className="flex gap-2">
                    {isLocalReceipt ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-1.5 text-xs"
                        onClick={async () => {
                          if (!freshReceiptUrl || !user) return;
                          try {
                            const response = await fetch(freshReceiptUrl);
                            const blob = await response.blob();
                            const filePath = `${user.id}/${expense.id}.jpg`;
                            const { error: uploadError } = await supabase.storage.from('receipts').upload(filePath, blob, { upsert: true });
                            if (uploadError) throw uploadError;
                            const { error: updateError } = await supabase.from('expenses').update({ receipt_url: filePath }).eq('id', expense.id);
                            if (updateError) throw updateError;
                            // Cleanup local copy
                            const localPath = expense.receipt_url?.replace('local:', '');
                            if (localPath) {
                              await LocalFileCache.deleteReceiptImage(localPath);
                            }
                            setIsLocalReceipt(false);
                            // Refresh URL from cloud
                            const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(filePath);
                            if (urlData?.publicUrl) setFreshReceiptUrl(urlData.publicUrl);
                            toast.success(t('transactions.savedToCloud', 'Spremljeno u oblak'));
                          } catch (e: any) {
                            console.error('Cloud upload error:', e);
                            toast.error(t('common.error', 'Greška'));
                          }
                        }}
                      >
                        <Cloud className="w-3.5 h-3.5" />
                        {t('transactions.saveToCloud', 'Spremi u oblak')}
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-1.5 text-xs"
                        onClick={async () => {
                          if (!freshReceiptUrl) return;
                          try {
                            const response = await fetch(freshReceiptUrl);
                            const blob = await response.blob();
                            if (Capacitor.isNativePlatform()) {
                              // Native: save locally via LocalFileCache
                              const reader = new FileReader();
                              reader.onloadend = async () => {
                                const base64 = reader.result as string;
                                const localPath = await LocalFileCache.saveReceiptImage(base64, `${expense.id}.jpg`);
                                if (localPath && user) {
                                  await supabase.from('expenses').update({ receipt_url: `local:${localPath}` }).eq('id', expense.id);
                                  setIsLocalReceipt(true);
                                  toast.success(t('transactions.savedToDevice', 'Spremljeno na uređaj'));
                                }
                              };
                              reader.readAsDataURL(blob);
                            } else {
                              // Web: direct download
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `racun_${expense.id.slice(0,8)}.jpg`;
                              a.style.display = 'none';
                              document.body.appendChild(a);
                              a.click();
                              setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
                              toast.success(t('transactions.savedToDevice', 'Spremljeno na uređaj'));
                            }
                          } catch (e: any) {
                            if (!e?.message?.includes('cancel') && !e?.message?.includes('abort')) {
                              console.error('Save error:', e);
                              toast.error(t('common.error', 'Greška'));
                            }
                          }
                        }}
                      >
                        <Download className="w-3.5 h-3.5" />
                        {t('transactions.saveToDevice', 'Spremi na uređaj')}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-1.5 text-xs"
                      onClick={async () => {
                        if (!freshReceiptUrl) return;
                        try {
                          const response = await fetch(freshReceiptUrl);
                          const blob = await response.blob();
                          const file = new File([blob], `racun_${expense.id.slice(0,8)}.jpg`, { type: blob.type });
                          if (navigator.share && navigator.canShare?.({ files: [file] })) {
                            await navigator.share({ files: [file], title: t('transactions.receiptImage', 'Slika računa') });
                          } else if (navigator.share) {
                            await navigator.share({ title: t('transactions.receiptImage', 'Slika računa'), url: freshReceiptUrl });
                          }
                        } catch (e: any) {
                          if (!e?.message?.includes('cancel') && !e?.message?.includes('abort')) {
                            console.error('Share error:', e);
                          }
                        }
                      }}
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      {t('transactions.share', 'Podijeli')}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center p-6 rounded-lg border bg-muted/30">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mr-2" />
                  <span className="text-sm text-muted-foreground">{t('common.loading', 'Učitavanje...')}</span>
                </div>
              )}
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
                      {formatAmount(item.total_price, expense.currency as any)}
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
            variant="outline"
            size="icon"
            onClick={() => {
              if (expense) {
                shareTransaction(
                  expense.description,
                  formatAmount(expense.amount),
                  format(new Date(expense.date), 'dd.MM.yyyy')
                );
              }
            }}
          >
            <Share2 className="w-4 h-4" />
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

      {/* Receipt Image Fullscreen Overlay (portal, no nested Dialog) */}
      {open && showReceiptImage && freshReceiptUrl && createPortal(
        <div 
          className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center"
          onClick={closeReceiptViewer}
        >
          {/* Close button — 44x44 touch target */}
          <button
            className="absolute top-3 right-3 z-[110] flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
            onClick={(e) => { e.stopPropagation(); closeReceiptViewer(); }}
          >
            <X className="w-5 h-5" />
          </button>

          {/* Zoom controls — 44x44 touch targets */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[110] flex gap-2 bg-black/50 rounded-full p-1"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="text-white hover:bg-white/20 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full disabled:opacity-40"
              onClick={() => setImageZoom(prev => Math.max(0.5, prev - 0.25))}
              disabled={imageZoom <= 0.5}
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-white text-sm flex items-center px-2 min-w-[3rem] justify-center">
              {Math.round(imageZoom * 100)}%
            </span>
            <button
              className="text-white hover:bg-white/20 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full disabled:opacity-40"
              onClick={() => setImageZoom(prev => Math.min(3, prev + 0.25))}
              disabled={imageZoom >= 3}
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>

          {/* Image */}
          <div 
            className="overflow-auto max-w-full max-h-[90vh] p-4 flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img 
              src={freshReceiptUrl} 
              alt={t('transactions.receiptImage', 'Slika računa')}
              className="max-w-full max-h-[85vh] object-contain transition-transform duration-200"
              style={{ transform: `scale(${imageZoom})`, transformOrigin: 'center' }}
            />
          </div>
        </div>,
        document.body
      )}
    </Dialog>
  );
};