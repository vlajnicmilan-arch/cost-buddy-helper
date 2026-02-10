import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Category, CATEGORIES, Expense, PaymentSource, PAYMENT_SOURCES, PAYMENT_SOURCE_GROUPS, ReceiptItem, getCategoryInfo, TransactionType, IncomeCategory, INCOME_CATEGORIES } from '@/types/expense';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import { useCustomIncomeCategories } from '@/hooks/useCustomIncomeCategories';
import { useCustomCategories } from '@/hooks/useCustomCategories';
import { useProjects } from '@/hooks/useProjects';
import { useBudgets } from '@/hooks/useBudgets';
import { useInstallments } from '@/hooks/useInstallments';
import { Plus, Camera, Image, Loader2, X, ChevronDown, ChevronUp, Save, Check, RotateCcw, FolderKanban, PiggyBank } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useReceiptScanner } from '@/hooks/useReceiptScanner';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { CustomIncomeCategoryDialog } from '@/components/custom-categories/CustomIncomeCategoryDialog';
import { InstallmentToggle } from '@/components/installments';
import { DuplicateWarningDialog } from '@/components/DuplicateWarningDialog';

interface AddExpenseDialogProps {
  onAdd: (expense: Omit<Expense, 'id' | 'user_id' | 'created_at' | 'updated_at'>, items?: ReceiptItem[], isPendingMemberTransaction?: boolean) => Promise<void> | void;
  checkDuplicate?: (transaction: {
    amount: number;
    description: string;
    date: Date;
    type: string;
    category?: string;
    merchant_name?: string;
  }) => Expense | null;
}

interface ScannedData {
  amount: number;
  merchant: string;
  description: string;
  category: Category;
  date: string | null;
  payment_source: PaymentSource | null;
  custom_payment_source_id: string | null;
  payment_source_card_id: string | null;
  items: ReceiptItem[];
  is_installment?: boolean;
  installment_count?: number | null;
  installment_amount?: number | null;
}

