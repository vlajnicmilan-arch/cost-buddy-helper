import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
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
import { useCurrency, CURRENCIES } from '@/contexts/CurrencyContext';
import { useProjects } from '@/hooks/useProjects';
import { useBudgets } from '@/hooks/useBudgets';
import { useInstallments } from '@/hooks/useInstallments';
import { Plus, Camera, Image, Loader2, X, ChevronDown, ChevronUp, Save, Check, RotateCcw, FolderKanban, PiggyBank, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useReceiptScanner } from '@/hooks/useReceiptScanner';
import { useNativeCamera } from '@/hooks/useNativeCamera';


import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { CustomIncomeCategoryDialog } from '@/components/custom-categories/CustomIncomeCategoryDialog';
import { InstallmentToggle } from '@/components/installments';
import { DuplicateWarningDialog } from '@/components/DuplicateWarningDialog';
import { CardLookup } from '@/components/CardLookup';
import { ScanningOverlay } from '@/components/ScanningOverlay';
import { useCategoryHabits } from '@/hooks/useCategoryHabits';
import { useAICategorization } from '@/hooks/useAICategorization';
import { useAppState } from '@/contexts/AppStateContext';
import { supabase } from '@/integrations/supabase/client';
import { useLoanDetection, DetectedLoan } from '@/hooks/useLoanDetection';
import { LoanDetectionDialog } from '@/components/business/LoanDetectionDialog';
import { useBusinessDebts } from '@/hooks/useBusinessDebts';
import { useFeatureAccess, FREE_LIMITS } from '@/hooks/useFeatureAccess';
import { useHaptics } from '@/hooks/useHaptics';
import { useInAppReview } from '@/hooks/useInAppReview';
import { useLocation } from '@/hooks/useLocation';
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
  transaction_type?: 'expense' | 'transfer' | 'income';
  transfer_destination_name?: string | null;
  recipient_name?: string | null;
  issuer_name?: string | null;
  issuer_oib?: string | null;
  vat_rate?: number | null;
  vat_amount?: number | null;
}

export const AddExpenseDialog = ({ onAdd, checkDuplicate }: AddExpenseDialogProps) => {
  const { t } = useTranslation();
  const { hasAccess } = useFeatureAccess();
  const { successVibration } = useHaptics();
  const { maybeRequestReview } = useInAppReview();
  const { getCurrentLocation, loading: locationLoading } = useLocation();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Category | IncomeCategory>('food');
  const [locationName, setLocationName] = useState<string | null>(null);
  const [locationCoords, setLocationCoords] = useState<string | null>(null);
  const [merchantName, setMerchantName] = useState('');
  const [paymentSource, setPaymentSource] = useState<PaymentSource>('cash');
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [showItems, setShowItems] = useState(false);
  const [saveReceipt, setSaveReceipt] = useState(false);
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [receiptImages, setReceiptImages] = useState<string[]>([]);
  const [scannedData, setScannedData] = useState<ScannedData | null>(null);
  const [showScannedPreview, setShowScannedPreview] = useState(false);
  const [showMultiImageCollector, setShowMultiImageCollector] = useState(false);
  
  const [note, setNote] = useState('');
  const [transferDestination, setTransferDestination] = useState<string | null>(null);
  const [totalWithTip, setTotalWithTip] = useState<string>('');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedBudgetId, setSelectedBudgetId] = useState<string | null>(null);
  const [expenseNature, setExpenseNature] = useState<'regular' | 'extraordinary'>('regular');
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
  const multiCameraInputRef = useRef<HTMLInputElement>(null);
  const multiGalleryInputRef = useRef<HTMLInputElement>(null);
  
  const { scanning, scanReceipt, scanMultipleReceipts, uploadReceiptImage } = useReceiptScanner();
  const { takePhoto: nativeTakePhoto, pickFromGallery: nativePickFromGallery, isNative } = useNativeCamera();
  const { formatAmount, currency: primaryCurrency, multiCurrencyEnabled } = useCurrency();
  const { customPaymentSources, refetch: refetchPaymentSources } = useCustomPaymentSources();
  const { customIncomeCategories, addCustomIncomeCategory, refetch: refetchIncomeCategories } = useCustomIncomeCategories();
  const { customCategories, refetch: refetchCustomCategories } = useCustomCategories();
  const { projects } = useProjects();
  const { budgets } = useBudgets();
  const { createPlan: createInstallmentPlan } = useInstallments();
  const { recordHabit, getSuggestedCategory } = useCategoryHabits();
  const { categorize: aiCategorize, cancel: cancelAICategorize } = useAICategorization();
  const { activeBusinessProfileId } = useAppState();
  const { detectSingleLoan } = useLoanDetection();
  const { addDebt } = useBusinessDebts();
  const [loanDetected, setLoanDetected] = useState<DetectedLoan | null>(null);
  const [loanDialogOpen, setLoanDialogOpen] = useState(false);
  const [incomeCategoryDialogOpen, setIncomeCategoryDialogOpen] = useState(false);
  const [expenseCategoryDialogOpen, setExpenseCategoryDialogOpen] = useState(false);

  const [aiSuggesting, setAiSuggesting] = useState(false);
  const userManuallySetCategory = useRef(false);

  // Derive currency symbol and code from the selected payment source
  const selectedSourceCurrencyCode = useMemo(() => {
    if (!multiCurrencyEnabled) return primaryCurrency.code;
    const source = customPaymentSources.find(s => s.id === paymentSource || `custom:${s.id}` === paymentSource);
    if (source?.currency) return source.currency;
    return primaryCurrency.code;
  }, [multiCurrencyEnabled, paymentSource, customPaymentSources, primaryCurrency.code]);

  const selectedSourceCurrency = useMemo(() => {
    const curr = CURRENCIES.find(c => c.code === selectedSourceCurrencyCode);
    return curr?.symbol || primaryCurrency.symbol;
  }, [selectedSourceCurrencyCode, primaryCurrency.symbol]);

  // Auto-suggest category when merchant name changes
  const handleMerchantChange = useCallback((value: string) => {
    setMerchantName(value);
    if (value.trim().length >= 2 && type !== 'income') {
      const suggested = getSuggestedCategory(value);
      if (suggested) {
        setCategory(suggested as Category);
        userManuallySetCategory.current = false;
      } else if (!userManuallySetCategory.current) {
        // No local habit — try AI
        setAiSuggesting(true);
        aiCategorize(description, value, (cat) => {
          if (!userManuallySetCategory.current) {
            setCategory(cat as Category);
          }
          setAiSuggesting(false);
        }, items.length > 0 ? items : undefined);
      }
    }
  }, [type, getSuggestedCategory, aiCategorize, description]);

  // Also trigger AI when description changes (with enough length)
  const handleDescriptionChange = useCallback((value: string) => {
    setDescription(value);
    if (value.trim().length >= 3 && type !== 'income' && !userManuallySetCategory.current) {
      const suggested = getSuggestedCategory(merchantName);
      if (!suggested) {
        setAiSuggesting(true);
        aiCategorize(value, merchantName, (cat) => {
          if (!userManuallySetCategory.current) {
            setCategory(cat as Category);
          }
          setAiSuggesting(false);
        }, items.length > 0 ? items : undefined);
      }
    }
  }, [type, getSuggestedCategory, aiCategorize, merchantName]);

  // Set default payment source when dialog opens and sources are loaded
  useEffect(() => {
    if (open && customPaymentSources.length > 0 && paymentSource === 'cash') {
      setPaymentSource(`custom:${customPaymentSources[0].id}` as PaymentSource);
    }
  }, [open, customPaymentSources]);


  const processImageBase64 = async (base64: string, multiMode: boolean) => {
    if (multiMode || showMultiImageCollector) {
      setReceiptImages(prev => [...prev, base64]);
      setReceiptImage(base64);
      if (!showMultiImageCollector) setShowMultiImageCollector(true);
    } else {
      setReceiptImage(base64);
      const result = await scanReceipt(base64, customPaymentSources, customCategories.map(c => ({ id: c.id, name: c.name, icon: c.icon })));
      if (result) {
        applyScannedResult(result);
      } else {
        console.warn('Receipt scan returned no result');
      }
    }
  };

  const handleNativeCapture = async (source: 'camera' | 'gallery', multiMode = false) => {
    const base64 = source === 'camera' ? await nativeTakePhoto() : await nativePickFromGallery();
    if (base64) {
      await processImageBase64(base64, multiMode);
    }
  };

  const handleImageCapture = async (event: React.ChangeEvent<HTMLInputElement>, multiMode = false) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      await processImageBase64(base64, multiMode);
    };
    reader.readAsDataURL(file);
    
    // Reset file inputs
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (galleryInputRef.current) galleryInputRef.current.value = '';
    if (multiCameraInputRef.current) multiCameraInputRef.current.value = '';
    if (multiGalleryInputRef.current) multiGalleryInputRef.current.value = '';
  };

  const handleScanMultipleImages = async () => {
    if (receiptImages.length === 0) return;
    
    const result = await scanMultipleReceipts(receiptImages, customPaymentSources, customCategories.map(c => ({ id: c.id, name: c.name, icon: c.icon })));
    if (result) {
      applyScannedResult(result);
      setShowMultiImageCollector(false);
    }
  };

  const applyScannedResult = (result: NonNullable<Awaited<ReturnType<typeof scanReceipt>>>) => {
    
    
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
      installment_amount: result.installment_amount,
      transaction_type: result.transaction_type,
      transfer_destination_name: result.transfer_destination_name,
      recipient_name: result.recipient_name
    });
    
    // Auto-enable installment mode if detected on receipt
    if (result.is_installment && result.installment_count) {
      setIsInstallment(true);
      setInstallmentCount(result.installment_count);
      setFirstPaymentDate(result.date || new Date().toISOString().split('T')[0]);
    }
    
    setShowScannedPreview(true);
  };

  

  const [isSaving, setIsSaving] = useState(false);

  const acceptScannedData = async () => {
    if (!scannedData || isSaving) return;

    // Business mode validation: require merchant/date
    if (activeBusinessProfileId) {
      const missing: string[] = [];
      if (!scannedData.merchant?.trim()) missing.push('partner/trgovac');
      if (!scannedData.date) missing.push('datum');
      if (missing.length > 0) {
        toast.error(`Obavezna polja za poslovni mod: ${missing.join(', ')}. Uredi podatke prije spremanja.`);
        return;
      }
    }
    
    setIsSaving(true);
    
    try {
      const validItems = scannedData.items.filter(item => item.name && item.total_price > 0);
      
      let receiptUrl: string | undefined;
      if (saveReceipt && receiptImage) {
        toast.info(t('toasts.savingReceipt'));
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
      } else if (scannedData.payment_source) {
        // Standard payment source detected
        finalPaymentSource = scannedData.payment_source;
      }

      // Determine transaction type - AI may have detected a transfer (e.g. Aircash top-up)
      const isTransfer = scannedData.transaction_type === 'transfer';
      const isIncome = scannedData.transaction_type === 'income';
      
      // For transfers, try to find destination account by name
      let transferDestinationId: string | undefined;
      if (isTransfer) {
        const destName = (scannedData.transfer_destination_name || scannedData.recipient_name || '').toLowerCase();
        if (destName) {
          const matchedDest = customPaymentSources.find(
            s => s.name.toLowerCase().includes(destName) || destName.includes(s.name.toLowerCase())
          );
          if (matchedDest) {
            transferDestinationId = matchedDest.id;
          }
        }
      }

      // Calculate final amount - if tip was entered, use total with tip
      const tipAmount = totalWithTip ? parseFloat(totalWithTip) - scannedData.amount : 0;
      const finalAmount = totalWithTip ? parseFloat(totalWithTip) : scannedData.amount;
      const tipNote = tipAmount > 0 ? `Napojnica: €${tipAmount.toFixed(2)}` : '';

      const finalType: TransactionType = isTransfer ? 'transfer' : (isIncome ? 'income' : 'expense');

      const newExpense = {
        amount: finalAmount,
        description: scannedData.description,
        category: scannedData.category,
        date: new Date(scannedData.date || expenseDate),
        type: finalType,
        payment_source: finalPaymentSource,
        payment_source_card_id: finalCardId,
        merchant_name: scannedData.merchant || undefined,
        receipt_url: receiptUrl,
        ai_extracted: true,
        project_id: selectedProjectId || undefined,
        budget_id: selectedBudgetId || undefined,
        expense_nature: (selectedProjectId || selectedBudgetId) ? expenseNature : undefined,
        business_profile_id: activeBusinessProfileId || null,
        currency: selectedSourceCurrencyCode !== primaryCurrency.code ? selectedSourceCurrencyCode : null,
        // For transfers, store destination in income_source_id field
        income_source_id: transferDestinationId || undefined,
        note: (isInstallment && scannedData.installment_count) 
          ? `${scannedData.installment_count}x rata${tipNote ? ' • ' + tipNote : ''}`
          : (tipNote || undefined),
        // VAT fields (passed through to DB even though not on TS type)
        ...(scannedData.vat_rate != null && scannedData.vat_amount != null ? {
          vat_rate: scannedData.vat_rate,
          vat_amount: scannedData.vat_amount,
        } : {}),
      } as any;

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
        // Also save the base transaction so it appears in recent transactions
        await executeAdd(newExpense, validItems.length > 0 ? validItems : undefined);
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
    setReceiptImages([]);
    setShowMultiImageCollector(false);
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
    userManuallySetCategory.current = false;
    setAiSuggesting(false);
    cancelAICategorize();
    setMerchantName('');
    // Reset to first custom payment source or cash
    setPaymentSource(customPaymentSources.length > 0 ? `custom:${customPaymentSources[0].id}` as PaymentSource : 'cash');
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
    setExpenseNature('regular');
    
    // Reset installment state
    setIsInstallment(false);
    setInstallmentCount(12);
    setFirstPaymentDate(new Date().toISOString().split('T')[0]);
    setTransferDestination(null);
    setTotalWithTip('');
    setLocationName(null);
    setLocationCoords(null);
  };

  // Helper to actually add the transaction (after duplicate check passes)
  const executeAdd = async (
    expense: Omit<Expense, 'id' | 'user_id' | 'created_at' | 'updated_at'>,
    validItems?: ReceiptItem[]
  ) => {
    try {
      // Attach location if set
      const expenseWithLocation = {
        ...expense,
        ...(locationName ? { location_name: locationName, location_coords: locationCoords } : {}),
      };
      await onAdd(expenseWithLocation, validItems);
      successVibration();
      maybeRequestReview();
      // Record merchant→category habit for auto-categorization
      if (expense.merchant_name && expense.category && expense.type !== 'transfer') {
        recordHabit(expense.merchant_name, expense.category);
      }

      // Check for loan detection in business mode
      if (activeBusinessProfileId && expense.type !== 'transfer') {
        const detected = detectSingleLoan(
          expense.description,
          Number(expense.amount),
          expense.type,
          expense.date instanceof Date ? expense.date : new Date(expense.date)
        );
        if (detected) {
          setLoanDetected(detected);
          setLoanDialogOpen(true);
        }
      }

      // Close dialog FIRST to prevent flash of empty form, then reset
      setOpen(false);
      setTimeout(() => {
        resetForm();
      }, 150);
    } catch (error) {
      console.error('Error saving transaction:', error);
      toast.error(t('transactions.saveError') || 'Greška pri spremanju transakcije.');
    }
  };

  const handleLoanConfirm = (loans: DetectedLoan[]) => {
    if (!activeBusinessProfileId) return;
    for (const loan of loans) {
      addDebt({
        business_profile_id: activeBusinessProfileId,
        type: loan.type,
        contact_name: loan.contactName,
        description: loan.description,
        amount: loan.amount,
        paid_amount: 0,
        due_date: null,
        status: 'active',
      });
    }
    toast.success(`Pozajmica dodana u evidenciju dugovanja`);
    setLoanDetected(null);
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
    if (!amount) return;

    // Check free tier transaction limit
    if (!hasAccess('unlimited_transactions')) {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
      const { count } = await supabase
        .from('expenses')
        .select('*', { count: 'exact', head: true })
        .gte('date', monthStart)
        .lte('date', monthEnd);
      if (count !== null && count >= FREE_LIMITS.transactions_per_month) {
        toast.error(t('limits.transactionsReached', `Dosegnuli ste limit od ${FREE_LIMITS.transactions_per_month} transakcija mjesečno. Nadogradite na Pro za neograničene transakcije.`));
        return;
      }
    }

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

      const installmentNote = `${installmentCount}x rata${note.trim() ? ' • ' + note.trim() : ''}`;
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
        note: installmentNote,
        project_id: selectedProjectId || undefined,
        budget_id: selectedBudgetId || undefined,
        expense_nature: (selectedProjectId || selectedBudgetId) ? expenseNature : undefined,
        business_profile_id: activeBusinessProfileId || null,
        currency: selectedSourceCurrencyCode !== primaryCurrency.code ? selectedSourceCurrencyCode : null,
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
      budget_id: selectedBudgetId || undefined,
      expense_nature: (selectedProjectId || selectedBudgetId) ? expenseNature : undefined,
      business_profile_id: activeBusinessProfileId || null,
      
      currency: selectedSourceCurrencyCode !== primaryCurrency.code ? selectedSourceCurrencyCode : null,
      income_source_id: type === 'transfer' ? (transferDestination || undefined) : undefined
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

  const categoryInfo = scannedData ? (() => {
    const custom = customCategories.find(c => c.id === scannedData.category || c.name === scannedData.category);
    if (custom) return { id: custom.id, name: custom.name, icon: custom.icon, color: custom.color };
    return getCategoryInfo(scannedData.category);
  })() : null;

  return (
    <>
    <Dialog open={open} onOpenChange={(isOpen) => {
      // CRITICAL: Prevent closing while scanning, reviewing scanned data, or saving
      if (!isOpen && (scanning || showScannedPreview || isSaving)) {
        return;
      }
      setOpen(isOpen);
      if (isOpen) {
        // Refetch all needed data when dialog opens
        refetchPaymentSources().then(() => {
          // Set default payment source after fetching
          if (customPaymentSources.length > 0) {
            setPaymentSource(`custom:${customPaymentSources[0].id}` as PaymentSource);
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
      <DialogContent 
        showBackButton={false} 
        className="sm:max-w-md glass-card border-border/50 h-[85vh] flex flex-col"
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => {
          // Prevent Escape/back button from closing while scanning or reviewing scanned data
          if (scanning || showScannedPreview || isSaving) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader className="flex-shrink-0 pb-2">
          <DialogTitle className="text-xl font-semibold">{t('transactions.newTransaction')}</DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto -mx-6 px-6 relative">
          <ScanningOverlay visible={scanning} imageCount={receiptImages.length || 1} />
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
                
                {receiptImages.length > 1 ? (
                  <div className="flex gap-1 overflow-x-auto rounded-lg h-20">
                    {receiptImages.map((img, idx) => (
                      <img key={idx} src={img} alt={`Stranica ${idx + 1}`} className="h-full w-auto object-cover rounded-lg flex-shrink-0" />
                    ))}
                  </div>
                ) : receiptImage ? (
                  <div className="relative rounded-lg overflow-hidden h-20">
                    <img 
                      src={receiptImage} 
                      alt="Račun" 
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : null}

                {/* Transaction type selector for scanned data */}
                <div className="space-y-1">
                  <span className="text-muted-foreground text-sm">Tip transakcije:</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setScannedData({ ...scannedData, transaction_type: 'expense', transfer_destination_name: null })}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        scannedData.transaction_type === 'expense'
                          ? 'bg-destructive/10 border-destructive/30 text-destructive'
                          : 'bg-muted/50 border-border text-muted-foreground'
                      }`}
                    >
                      💸 Trošak
                    </button>
                    <button
                      type="button"
                      onClick={() => setScannedData({ ...scannedData, transaction_type: 'income' })}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        scannedData.transaction_type === 'income'
                          ? 'bg-income/10 border-income/30 text-income'
                          : 'bg-muted/50 border-border text-muted-foreground'
                      }`}
                    >
                      💳 Uplata
                    </button>
                    <button
                      type="button"
                      onClick={() => setScannedData({ ...scannedData, transaction_type: 'transfer' })}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        scannedData.transaction_type === 'transfer'
                          ? 'bg-primary/10 border-primary/30 text-primary'
                          : 'bg-muted/50 border-border text-muted-foreground'
                      }`}
                    >
                      🔄 Prijenos
                    </button>
                  </div>
                </div>

                {/* Recipient info for bank transfers */}
                {scannedData.recipient_name && scannedData.transaction_type !== 'transfer' && (
                  <div className="p-2 rounded-lg bg-muted/50 border border-border/50">
                    <p className="text-xs text-muted-foreground">
                      Primatelj: <span className="font-medium text-foreground">{scannedData.recipient_name}</span>
                    </p>
                  </div>
                )}

                {/* Transfer destination info */}
                {scannedData.transaction_type === 'transfer' && (
                  <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                    <div className="flex items-center gap-2 text-sm font-medium text-primary">
                      <span>🔄</span>
                      <span>Prijenos{scannedData.transfer_destination_name ? ` → ${scannedData.transfer_destination_name}` : (scannedData.recipient_name ? ` → ${scannedData.recipient_name}` : '')}</span>
                    </div>
                    {(scannedData.transfer_destination_name || scannedData.recipient_name) && (() => {
                      const destName = (scannedData.transfer_destination_name || scannedData.recipient_name || '').toLowerCase();
                      const matched = customPaymentSources.find(
                        s => s.name.toLowerCase().includes(destName) || destName.includes(s.name.toLowerCase())
                      );
                      return matched ? (
                        <p className="text-xs text-muted-foreground mt-1">
                          Saldo računa "{matched.name}" će se automatski uvećati za €{scannedData.amount.toFixed(2)}
                        </p>
                      ) : (
                        <p className="text-xs text-destructive mt-1">
                          Račun "{scannedData.transfer_destination_name || scannedData.recipient_name}" nije pronađen. Saldo se neće ažurirati.
                        </p>
                      );
                    })()}
                  </div>
                )}
                
                {/* Issuer / Recipient info from AI */}
                {(scannedData.issuer_name || scannedData.issuer_oib) && (
                  <div className="p-2 rounded-lg bg-muted/30 border border-border/50 space-y-0.5">
                    <p className="text-xs text-muted-foreground">
                      Izdavatelj: <span className="font-medium text-foreground">{scannedData.issuer_name || scannedData.merchant}</span>
                      {scannedData.issuer_oib && <span className="ml-1 text-muted-foreground">(OIB: {scannedData.issuer_oib})</span>}
                    </p>
                  </div>
                )}

                {/* VAT info - editable */}
                {activeBusinessProfileId && (
                  <div className="p-2 rounded-lg bg-accent/30 border border-accent/50 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">PDV:</span>
                      <div className="flex gap-1">
                        {[0, 5, 13, 25].map(rate => (
                          <button
                            key={rate}
                            type="button"
                            onClick={() => {
                              const vatAmount = rate > 0 ? parseFloat((scannedData.amount * rate / (100 + rate)).toFixed(2)) : 0;
                              setScannedData({ ...scannedData, vat_rate: rate, vat_amount: vatAmount });
                            }}
                            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                              scannedData.vat_rate === rate
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                            }`}
                          >
                            {rate}%
                          </button>
                        ))}
                      </div>
                    </div>
                    {scannedData.vat_rate != null && scannedData.vat_rate > 0 && scannedData.vat_amount != null && (
                      <p className="text-xs text-muted-foreground">
                        PDV: <span className="font-medium text-foreground">€{scannedData.vat_amount.toFixed(2)}</span>
                        <span className="ml-2">
                          Osnovica: <span className="font-medium text-foreground">€{(scannedData.amount - scannedData.vat_amount).toFixed(2)}</span>
                        </span>
                      </p>
                    )}
                  </div>
                )}
                {!activeBusinessProfileId && scannedData.vat_rate != null && scannedData.vat_amount != null && scannedData.vat_rate > 0 && (
                  <div className="p-2 rounded-lg bg-accent/30 border border-accent/50">
                    <p className="text-xs text-muted-foreground">
                      PDV {scannedData.vat_rate}%: <span className="font-medium text-foreground">€{scannedData.vat_amount.toFixed(2)}</span>
                      <span className="ml-2">
                        Osnovica: <span className="font-medium text-foreground">€{(scannedData.amount - scannedData.vat_amount).toFixed(2)}</span>
                      </span>
                    </p>
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
                </div>

                {/* Editable Category */}
                <div className="space-y-1">
                  <span className="text-muted-foreground text-sm">{t('common.category')}:</span>
                  <Select
                    value={scannedData.category}
                    onValueChange={(value) => {
                      setScannedData({ ...scannedData, category: value as Category });
                    }}
                  >
                    <SelectTrigger className="w-full rounded-lg">
                      <SelectValue>
                        {categoryInfo?.icon} {categoryInfo?.name}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {customCategories.length > 0 && (
                        <>
                          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                            {t('categories.custom', 'Prilagođene')}
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
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                        {t('categories.standard', 'Standardne')}
                      </div>
                      {CATEGORIES.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          <span className="flex items-center gap-2">
                            <span>{cat.icon}</span>
                            <span>{cat.name}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Tip field */}
                {scannedData.transaction_type !== 'transfer' && (
                  <div className="space-y-2 p-3 bg-background/60 rounded-lg border border-border/50">
                    <Label className="text-sm text-muted-foreground flex items-center gap-1.5">
                      🫰 Sa napojnicom (ukupno):
                    </Label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      placeholder={`npr. ${(scannedData.amount + 2).toFixed(2)}`}
                      value={totalWithTip}
                      onChange={(e) => setTotalWithTip(e.target.value)}
                      className="rounded-lg text-sm"
                      min={scannedData.amount}
                      step="0.01"
                    />
                    {totalWithTip && parseFloat(totalWithTip) > scannedData.amount && (
                      <div className="flex items-center justify-between p-2 rounded-md bg-income/10 border border-income/20">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm">🫰</span>
                          <span className="text-sm font-medium text-income">Napojnica</span>
                        </div>
                        <span className="text-sm font-bold text-income">
                          +{formatAmount(parseFloat(totalWithTip) - scannedData.amount)}
                        </span>
                      </div>
                    )}
                    {totalWithTip && parseFloat(totalWithTip) < scannedData.amount && (
                      <p className="text-xs text-destructive">Iznos ne može biti manji od iznosa s računa</p>
                    )}
                  </div>
                )}

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
                
                <div className="space-y-1">
                  <span className="text-muted-foreground text-sm">{t('common.description')}:</span>
                  <Input
                    value={scannedData.description}
                    onChange={(e) => setScannedData({ ...scannedData, description: e.target.value })}
                    className="rounded-lg text-sm"
                    placeholder={t('common.description')}
                  />
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

                {/* Project / Budget selectors */}
                <div className="space-y-2">
                  <span className="text-muted-foreground text-sm flex items-center gap-1">
                    <FolderKanban className="w-3 h-3" />
                    {t('transactions.project', 'Projekt')}:
                  </span>
                  <Select
                    value={selectedProjectId || 'none'}
                    onValueChange={(value) => {
                      setSelectedProjectId(value === 'none' ? null : value);
                      if (value !== 'none') setSelectedBudgetId(null);
                    }}
                  >
                    <SelectTrigger className="w-full rounded-lg">
                      <SelectValue placeholder={t('transactions.noProject', 'Bez projekta')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('transactions.noProject', 'Bez projekta')}</SelectItem>
                      {projects?.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <span className="text-muted-foreground text-sm flex items-center gap-1">
                    <PiggyBank className="w-3 h-3" />
                    {t('transactions.budget', 'Budžet')}:
                  </span>
                  <Select
                    value={selectedBudgetId || 'none'}
                    onValueChange={(value) => {
                      setSelectedBudgetId(value === 'none' ? null : value);
                      if (value !== 'none') setSelectedProjectId(null);
                    }}
                  >
                    <SelectTrigger className="w-full rounded-lg">
                      <SelectValue placeholder={t('transactions.noBudget', 'Bez budžeta')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('transactions.noBudget', 'Bez budžeta')}</SelectItem>
                      {budgets?.map((b) => (
                        <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>


                {(selectedProjectId || selectedBudgetId) && (
                  <div className="space-y-2">
                    <span className="text-muted-foreground text-sm">{t('transactions.expenseNature', 'Vrsta troška')}:</span>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={expenseNature === 'regular' ? 'default' : 'outline'}
                        className="flex-1 text-sm"
                        onClick={() => setExpenseNature('regular')}
                      >
                        <span className="w-2 h-2 rounded-full bg-income mr-2" />
                        {t('transactions.regular', 'Redovan')}
                      </Button>
                      <Button
                        type="button"
                        variant={expenseNature === 'extraordinary' ? 'destructive' : 'outline'}
                        className="flex-1 text-sm"
                        onClick={() => setExpenseNature('extraordinary')}
                      >
                        <span className="w-2 h-2 rounded-full bg-destructive mr-2" />
                        {t('transactions.extraordinary', 'Vanredan')}
                      </Button>
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
              <div className="space-y-2">
                <div className="flex gap-2">
                  {/* Camera input - single image mode */}
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => handleImageCapture(e, false)}
                    className="hidden"
                    id="camera-input"
                  />
                  {/* Gallery input - single image mode */}
                  <input
                    ref={galleryInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageCapture(e, false)}
                    className="hidden"
                    id="gallery-input"
                  />
                  {/* Multi-image inputs */}
                  <input
                    ref={multiCameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => handleImageCapture(e, true)}
                    className="hidden"
                    id="multi-camera-input"
                  />
                  <input
                    ref={multiGalleryInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageCapture(e, true)}
                    className="hidden"
                    id="multi-gallery-input"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 gap-2 rounded-xl border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:border-blue-400 dark:border-blue-600 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-900/50"
                    onClick={() => isNative ? handleNativeCapture('camera') : cameraInputRef.current?.click()}
                    disabled={scanning || showMultiImageCollector}
                  >
                    {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                    {t('scanner.takePhoto')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 gap-2 rounded-xl border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-400 dark:border-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/50"
                    onClick={() => isNative ? handleNativeCapture('gallery') : galleryInputRef.current?.click()}
                    disabled={scanning || showMultiImageCollector}
                  >
                    {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Image className="w-4 h-4" />}
                    {t('scanner.fromGallery')}
                  </Button>
                </div>

                {/* Multi-page toggle */}
                {!showMultiImageCollector && !scanning && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full text-xs border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:border-amber-400 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/50"
                    onClick={() => setShowMultiImageCollector(true)}
                  >
                    📄 Račun ima više stranica? Dodaj više slika
                  </Button>
                )}

                {/* Multi-image collector */}
                {showMultiImageCollector && (
                  <div className="p-3 bg-muted/50 border border-border rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">📄 Višestranični račun ({receiptImages.length} {receiptImages.length === 1 ? 'slika' : 'slika'})</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => {
                          setShowMultiImageCollector(false);
                          setReceiptImages([]);
                          setReceiptImage(null);
                        }}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>

                    {/* Thumbnails of collected images */}
                    {receiptImages.length > 0 && (
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {receiptImages.map((img, idx) => (
                          <div key={idx} className="relative flex-shrink-0 w-16 h-20 rounded-lg overflow-hidden border border-border">
                            <img src={img} alt={`Stranica ${idx + 1}`} className="w-full h-full object-cover" />
                            <span className="absolute bottom-0 left-0 right-0 text-center text-[10px] bg-background/80 text-foreground">{idx + 1}</span>
                            <button
                              type="button"
                              className="absolute top-0.5 right-0.5 w-4 h-4 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center text-[10px]"
                              onClick={() => {
                                setReceiptImages(prev => prev.filter((_, i) => i !== idx));
                              }}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-1 text-xs"
                        onClick={() => isNative ? handleNativeCapture('camera', true) : multiCameraInputRef.current?.click()}
                        disabled={scanning || receiptImages.length >= 5}
                      >
                        <Camera className="w-3 h-3" />
                        Dodaj stranicu
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-1 text-xs"
                        onClick={() => isNative ? handleNativeCapture('gallery', true) : multiGalleryInputRef.current?.click()}
                        disabled={scanning || receiptImages.length >= 5}
                      >
                        <Image className="w-3 h-3" />
                        Iz galerije
                      </Button>
                    </div>

                    {receiptImages.length > 0 && (
                      <Button
                        type="button"
                        className="w-full gap-2 rounded-xl"
                        onClick={handleScanMultipleImages}
                        disabled={scanning}
                      >
                        {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        {scanning ? 'Analiziram...' : `Skeniraj ${receiptImages.length} ${receiptImages.length === 1 ? 'stranicu' : 'stranice'}`}
                      </Button>
                    )}

                    {receiptImages.length >= 5 && (
                      <p className="text-xs text-muted-foreground text-center">Maksimalno 5 stranica</p>
                    )}
                  </div>
                )}
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
                      : "text-[hsl(var(--expense))] bg-[hsl(var(--expense)/0.1)] hover:bg-[hsl(var(--expense)/0.18)]"
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
                      : "text-[hsl(var(--income))] bg-[hsl(var(--income)/0.1)] hover:bg-[hsl(var(--income)/0.18)]"
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
                      : "text-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.1)] hover:bg-[hsl(var(--primary)/0.18)]"
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

              {/* Merchant - First input field */}
              <div className="space-y-2">
                <Label htmlFor="merchant" className="text-sm font-medium">
                  {type === 'income' ? t('transactions.merchantSource') : t('transactions.merchantStore')}
                </Label>
                <Input
                  id="merchant"
                  placeholder={type === 'income' ? t('transactions.merchantSourcePlaceholder') : t('transactions.merchantPlaceholder')}
                  value={merchantName}
                  onChange={(e) => handleMerchantChange(e.target.value)}
                  className="h-12 rounded-xl"
                  autoFocus
                />
              </div>

              {/* Payment Source */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">
                  {type === 'transfer' ? '📤 Sa računa (odakle)' : type === 'income' ? t('transactions.incomeSourceLabel') : t('transactions.paymentMethod')}
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
                                {(CURRENCIES.find(c => c.code === source.currency)?.symbol || primaryCurrency.symbol)}{source.balance.toFixed(2)}
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

                {/* Card Lookup by last 4 digits */}
                <CardLookup
                  customPaymentSources={customPaymentSources}
                  onSelect={(sourceId, cardId) => {
                    setPaymentSource(sourceId as PaymentSource);
                    setSelectedCardId(cardId);
                  }}
                />
              </div>


              {/* Transfer Destination */}
              {type === 'transfer' && (
                <div className="space-y-3">
                  <Label className="text-sm font-medium">📥 Na račun (kamo)</Label>
                  <Select
                    value={transferDestination || 'none'}
                    onValueChange={(value) => setTransferDestination(value === 'none' ? null : value)}
                  >
                    <SelectTrigger className="h-12 rounded-xl bg-background">
                      <SelectValue placeholder={t('placeholders.selectDestinationAccount')}>
                        {(() => {
                          if (!transferDestination) return 'Odaberi odredišni račun';
                          const customSource = customPaymentSources.find(s => s.id === transferDestination);
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
                          const standardSource = PAYMENT_SOURCES.find(s => s.id === transferDestination);
                          if (standardSource) {
                            return (
                              <span className="flex items-center gap-2">
                                <span>{standardSource.icon}</span>
                                <span>{standardSource.name}</span>
                              </span>
                            );
                          }
                          return 'Odaberi odredišni račun';
                        })()}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="bg-popover z-50 max-h-[300px]">
                      <SelectItem value="none">
                        <span className="text-muted-foreground">Bez odredišta</span>
                      </SelectItem>
                      {customPaymentSources.length > 0 && (
                        <>
                          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            {t('transactions.myMethods')}
                          </div>
                          {customPaymentSources
                            .filter(s => s.id !== paymentSource)
                            .map((source) => (
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
                                    {(CURRENCIES.find(c => c.code === source.currency)?.symbol || primaryCurrency.symbol)}{source.balance.toFixed(2)}
                                  </span>
                                </div>
                              </SelectItem>
                            ))}
                        </>
                      )}
                      {PAYMENT_SOURCE_GROUPS.map((group) => (
                        <div key={group.label}>
                          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            {group.label}
                          </div>
                          {group.sources
                            .filter(s => s.id !== paymentSource)
                            .map((source) => (
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
                </div>
              )}

              {/* Visual Transfer Flow */}
              {type === 'transfer' && paymentSource && transferDestination && (
                <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 flex items-center justify-center gap-3">
                  {(() => {
                    const fromCustom = customPaymentSources.find(s => s.id === paymentSource);
                    const fromStandard = PAYMENT_SOURCES.find(s => s.id === paymentSource);
                    const toCustom = customPaymentSources.find(s => s.id === transferDestination);
                    const toStandard = PAYMENT_SOURCES.find(s => s.id === transferDestination);
                    return (
                      <>
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-2xl">{fromCustom?.icon || fromStandard?.icon || '💳'}</span>
                          <span className="text-xs text-muted-foreground font-medium">{fromCustom?.name || fromStandard?.name}</span>
                        </div>
                        <div className="flex items-center gap-1 text-primary">
                          <div className="h-px w-6 bg-primary/40" />
                          <span className="text-lg">→</span>
                          <div className="h-px w-6 bg-primary/40" />
                        </div>
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-2xl">{toCustom?.icon || toStandard?.icon || '💳'}</span>
                          <span className="text-xs text-muted-foreground font-medium">{toCustom?.name || toStandard?.name}</span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}

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
                      <SelectValue placeholder={t('transactions.noProject')} />
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
                      <SelectValue placeholder={t('transactions.noBudget', 'Bez budžeta')} />
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

              {/* Expense Nature - Regular/Extraordinary - only when project or budget selected */}
              {(selectedProjectId || selectedBudgetId) && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">{t('transactions.expenseNature', 'Vrsta troška')}</Label>
                  <div className="flex gap-2 p-1 bg-muted rounded-xl">
                    <button
                      type="button"
                      onClick={() => setExpenseNature('regular')}
                      className={cn(
                        "flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all",
                        expenseNature === 'regular'
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {t('transactions.regular', 'Redovan')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpenseNature('extraordinary')}
                      className={cn(
                        "flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all",
                        expenseNature === 'extraordinary'
                          ? "bg-amber-500 text-white shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {t('transactions.extraordinary', 'Vanredan')}
                    </button>
                  </div>
                </div>
              )}

              {/* Location toggle */}
              <div className="flex items-center justify-between p-2 bg-muted/30 rounded-xl">
                <button
                  type="button"
                  onClick={async () => {
                    if (locationName) {
                      setLocationName(null);
                      setLocationCoords(null);
                    } else {
                      const loc = await getCurrentLocation();
                      if (loc) {
                        setLocationName(loc.name);
                        setLocationCoords(loc.coords);
                        toast.success(t('transactions.locationAdded', 'Lokacija dodana'));
                      } else {
                        toast.error(t('transactions.locationError', 'Nije moguće dohvatiti lokaciju'));
                      }
                    }
                  }}
                  className="flex items-center gap-2 text-sm"
                >
                  <MapPin className={cn("w-4 h-4", locationName ? "text-primary" : "text-muted-foreground")} />
                  {locationLoading ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : locationName ? (
                    <span className="text-primary text-xs truncate max-w-[200px]">{locationName}</span>
                  ) : (
                    <span className="text-muted-foreground text-xs">{t('transactions.addLocation', 'Dodaj lokaciju')}</span>
                  )}
                </button>
                {locationName && (
                  <button
                    type="button"
                    onClick={() => { setLocationName(null); setLocationCoords(null); }}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

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
                  {`${t('common.amount')} (${selectedSourceCurrency})`}
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
                  onChange={(e) => handleDescriptionChange(e.target.value)}
                  className="h-12 rounded-xl"
                />
              </div>

              {/* Category - Only show for expenses - Dropdown select */}
              {type === 'expense' && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium flex items-center gap-1.5">
                    {t('common.category')}
                    {aiSuggesting && (
                      <span className="text-[10px] text-primary animate-pulse">✨ AI...</span>
                    )}
                  </Label>
                  <Select 
                    value={category} 
                    onValueChange={(v) => { userManuallySetCategory.current = true; setCategory(v as Category); }}
                  >
                    <SelectTrigger className="h-12 rounded-xl bg-background">
                      <SelectValue placeholder={t('common.category')} />
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

              {/* Income Category */}
              {type === 'income' && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">{t('common.category')}</Label>
                  <Select 
                    value={category} 
                    onValueChange={(v) => {
                      if (v === '__add_new__') {
                        setIncomeCategoryDialogOpen(true);
                        return;
                      }
                      setCategory(v as IncomeCategory);
                    }}
                  >
                    <SelectTrigger className="h-12 rounded-xl bg-background">
                      <SelectValue placeholder={t('common.category')} />
                    </SelectTrigger>
                    <SelectContent className="bg-popover z-50 max-h-[300px]">
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
              disabled={scanning || !amount}
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

    {/* Loan Detection Dialog */}
    <LoanDetectionDialog
      open={loanDialogOpen}
      onOpenChange={setLoanDialogOpen}
      detectedLoans={loanDetected ? [loanDetected] : []}
      onConfirm={handleLoanConfirm}
    />
  </>
  );
};