export const AddExpenseDialog = ({ onAdd, checkDuplicate }: AddExpenseDialogProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Category | IncomeCategory>('food');
  const [merchantName, setMerchantName] = useState('');
  const [paymentSource, setPaymentSource] = useState<PaymentSource>('cash');
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [showItems, setShowItems] = useState(false);
  const [saveReceipt, setSaveReceipt] = useState(false);
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [scannedData, setScannedData] = useState<ScannedData | null>(null);
  const [showScannedPreview, setShowScannedPreview] = useState(false);
  
  const [note, setNote] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedBudgetId, setSelectedBudgetId] = useState<string | null>(null);
  
  // Installment state
  const [isInstallment, setIsInstallment] = useState(false);
  const [installmentCount, setInstallmentCount] = useState(12);
  const [firstPaymentDate, setFirstPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Duplicate detection state
  const [duplicateWarningOpen, setDuplicateWarningOpen] = useState(false);
  const [duplicateOf, setDuplicateOf] = useState<Expense | null>(null);
  const [pendingTransaction, setPendingTransaction] = useState<{
    expense: Omit<Expense, 'id' | 'user_id' | 'created_at' | 'updated_at'>;
    items?: ReceiptItem[];
  } | null>(null);
  
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  
  const { scanning, scanReceipt, uploadReceiptImage } = useReceiptScanner();
  const { customPaymentSources, refetch: refetchPaymentSources } = useCustomPaymentSources();
  const { customIncomeCategories, addCustomIncomeCategory, refetch: refetchIncomeCategories } = useCustomIncomeCategories();
  const { customCategories, refetch: refetchCustomCategories } = useCustomCategories();
  const { projects } = useProjects();
  const { budgets } = useBudgets();
  const { createPlan: createInstallmentPlan } = useInstallments();
  const [incomeCategoryDialogOpen, setIncomeCategoryDialogOpen] = useState(false);
  const [expenseCategoryDialogOpen, setExpenseCategoryDialogOpen] = useState(false);

  // Set default payment source when dialog opens and sources are loaded
  useEffect(() => {
    if (open && customPaymentSources.length > 0 && paymentSource === 'cash') {
      setPaymentSource(customPaymentSources[0].id as PaymentSource);
    }
  }, [open, customPaymentSources]);

  const handleImageCapture = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      setReceiptImage(base64);
      
      // Pass custom payment sources to scanner for matching
      const result = await scanReceipt(base64, customPaymentSources);
      
      if (result) {
        console.log('Scan result:', {
          custom_payment_source_id: result.custom_payment_source_id,
          payment_source_card_id: result.payment_source_card_id,
          payment_source: result.payment_source,
          is_installment: result.is_installment,
          installment_count: result.installment_count,
          installment_amount: result.installment_amount
        });
        
        setScannedData({
          amount: result.amount,
          merchant: result.merchant,
          description: result.description,
          category: result.category,
          date: result.date,
          payment_source: result.payment_source,
          custom_payment_source_id: result.custom_payment_source_id,
          payment_source_card_id: result.payment_source_card_id,
          items: result.items,
          is_installment: result.is_installment,
          installment_count: result.installment_count,
          installment_amount: result.installment_amount
        });
        
        // Auto-enable installment mode if detected on receipt
        if (result.is_installment && result.installment_count) {
          setIsInstallment(true);
          setInstallmentCount(result.installment_count);
          setFirstPaymentDate(result.date || new Date().toISOString().split('T')[0]);
        }
        
        setShowScannedPreview(true);
      }
    };
    reader.readAsDataURL(file);
    
    // Reset file inputs
    if (cameraInputRef.current) {
      cameraInputRef.current.value = '';
    }
    if (galleryInputRef.current) {
      galleryInputRef.current.value = '';
    }
  };

  const [isSaving, setIsSaving] = useState(false);

  const acceptScannedData = async () => {
    if (!scannedData || isSaving) return;
    
    setIsSaving(true);
    
    try {
      const validItems = scannedData.items.filter(item => item.name && item.total_price > 0);
      
      let receiptUrl: string | undefined;
      if (saveReceipt && receiptImage) {
        toast.info('Spremam sliku računa...');
        const uploadedUrl = await uploadReceiptImage(receiptImage);
        if (uploadedUrl) {
          receiptUrl = uploadedUrl;
        }
      }

      // Use detected custom payment source if matched, otherwise use detected payment source
      let finalPaymentSource: PaymentSource = paymentSource;
      let finalCardId: string | null = null;
      
      if (scannedData.custom_payment_source_id) {
        // Custom source was matched by AI
        finalPaymentSource = `custom:${scannedData.custom_payment_source_id}` as PaymentSource;
        finalCardId = scannedData.payment_source_card_id;
        console.log(`Using AI-matched custom source: ${scannedData.custom_payment_source_id}, card: ${finalCardId}`);
      } else if (scannedData.payment_source) {
        // Standard payment source detected
        finalPaymentSource = scannedData.payment_source;
      }

      const newExpense = {
        amount: scannedData.amount,
        description: scannedData.description,
        category: scannedData.category,
        date: new Date(scannedData.date || expenseDate),
        type: 'expense' as TransactionType,
        payment_source: finalPaymentSource,
        payment_source_card_id: finalCardId,
        merchant_name: scannedData.merchant || undefined,
        receipt_url: receiptUrl,
        ai_extracted: true
      };

      // Check for duplicates
      if (checkDuplicate) {
        const duplicate = checkDuplicate({
          amount: scannedData.amount,
          description: scannedData.description,
          date: new Date(scannedData.date || expenseDate),
          type: 'expense',
          category: scannedData.category,
          merchant_name: scannedData.merchant || undefined
        });

        if (duplicate) {
          setDuplicateOf(duplicate);
          setPendingTransaction({
            expense: newExpense,
            items: validItems.length > 0 ? validItems : undefined
          });
          setDuplicateWarningOpen(true);
          setIsSaving(false);
          return;
        }
      }

      // Handle installment creation if detected from receipt
      if (isInstallment && scannedData.installment_count) {
        await createInstallmentPlan({
          description: scannedData.description,
          total_amount: scannedData.amount,
          installment_count: scannedData.installment_count,
          first_payment_date: new Date(scannedData.date || expenseDate),
          category: scannedData.category,
          type: 'expense',
          payment_source: finalPaymentSource,
          payment_source_card_id: finalCardId || undefined
        });
        resetForm();
        setIsSaving(false);
        return;
      }

      await executeAdd(newExpense, validItems.length > 0 ? validItems : undefined);
    } catch (error) {
      console.error('Error saving expense:', error);
      toast.error(t('transactions.saveError'));
    } finally {
      setIsSaving(false);
    }
  };

  const rejectScannedData = () => {
    setScannedData(null);
    setShowScannedPreview(false);
    setReceiptImage(null);
  };

  const addItem = () => {
    setItems([...items, { name: '', quantity: 1, total_price: 0 }]);
    setShowItems(true);
  };

  const updateItem = (index: number, field: keyof ReceiptItem, value: string | number) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    
    if (field === 'quantity' || field === 'unit_price') {
      const qty = field === 'quantity' ? Number(value) : newItems[index].quantity;
      const price = field === 'unit_price' ? Number(value) : (newItems[index].unit_price || 0);
      if (qty && price) {
        newItems[index].total_price = qty * price;
      }
    }
    
    setItems(newItems);
    
    const itemsTotal = newItems.reduce((sum, item) => sum + (Number(item.total_price) || 0), 0);
    if (itemsTotal > 0) {
      setAmount(itemsTotal.toFixed(2));
    }
  };

  const removeItem = (index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);
    
    const itemsTotal = newItems.reduce((sum, item) => sum + (Number(item.total_price) || 0), 0);
    if (itemsTotal > 0) {
      setAmount(itemsTotal.toFixed(2));
    }
  };

  const resetForm = () => {
    setAmount('');
    setDescription('');
    setCategory('food');
    setMerchantName('');
    // Reset to first custom payment source or cash
    setPaymentSource(customPaymentSources.length > 0 ? customPaymentSources[0].id as PaymentSource : 'cash');
    setSelectedCardId(null);
    setExpenseDate(new Date().toISOString().split('T')[0]);
    setItems([]);
    setShowItems(false);
    setReceiptImage(null);
    setSaveReceipt(false);
    setScannedData(null);
    setShowScannedPreview(false);
    setNote('');
    setSelectedProjectId(null);
    setSelectedBudgetId(null);
    // Reset installment state
    setIsInstallment(false);
    setInstallmentCount(12);
    setFirstPaymentDate(new Date().toISOString().split('T')[0]);
  };

  // Helper to actually add the transaction (after duplicate check passes)
  const executeAdd = async (
    expense: Omit<Expense, 'id' | 'user_id' | 'created_at' | 'updated_at'>,
    validItems?: ReceiptItem[]
  ) => {
    await onAdd(expense, validItems);
    resetForm();
    setOpen(false);
  };

  // Handle duplicate confirmation
  const handleDuplicateConfirm = async () => {
    if (pendingTransaction) {
      await executeAdd(pendingTransaction.expense, pendingTransaction.items);
      setPendingTransaction(null);
      setDuplicateOf(null);
    }
    setDuplicateWarningOpen(false);
  };

  const handleDuplicateCancel = () => {
    setPendingTransaction(null);
    setDuplicateOf(null);
    setDuplicateWarningOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !description) return;

    const parsedAmount = parseFloat(amount);

    // Handle installment creation - also save the main expense so it appears in transactions
    if (isInstallment && type !== 'transfer') {
      await createInstallmentPlan({
        description,
        total_amount: parsedAmount,
        installment_count: installmentCount,
        first_payment_date: new Date(firstPaymentDate),
        category,
        payment_source: paymentSource,
        payment_source_card_id: selectedCardId,
        type: type as 'expense' | 'income'
      });
      
      // ALSO save the main expense record so it shows in recent transactions
      const validItems = items.filter(item => item.name && item.total_price > 0);
      
      let receiptUrl: string | undefined;
      if (saveReceipt && receiptImage) {
        const uploadedUrl = await uploadReceiptImage(receiptImage);
        if (uploadedUrl) receiptUrl = uploadedUrl;
      }

      const installmentExpense = {
        amount: parsedAmount,
        description,
        category,
        date: new Date(expenseDate),
        type,
        payment_source: paymentSource,
        payment_source_card_id: selectedCardId,
        merchant_name: merchantName || undefined,
        receipt_url: receiptUrl,
        ai_extracted: scannedData !== null,
        note: note.trim() || undefined,
        project_id: selectedProjectId || undefined,
        budget_id: selectedBudgetId || undefined
      };

      await onAdd(installmentExpense, validItems.length > 0 ? validItems : undefined);
      resetForm();
      setOpen(false);
      return;
    }

    const validItems = items.filter(item => item.name && item.total_price > 0);
    
    let receiptUrl: string | undefined;
    if (saveReceipt && receiptImage) {
      toast.info(t('transactions.savingReceipt'));
      const uploadedUrl = await uploadReceiptImage(receiptImage);
      if (uploadedUrl) {
        receiptUrl = uploadedUrl;
        toast.success(t('transactions.receiptSaved'));
      }
    }

    const newExpense = {
      amount: parsedAmount,
      description,
      category,
      date: new Date(expenseDate),
      type,
      payment_source: paymentSource,
      payment_source_card_id: selectedCardId,
      merchant_name: merchantName || undefined,
      receipt_url: receiptUrl,
      ai_extracted: scannedData !== null,
      note: note.trim() || undefined,
      project_id: selectedProjectId || undefined,
      budget_id: selectedBudgetId || undefined
    };

    // Check for duplicates (skip for transfers)
    if (checkDuplicate && type !== 'transfer') {
      const duplicate = checkDuplicate({
        amount: parsedAmount,
        description,
        date: new Date(expenseDate),
        type,
        category,
        merchant_name: merchantName || undefined
      });

      if (duplicate) {
        setDuplicateOf(duplicate);
        setPendingTransaction({
          expense: newExpense,
          items: validItems.length > 0 ? validItems : undefined
        });
        setDuplicateWarningOpen(true);
        return;
      }
    }

    await executeAdd(newExpense, validItems.length > 0 ? validItems : undefined);
  };

  const categoryInfo = scannedData ? getCategoryInfo(scannedData.category) : null;

  return (
    <>
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (isOpen) {
        // Refetch all needed data when dialog opens
        refetchPaymentSources().then(() => {
          // Set default payment source after fetching
          if (customPaymentSources.length > 0) {
            setPaymentSource(customPaymentSources[0].id as PaymentSource);
          } else {
            setPaymentSource('cash');
          }
        });
        refetchCustomCategories();
      } else {
        resetForm();
      }
    }}>
      <DialogTrigger asChild>
        <Button className="gap-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20">
          <Plus className="w-5 h-5" />
          {t('common.add')}
        </Button>
      </DialogTrigger>
      <DialogContent showBackButton={false} className="sm:max-w-md glass-card border-border/50 h-[85vh] flex flex-col">
        <DialogHeader className="flex-shrink-0 pb-2">
          <DialogTitle className="text-xl font-semibold">{t('transactions.newTransaction')}</DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto -mx-6 px-6">
          {/* Scanned Data Preview */}
          {showScannedPreview && scannedData && (
            <div className="space-y-4 pb-4">
              <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-primary flex items-center gap-2">
                    <Check className="w-4 h-4" />
                    {t('scanner.foundData')}
                  </h3>
                </div>
                
                {receiptImage && (
                  <div className="relative rounded-lg overflow-hidden h-20">
                    <img 
                      src={receiptImage} 
                      alt="Račun" 
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">{t('common.amount')}:</span>
                    <p className="font-bold text-lg">€{scannedData.amount.toFixed(2)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t('scanner.merchant')}:</span>
                    <p className="font-medium">{scannedData.merchant || '-'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t('common.date')}:</span>
                    <p className="font-medium">
                      {scannedData.date 
                        ? new Date(scannedData.date).toLocaleDateString('hr-HR')
                        : t('scanner.dateNotFound')
                      }
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t('common.category')}:</span>
                    <p className="font-medium">
                      {categoryInfo?.icon} {categoryInfo?.name}
                    </p>
                  </div>
                </div>

                {/* Installment indicator */}
                {scannedData.is_installment && scannedData.installment_count && (
                  <div className="p-3 bg-accent/10 border border-accent/30 rounded-lg">
                    <p className="text-sm font-medium text-accent-foreground flex items-center gap-2">
                      💳 Kupnja na rate: {scannedData.installment_count} rata
                      {scannedData.installment_amount && ` × €${scannedData.installment_amount.toFixed(2)}`}
                    </p>
                  </div>
                )}

                {/* Editable payment source selector */}
                <div className="space-y-2">
                  <span className="text-muted-foreground text-sm">{t('common.paymentSource')}:</span>
                  <Select
                    value={scannedData.custom_payment_source_id 
                      ? `custom:${scannedData.custom_payment_source_id}` 
                      : (scannedData.payment_source || 'cash')}
                    onValueChange={(value) => {
                      if (value.startsWith('custom:')) {
                        const customId = value.replace('custom:', '');
                        setScannedData({
                          ...scannedData,
                          custom_payment_source_id: customId,
                          payment_source: null,
                          payment_source_card_id: null
                        });
                      } else {
                        setScannedData({
                          ...scannedData,
                          custom_payment_source_id: null,
                          payment_source: value as PaymentSource,
                          payment_source_card_id: null
                        });
                      }
                    }}
                  >
                    <SelectTrigger className="w-full rounded-lg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {/* Custom payment sources first */}
                      {customPaymentSources.length > 0 && (
                        <>
                          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                            {t('paymentSources.myAccounts')}
                          </div>
                          {customPaymentSources.map((source) => (
                            <SelectItem key={source.id} value={`custom:${source.id}`}>
                              <div className="flex items-center gap-2">
                                <span 
                                  className="w-5 h-5 rounded-full flex items-center justify-center text-xs"
                                  style={{ backgroundColor: source.color + '20', color: source.color }}
                                >
                                  {source.icon}
                                </span>
                                <span>{source.name}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </>
                      )}
                      {/* Standard payment sources */}
                      {PAYMENT_SOURCE_GROUPS.map((group) => (
                        <div key={group.label}>
                          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                            {group.label}
                          </div>
                          {group.sources.map((source) => (
                            <SelectItem key={source.id} value={source.id}>
                              <span className="flex items-center gap-2">
                                <span>{source.icon}</span>
                                <span>{source.name}</span>
                              </span>
                            </SelectItem>
                          ))}
                        </div>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Card selector if custom source is selected */}
                  {scannedData.custom_payment_source_id && (() => {
                    const selectedSource = customPaymentSources.find(s => s.id === scannedData.custom_payment_source_id);
                    if (selectedSource?.cards && selectedSource.cards.length > 0) {
                      return (
                        <Select
                          value={scannedData.payment_source_card_id || 'none'}
                          onValueChange={(value) => {
                            setScannedData({
                              ...scannedData,
                              payment_source_card_id: value === 'none' ? null : value
                            });
                          }}
                        >
                          <SelectTrigger className="w-full rounded-lg">
                            <SelectValue placeholder={t('paymentSources.selectCard')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">{t('paymentSources.noCard')}</SelectItem>
                            {selectedSource.cards.map((card) => (
                              <SelectItem key={card.id} value={card.id}>
                                <span className="flex items-center gap-2">
                                  <span>💳</span>
                                  <span>{card.card_name} ****{card.last_four_digits}</span>
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      );
                    }
                    return null;
                  })()}
                </div>
                
                <div>
                  <span className="text-muted-foreground text-sm">{t('common.description')}:</span>
                  <p className="font-medium text-sm">{scannedData.description}</p>
                </div>
                
                {scannedData.items.length > 0 && (
                  <div>
                    <span className="text-muted-foreground text-sm">
                      {t('scanner.itemsFound')} ({scannedData.items.length}):
                    </span>
                    <div className="mt-1 max-h-32 overflow-y-auto space-y-1">
                      {scannedData.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-xs bg-background/50 px-2 py-1 rounded">
                          <span className="truncate flex-1">{item.name}</span>
                          <span className="font-mono ml-2">€{item.total_price.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center space-x-2 pt-2">
                  <Checkbox 
                    id="save-receipt-preview" 
                    checked={saveReceipt}
                    onCheckedChange={(checked) => setSaveReceipt(checked as boolean)}
                  />
                  <label 
                    htmlFor="save-receipt-preview" 
                    className="text-sm text-muted-foreground cursor-pointer flex items-center gap-1"
                  >
                    <Save className="w-3 h-3" />
                    {t('scanner.saveImage')}
                  </label>
                </div>
              </div>
              
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 gap-2 rounded-xl"
                  onClick={rejectScannedData}
                >
                  <RotateCcw className="w-4 h-4" />
                  {t('scanner.reject')}
                </Button>
                <Button
                  type="button"
                  className="flex-1 gap-2 rounded-xl bg-primary"
                  onClick={acceptScannedData}
                >
                  <Check className="w-4 h-4" />
                  {t('scanner.accept')}
                </Button>
              </div>
            </div>
          )}

          {/* Main Form - Show when not previewing scanned data */}
          {!showScannedPreview && (
            <form onSubmit={handleSubmit} className="space-y-5 pb-4">
              {/* Receipt Scan Buttons */}
              <div className="flex gap-2">
                {/* Camera input - has capture attribute */}
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleImageCapture}
                  className="hidden"
                  id="camera-input"
                />
                {/* Gallery input - NO capture attribute */}
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageCapture}
                  className="hidden"
                  id="gallery-input"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 gap-2 rounded-xl"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={scanning}
                >
                  {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                  {t('scanner.takePhoto')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 gap-2 rounded-xl"
                  onClick={() => galleryInputRef.current?.click()}
                  disabled={scanning}
                >
                  {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Image className="w-4 h-4" />}
                  {t('scanner.fromGallery')}
                </Button>
              </div>

              {scanning && (
                <div className="text-center py-4 text-muted-foreground text-sm">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                  {t('scanner.analyzing')}
                </div>
              )}

              {/* Receipt Image Preview (after acceptance) */}
              {receiptImage && !scanning && scannedData && (
                <div className="space-y-2">
                  <div className="relative rounded-xl overflow-hidden bg-muted/50 p-2">
                    <img 
                      src={receiptImage} 
                      alt={t('scanner.scanReceipt')} 
                      className="w-full h-20 object-cover rounded-lg"
                    />
                    <div className="absolute top-2 right-2 bg-primary/90 text-primary-foreground text-xs px-2 py-0.5 rounded">
                      {t('transactions.aiScanned')}
                    </div>
                  </div>
                </div>
              )}

              {/* Type Toggle */}
              <div className="flex gap-2 p-1 bg-muted rounded-xl">
                <button
                  type="button"
                  onClick={() => setType('expense')}
                  className={cn(
                    "flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all",
                    type === 'expense' 
                      ? "bg-expense text-expense-foreground shadow-sm" 
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t('transactions.expense')}
                </button>
                <button
                  type="button"
                  onClick={() => setType('income')}
                  className={cn(
                    "flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all",
                    type === 'income' 
                      ? "bg-income text-income-foreground shadow-sm" 
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t('transactions.income')}
                </button>
                <button
                  type="button"
                  onClick={() => setType('transfer')}
                  className={cn(
                    "flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all",
                    type === 'transfer' 
                      ? "bg-primary text-primary-foreground shadow-sm" 
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  🔄
                </button>
              </div>
              {type === 'transfer' && (
                <p className="text-xs text-muted-foreground text-center">
                  {t('transactions.transferNote')}
                </p>
              )}


              {/* Payment Source */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">
                  {type === 'income' ? t('transactions.incomeSourceLabel') : t('transactions.paymentMethod')}
                </Label>
                
                <Select
                  value={paymentSource.startsWith('custom:') ? paymentSource : (customPaymentSources.find(s => s.id === paymentSource) ? paymentSource : paymentSource)}
                  onValueChange={(value) => {
                    setPaymentSource(value as PaymentSource);
                    setSelectedCardId(null);
                  }}
                >
                  <SelectTrigger className="h-12 rounded-xl bg-background">
                    <SelectValue placeholder={t('transactions.selectPaymentMethod')}>
                      {(() => {
                        // First check custom payment sources
                        const customSource = customPaymentSources.find(s => s.id === paymentSource);
                        if (customSource) {
                          return (
                            <span className="flex items-center gap-2">
                              <span 
                                className="w-5 h-5 rounded-full flex items-center justify-center text-xs"
                                style={{ backgroundColor: customSource.color + '20', color: customSource.color }}
                              >
                                {customSource.icon}
                              </span>
                              <span>{customSource.name}</span>
                            </span>
                          );
                        }
                        // Then check standard payment sources
                        const standardSource = PAYMENT_SOURCES.find(s => s.id === paymentSource);
                        if (standardSource) {
                          return (
                            <span className="flex items-center gap-2">
                              <span>{standardSource.icon}</span>
                              <span>{t(`paymentSources.${standardSource.id}`) !== `paymentSources.${standardSource.id}` ? t(`paymentSources.${standardSource.id}`) : standardSource.name}</span>
                            </span>
                          );
                        }
                        return t('transactions.selectPaymentMethod');
                      })()}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="bg-popover z-50 max-h-[300px]">
                    {/* Custom Payment Sources First - "Moji načini" */}
                    {customPaymentSources.length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          {t('transactions.myMethods')}
                        </div>
                        {customPaymentSources.map((source) => (
                          <SelectItem key={source.id} value={source.id}>
                            <div className="flex items-center gap-2">
                              <span 
                                className="w-5 h-5 rounded-full flex items-center justify-center text-xs"
                                style={{ backgroundColor: source.color + '20', color: source.color }}
                              >
                                {source.icon}
                              </span>
                              <span>{source.name}</span>
                              <span className="text-xs text-muted-foreground ml-auto">
                                €{source.balance.toFixed(2)}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </>
                    )}
                    
                    {/* Standard Payment Sources */}
                    {PAYMENT_SOURCE_GROUPS.map((group) => (
                      <div key={group.label}>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          {t(`paymentSources.${group.label.toLowerCase().replace(/\s+/g, '')}`) !== `paymentSources.${group.label.toLowerCase().replace(/\s+/g, '')}` 
                            ? t(`paymentSources.${group.label.toLowerCase().replace(/\s+/g, '')}`) 
                            : group.label}
                        </div>
                        {group.sources.map((source) => (
                          <SelectItem key={source.id} value={source.id}>
                            <span className="flex items-center gap-2">
                              <span>{source.icon}</span>
                              <span>{t(`paymentSources.${source.id}`) !== `paymentSources.${source.id}` ? t(`paymentSources.${source.id}`) : source.name}</span>
                            </span>
                          </SelectItem>
                        ))}
                      </div>
                    ))}
                  </SelectContent>
                </Select>

                {/* Card Selection - Show when custom payment source with cards is selected */}
                {(() => {
                  const selectedSource = customPaymentSources.find(s => s.id === paymentSource);
                  if (!selectedSource?.cards?.length) return null;
                  
                  return (
                    <div className="p-3 rounded-xl bg-primary/5 border border-primary/20">
                      <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                        {t('transactions.selectCardLabel')}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedCardId(null)}
                          className={cn(
                            "px-3 py-2 rounded-lg text-xs font-medium transition-all border",
                            !selectedCardId 
                              ? "border-primary bg-primary/10 text-primary" 
                              : "border-border bg-muted/50 hover:bg-muted"
                          )}
                        >
                          {t('paymentSources.noCard')}
                        </button>
                        {selectedSource.cards.map((card) => (
                          <button
                            key={card.id}
                            type="button"
                            onClick={() => setSelectedCardId(card.id)}
                            className={cn(
                              "px-3 py-2 rounded-lg text-xs font-medium transition-all border flex items-center gap-2",
                              selectedCardId === card.id 
                                ? "border-primary bg-primary/10 text-primary" 
                                : "border-border bg-muted/50 hover:bg-muted"
                            )}
                          >
                            <span>💳</span>
                            <span>{card.card_name}</span>
                            <span className="text-muted-foreground">•••• {card.last_four_digits}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Date */}
              <div className="space-y-2">
                <Label htmlFor="date" className="text-sm font-medium">{t('common.date')}</Label>
                <Input
                  id="date"
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  className="h-12 rounded-xl"
                />
              </div>

              {/* Installment Toggle - Only for expenses and income, not transfers */}
              {type !== 'transfer' && (
                <InstallmentToggle
                  enabled={isInstallment}
                  onEnabledChange={setIsInstallment}
                  installmentCount={installmentCount}
                  onInstallmentCountChange={setInstallmentCount}
                  firstPaymentDate={firstPaymentDate}
                  onFirstPaymentDateChange={setFirstPaymentDate}
                  totalAmount={parseFloat(amount) || 0}
                />
              )}

              {/* Project Assignment */}
              {projects.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <FolderKanban className="w-4 h-4" />
                    {t('transactions.assignToProject')}
                  </Label>
                  <Select 
                    value={selectedProjectId || 'none'} 
                    onValueChange={(v) => setSelectedProjectId(v === 'none' ? null : v)}
                  >
                    <SelectTrigger className="h-12 rounded-xl bg-background">
                      <SelectValue>
                        {selectedProjectId ? (
                          (() => {
                            const project = projects.find(p => p.id === selectedProjectId);
                            return project ? (
                              <span className="flex items-center gap-2">
                                <span 
                                  className="w-5 h-5 rounded flex items-center justify-center text-xs"
                                  style={{ backgroundColor: (project.color || '#3b82f6') + '20', color: project.color || '#3b82f6' }}
                                >
                                  {project.icon || '📁'}
                                </span>
                                <span>{project.name}</span>
                              </span>
                            ) : t('transactions.noProject');
                          })()
                        ) : (
                          <span className="text-muted-foreground">{t('transactions.noProject')}</span>
                        )}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="bg-popover z-50">
                      <SelectItem value="none">
                        <span className="text-muted-foreground">{t('transactions.noProject')}</span>
                      </SelectItem>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          <span className="flex items-center gap-2">
                            <span 
                              className="w-5 h-5 rounded flex items-center justify-center text-xs"
                              style={{ backgroundColor: (project.color || '#3b82f6') + '20', color: project.color || '#3b82f6' }}
                            >
                              {project.icon || '📁'}
                            </span>
                            <span>{project.name}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Budget Assignment - only for expense type */}
              {type === 'expense' && budgets.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <PiggyBank className="w-4 h-4" />
                    {t('transactions.assignToBudget', 'Pridruži budžetu')}
                  </Label>
                  <Select 
                    value={selectedBudgetId || 'none'} 
                    onValueChange={(v) => setSelectedBudgetId(v === 'none' ? null : v)}
                  >
                    <SelectTrigger className="h-12 rounded-xl bg-background">
                      <SelectValue>
                        {selectedBudgetId ? (
                          (() => {
                            const budget = budgets.find(b => b.id === selectedBudgetId);
                            return budget ? (
                              <span className="flex items-center gap-2">
                                <span 
                                  className="w-5 h-5 rounded flex items-center justify-center text-xs"
                                  style={{ backgroundColor: (budget.color || '#3b82f6') + '20', color: budget.color || '#3b82f6' }}
                                >
                                  {budget.icon || '💰'}
                                </span>
                                <span>{budget.name}</span>
                              </span>
                            ) : t('transactions.noBudget', 'Bez budžeta');
                          })()
                        ) : (
                          <span className="text-muted-foreground">{t('transactions.noBudget', 'Bez budžeta')}</span>
                        )}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="bg-popover z-50">
                      <SelectItem value="none">
                        <span className="text-muted-foreground">{t('transactions.noBudget', 'Bez budžeta')}</span>
                      </SelectItem>
                      {budgets.filter(b => b.is_active).map((budget) => (
                        <SelectItem key={budget.id} value={budget.id}>
                          <span className="flex items-center gap-2">
                            <span 
                              className="w-5 h-5 rounded flex items-center justify-center text-xs"
                              style={{ backgroundColor: (budget.color || '#3b82f6') + '20', color: budget.color || '#3b82f6' }}
                            >
                              {budget.icon || '💰'}
                            </span>
                            <span>{budget.name}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}


              <div className="space-y-2">
                <Label htmlFor="merchant" className="text-sm font-medium">
                  {type === 'income' ? t('transactions.merchantSource') : t('transactions.merchantStore')}
                </Label>
                <Input
                  id="merchant"
                  placeholder={type === 'income' ? t('transactions.merchantSourcePlaceholder') : t('transactions.merchantStorePlaceholder')}
                  value={merchantName}
                  onChange={(e) => setMerchantName(e.target.value)}
                  className="h-12 rounded-xl"
                />
              </div>

              {/* Income Category - Dropdown for income type */}
              {type === 'income' && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">{t('transactions.incomeCategory')}</Label>
                  <Select 
                    value={category} 
                    onValueChange={(v) => {
                      if (v === '__add_new__') {
                        setIncomeCategoryDialogOpen(true);
                      } else {
                        setCategory(v as IncomeCategory);
                      }
                    }}
                  >
                    <SelectTrigger className="h-12 rounded-xl bg-background">
                      <SelectValue>
                        {(() => {
                          // Check custom categories first
                          const customCat = customIncomeCategories.find(c => c.id === category);
                          if (customCat) {
                            return (
                              <span className="flex items-center gap-2">
                                <span>{customCat.icon}</span>
                                <span>{customCat.name}</span>
                              </span>
                            );
                          }
                          // Then check default categories
                          const cat = INCOME_CATEGORIES.find(c => c.id === category);
                          return cat ? (
                            <span className="flex items-center gap-2">
                              <span>{cat.icon}</span>
                              <span>{t(`incomeCategories.${cat.id}`)}</span>
                            </span>
                          ) : t('common.category');
                        })()}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="bg-popover z-50">
                      {/* Custom income categories first */}
                      {customIncomeCategories.length > 0 && (
                        <>
                          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            {t('transactions.customSources')}
                          </div>
                          {customIncomeCategories.map((cat) => (
                            <SelectItem key={cat.id} value={cat.id}>
                              <span className="flex items-center gap-2">
                                <span 
                                  className="w-5 h-5 rounded flex items-center justify-center text-xs"
                                  style={{ backgroundColor: cat.color + '20', color: cat.color }}
                                >
                                  {cat.icon}
                                </span>
                                <span>{cat.name}</span>
                              </span>
                            </SelectItem>
                          ))}
                        </>
                      )}
                      {/* Default income categories */}
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        {t('paymentSources.standardSources')}
                      </div>
                      {INCOME_CATEGORIES.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          <span className="flex items-center gap-2">
                            <span>{cat.icon}</span>
                            <span>{t(`incomeCategories.${cat.id}`)}</span>
                          </span>
                        </SelectItem>
                      ))}
                      {/* Add new category option */}
                      <div className="border-t border-border mt-1 pt-1">
                        <SelectItem value="__add_new__" className="text-primary">
                          <span className="flex items-center gap-2">
                            <Plus className="w-4 h-4" />
                            <span>{t('incomeCategories.addNew')}</span>
                          </span>
                        </SelectItem>
                      </div>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Items Section - Only for expenses */}
              {type === 'expense' && (
                <Collapsible open={showItems} onOpenChange={setShowItems}>
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">
                      {t('transactions.expenseItems')}
                      {items.length > 0 && (
                        <span className="ml-2 text-xs text-primary font-bold">
                          ({items.length})
                        </span>
                      )}
                    </Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={addItem}
                        className="h-8 text-xs gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        {t('transactions.addItem')}
                      </Button>
                      {items.length > 0 && (
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            {showItems ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </Button>
                        </CollapsibleTrigger>
                      )}
                    </div>
                  </div>
                  
                  <CollapsibleContent className="mt-2 space-y-2">
                    {items.map((item, index) => (
                      <div key={index} className="flex gap-2 items-start p-3 bg-muted/50 rounded-xl">
                        <div className="flex-1 space-y-2">
                          <Input
                            placeholder={t('transactions.itemName')}
                            value={item.name}
                            onChange={(e) => updateItem(index, 'name', e.target.value)}
                            className="h-9 text-sm rounded-lg"
                          />
                          <div className="flex gap-2">
                            <Input
                              type="number"
                              placeholder={t('transactions.qty')}
                              value={item.quantity || ''}
                              onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value) || 1)}
                              className="h-9 w-16 text-sm rounded-lg"
                              min="1"
                            />
                            <Input
                              type="number"
                              step="0.01"
                              placeholder={t('transactions.price')}
                              value={item.unit_price || ''}
                              onChange={(e) => updateItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                              className="h-9 flex-1 text-sm rounded-lg"
                            />
                            <Input
                              type="number"
                              step="0.01"
                              placeholder={t('common.total')}
                              value={item.total_price || ''}
                              onChange={(e) => updateItem(index, 'total_price', parseFloat(e.target.value) || 0)}
                              className="h-9 w-24 text-sm rounded-lg font-medium"
                            />
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeItem(index)}
                          className="h-9 w-9 text-muted-foreground hover:text-destructive shrink-0"
                          title={t('transactions.removeItem')}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                    {items.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-3">
                        {t('scanner.scanReceipt')} {t('common.or').toLowerCase()} {t('transactions.addItem').toLowerCase()}
                      </p>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Amount */}
              <div className="space-y-2">
                <Label htmlFor="amount" className="text-sm font-medium">
                  {t('transactions.amountEur')}
                  {items.length > 0 && (
                    <span className="text-xs text-muted-foreground ml-2">
                      ({t('common.total').toLowerCase()})
                    </span>
                  )}
                </Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="h-12 text-lg font-mono rounded-xl"
                  required
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description" className="text-sm font-medium">{t('common.description')}</Label>
                <Input
                  id="description"
                  placeholder={t('transactions.descriptionPlaceholder')}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="h-12 rounded-xl"
                  required
                />
              </div>

              {/* Category - Only show for expenses - Dropdown select */}
              {type === 'expense' && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">{t('common.category')}</Label>
                  <Select 
                    value={category} 
                    onValueChange={(v) => setCategory(v as Category)}
                  >
                    <SelectTrigger className="h-12 rounded-xl bg-background">
                      <SelectValue>
                        {(() => {
                          // Check custom categories first
                          const customCat = customCategories.find(c => c.id === category);
                          if (customCat) {
                            return (
                              <span className="flex items-center gap-2">
                                <span 
                                  className="w-5 h-5 rounded flex items-center justify-center text-xs"
                                  style={{ backgroundColor: customCat.color + '20', color: customCat.color }}
                                >
                                  {customCat.icon}
                                </span>
                                <span>{customCat.name}</span>
                              </span>
                            );
                          }
                          // Check default categories
                          const defaultCat = CATEGORIES.find(c => c.id === category);
                          if (defaultCat) {
                            return (
                              <span className="flex items-center gap-2">
                                <span>{defaultCat.icon}</span>
                                <span>{t(`categories.${defaultCat.id}`)}</span>
                              </span>
                            );
                          }
                          return t('common.category');
                        })()}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="bg-popover z-50 max-h-[300px]">
                      {/* Custom expense categories first */}
                      {customCategories.length > 0 && (
                        <>
                          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            {t('transactions.customSources', 'Prilagođene')}
                          </div>
                          {customCategories.map((cat) => (
                            <SelectItem key={cat.id} value={cat.id}>
                              <span className="flex items-center gap-2">
                                <span 
                                  className="w-5 h-5 rounded flex items-center justify-center text-xs"
                                  style={{ backgroundColor: cat.color + '20', color: cat.color }}
                                >
                                  {cat.icon}
                                </span>
                                <span>{cat.name}</span>
                              </span>
                            </SelectItem>
                          ))}
                        </>
                      )}
                      {/* Default categories */}
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        {t('paymentSources.standardSources', 'Standardne')}
                      </div>
                      {CATEGORIES.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          <span className="flex items-center gap-2">
                            <span>{cat.icon}</span>
                            <span>{t(`categories.${cat.id}`)}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}



              {/* Save Receipt Option */}
              {receiptImage && (
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="save-receipt" 
                    checked={saveReceipt}
                    onCheckedChange={(checked) => setSaveReceipt(checked as boolean)}
                  />
                  <label 
                    htmlFor="save-receipt" 
                    className="text-sm text-muted-foreground cursor-pointer flex items-center gap-1"
                  >
                    <Save className="w-3 h-3" />
                    {t('scanner.saveImage')}
                  </label>
                </div>
              )}
            </form>
          )}
        </div>
        
        {/* Fixed Submit Button at bottom - outside ScrollArea */}
        {!showScannedPreview && (
          <div className="flex-shrink-0 pt-4 border-t border-border/50">
            <Button 
              type="button"
              onClick={handleSubmit}
              className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
              disabled={scanning || !amount || !description}
            >
              {t('common.save')}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>

    {/* Custom Income Category Dialog */}
    <CustomIncomeCategoryDialog
      open={incomeCategoryDialogOpen}
      onOpenChange={setIncomeCategoryDialogOpen}
      onSave={async (catData) => {
        const newCat = await addCustomIncomeCategory(catData);
        if (newCat) {
          setCategory(newCat.id as IncomeCategory);
          refetchIncomeCategories();
        }
        return newCat;
      }}
    />

    {/* Duplicate Warning Dialog */}
    <DuplicateWarningDialog
      open={duplicateWarningOpen}
      onOpenChange={setDuplicateWarningOpen}
      duplicateOf={duplicateOf}
      newTransaction={pendingTransaction ? {
        amount: pendingTransaction.expense.amount,
        description: pendingTransaction.expense.description,
        date: pendingTransaction.expense.date instanceof Date ? pendingTransaction.expense.date : new Date(pendingTransaction.expense.date),
        type: pendingTransaction.expense.type,
        category: pendingTransaction.expense.category,
        merchant_name: pendingTransaction.expense.merchant_name
      } : null}
      onConfirm={handleDuplicateConfirm}
      onCancel={handleDuplicateCancel}
    />
  </>
  );
};
