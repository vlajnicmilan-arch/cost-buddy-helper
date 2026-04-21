import { useState, useRef, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Plus, Save, ScanLine } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Category, Expense, PaymentSource, ReceiptItem, TransactionType, IncomeCategory } from '@/types/expense';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import { useCustomIncomeCategories } from '@/hooks/useCustomIncomeCategories';
import { useCustomCategories } from '@/hooks/useCustomCategories';
import { useCurrency, CURRENCIES } from '@/contexts/CurrencyContext';
import { useProjects } from '@/hooks/useProjects';
import { useBudgets } from '@/hooks/useBudgets';
import { useInstallments } from '@/hooks/useInstallments';
import { useReceiptScanner } from '@/hooks/useReceiptScanner';
import { useNativeCamera } from '@/hooks/useNativeCamera';
import { toast } from 'sonner';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { useTranslation } from 'react-i18next';
import { CustomIncomeCategoryDialog } from '@/components/custom-categories/CustomIncomeCategoryDialog';
import { DuplicateWarningDialog } from '@/components/DuplicateWarningDialog';
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
import { useBackButton } from '@/hooks/useBackButton';

import { ScannedDataPreview } from './ScannedDataPreview';
import { ManualExpenseForm } from './ManualExpenseForm';

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
  /** When true, automatically launches the camera/scan flow when the dialog opens. */
  autoScan?: boolean;
  /** Optional className applied to the trigger button (for grid layouts). */
  triggerClassName?: string;
  /** Optional override for the trigger button label. */
  triggerLabel?: string;
  /** Optional override for the trigger button icon. */
  triggerIcon?: ReactNode;
  /** Visual variant of the trigger button. */
  triggerVariant?: 'default' | 'scan';
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

export const AddExpenseDialog = ({
  onAdd,
  checkDuplicate,
  autoScan = false,
  triggerClassName,
  triggerLabel,
  triggerIcon,
  triggerVariant = 'default',
}: AddExpenseDialogProps) => {
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
  const [isInstallment, setIsInstallment] = useState(false);
  const [installmentCount, setInstallmentCount] = useState(12);
  const [firstPaymentDate, setFirstPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  
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
  const { customPaymentSources, refetch: refetchPaymentSources } = useCustomPaymentSources({ includePersonal: true });
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

  const [aiSuggesting, setAiSuggesting] = useState(false);
  const userManuallySetCategory = useRef(false);
  const cameraActiveRef = useRef(false);

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

  const handleMerchantChange = useCallback((value: string) => {
    setMerchantName(value);
    // Skip AI categorization for transfers — category is system-reserved
    if (value.trim().length >= 2 && type !== 'income' && type !== 'transfer') {
      const suggested = getSuggestedCategory(value);
      if (suggested) {
        setCategory(suggested as Category);
        userManuallySetCategory.current = false;
      } else if (!userManuallySetCategory.current) {
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

  const handleDescriptionChange = useCallback((value: string) => {
    setDescription(value);
    // Skip AI categorization for transfers — category is system-reserved
    if (value.trim().length >= 3 && type !== 'income' && type !== 'transfer' && !userManuallySetCategory.current) {
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

  // Register with global back-button system so Android popstate (e.g. when the
  // native camera activity returns) does NOT navigate the app to /home and
  // unmount this dialog mid-scan. The onClose callback respects the same
  // guards as onOpenChange below (scanning, preview, saving, camera active).
  const handleBackClose = useCallback(() => {
    if (scanning || showScannedPreview || isSaving || cameraActiveRef.current) return;
    setOpen(false);
  }, [scanning, showScannedPreview, isSaving]);
  useBackButton(open, handleBackClose, 10);

  useEffect(() => {
    if (open && customPaymentSources.length > 0 && paymentSource === 'cash') {
      setPaymentSource(`custom:${customPaymentSources[0].id}` as PaymentSource);
    }
  }, [open, customPaymentSources]);

  // Auto-launch scan when dialog opens with autoScan=true
  const autoScanTriggeredRef = useRef(false);
  useEffect(() => {
    if (!open) {
      autoScanTriggeredRef.current = false;
      return;
    }
    if (autoScan && !autoScanTriggeredRef.current && !scanning && !showScannedPreview) {
      autoScanTriggeredRef.current = true;
      // Small delay so the dialog is fully mounted before launching the camera
      const t = setTimeout(() => {
        if (isNative) {
          handleNativeCapture('camera', false);
        } else {
          cameraInputRef.current?.click();
        }
      }, 150);
      return () => clearTimeout(t);
    }
  }, [open, autoScan, isNative, scanning, showScannedPreview]);

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
      }
    }
  };

  const handleNativeCapture = async (source: 'camera' | 'gallery', multiMode = false) => {
    console.warn('📸 handleNativeCapture start', { source, multiMode, isNative });
    cameraActiveRef.current = true;
    try {
      const base64 = source === 'camera' ? await nativeTakePhoto() : await nativePickFromGallery();
      console.warn('📸 handleNativeCapture got base64?', !!base64, 'len=', base64?.length || 0);
      if (base64) {
        console.warn('📤 Sending to processImageBase64');
        await processImageBase64(base64, multiMode);
      }
    } catch (err: any) {
      console.error('📸 handleNativeCapture error:', err);
      showError(`Greška pri snimanju: ${err?.message || 'nepoznato'}`);
    } finally {
      // Slight delay so any popstate that fires on activity return is still blocked.
      setTimeout(() => { cameraActiveRef.current = false; }, 800);
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
    if (activeBusinessProfileId) {
      const missing: string[] = [];
      if (!scannedData.merchant?.trim()) missing.push('partner/trgovac');
      if (!scannedData.date) missing.push('datum');
      if (missing.length > 0) {
        showError(`Obavezna polja za poslovni mod: ${missing.join(', ')}. Uredi podatke prije spremanja.`);
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
        if (uploadedUrl) receiptUrl = uploadedUrl;
      }
      let finalPaymentSource: PaymentSource = paymentSource;
      let finalCardId: string | null = null;
      if (scannedData.custom_payment_source_id) {
        finalPaymentSource = `custom:${scannedData.custom_payment_source_id}` as PaymentSource;
        finalCardId = scannedData.payment_source_card_id;
      } else if (scannedData.payment_source) {
        finalPaymentSource = scannedData.payment_source;
      }
      const isTransfer = scannedData.transaction_type === 'transfer';
      const isIncome = scannedData.transaction_type === 'income';
      let transferDestinationId: string | undefined;
      if (isTransfer) {
        const destName = (scannedData.transfer_destination_name || scannedData.recipient_name || '').toLowerCase();
        if (destName) {
          const matchedDest = customPaymentSources.find(
            s => s.name.toLowerCase().includes(destName) || destName.includes(s.name.toLowerCase())
          );
          if (matchedDest) transferDestinationId = matchedDest.id;
        }
      }
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
        income_source_id: transferDestinationId || undefined,
        note: (isInstallment && scannedData.installment_count) 
          ? `${scannedData.installment_count}x rata${tipNote ? ' • ' + tipNote : ''}`
          : (tipNote || undefined),
        ...(scannedData.vat_rate != null && scannedData.vat_amount != null ? {
          vat_rate: scannedData.vat_rate,
          vat_amount: scannedData.vat_amount,
        } : {}),
      } as any;

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
          setPendingTransaction({ expense: newExpense, items: validItems.length > 0 ? validItems : undefined });
          setDuplicateWarningOpen(true);
          setIsSaving(false);
          return;
        }
      }

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
        await executeAdd(newExpense, validItems.length > 0 ? validItems : undefined);
        setIsSaving(false);
        return;
      }

      await executeAdd(newExpense, validItems.length > 0 ? validItems : undefined);
    } catch (error) {
      console.error('Error saving expense:', error);
      showError(t('transactions.saveError'));
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
      if (qty && price) newItems[index].total_price = qty * price;
    }
    setItems(newItems);
    const itemsTotal = newItems.reduce((sum, item) => sum + (Number(item.total_price) || 0), 0);
    if (itemsTotal > 0) setAmount(itemsTotal.toFixed(2));
  };

  const removeItem = (index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);
    const itemsTotal = newItems.reduce((sum, item) => sum + (Number(item.total_price) || 0), 0);
    if (itemsTotal > 0) setAmount(itemsTotal.toFixed(2));
  };

  const resetForm = () => {
    setAmount('');
    setDescription('');
    setCategory('food');
    userManuallySetCategory.current = false;
    setAiSuggesting(false);
    cancelAICategorize();
    setMerchantName('');
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
    setIsInstallment(false);
    setInstallmentCount(12);
    setFirstPaymentDate(new Date().toISOString().split('T')[0]);
    setTransferDestination(null);
    setTotalWithTip('');
    setLocationName(null);
    setLocationCoords(null);
  };

  const executeAdd = async (
    expense: Omit<Expense, 'id' | 'user_id' | 'created_at' | 'updated_at'>,
    validItems?: ReceiptItem[]
  ) => {
    try {
      const expenseWithLocation = {
        ...expense,
        ...(locationName ? { location_name: locationName, location_coords: locationCoords } : {}),
      };
      await onAdd(expenseWithLocation, validItems);
      successVibration();
      maybeRequestReview();
      if (expense.merchant_name && expense.category && expense.type !== 'transfer') {
        recordHabit(expense.merchant_name, expense.category);
      }
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
      setOpen(false);
      setTimeout(() => resetForm(), 150);
    } catch (error) {
      console.error('Error saving transaction:', error);
      showError(t('transactions.saveError') || 'Greška pri spremanju transakcije.');
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
    showSuccess(`Pozajmica dodana u evidenciju dugovanja`);
    setLoanDetected(null);
  };

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
        showError(t('limits.transactionsReached', `Dosegnuli ste limit od ${FREE_LIMITS.transactions_per_month} transakcija mjesečno. Nadogradite na Pro za neograničene transakcije.`));
        return;
      }
    }

    const parsedAmount = parseFloat(amount);

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
        showSuccess(t('transactions.receiptSaved'));
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
        setPendingTransaction({ expense: newExpense, items: validItems.length > 0 ? validItems : undefined });
        setDuplicateWarningOpen(true);
        return;
      }
    }

    await executeAdd(newExpense, validItems.length > 0 ? validItems : undefined);
  };

  const handleGetLocation = async () => {
    if (locationName) {
      setLocationName(null);
      setLocationCoords(null);
    } else {
      const loc = await getCurrentLocation();
      if (loc) {
        setLocationName(loc.name);
        setLocationCoords(loc.coords);
        showSuccess(t('transactions.locationAdded', 'Lokacija dodana'));
      } else {
        showError(t('transactions.locationError', 'Nije moguće dohvatiti lokaciju'));
      }
    }
  };

  const handleCategoryChange = useCallback((value: Category | IncomeCategory) => {
    userManuallySetCategory.current = true;
    setCategory(value);
  }, []);

  return (
    <>
    <Dialog open={open} onOpenChange={(isOpen) => {
      console.warn('🚪 AddExpenseDialog onOpenChange', { isOpen, scanning, showScannedPreview, isSaving, cameraActive: cameraActiveRef.current });
      if (!isOpen && (scanning || showScannedPreview || isSaving || cameraActiveRef.current)) return;
      setOpen(isOpen);
      if (isOpen) {
        refetchPaymentSources().then(() => {
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
        <Button
          className={cn(
            'gap-2 rounded-xl shadow-lg',
            triggerVariant === 'scan'
              ? 'bg-ai hover:bg-ai/90 text-ai-foreground shadow-ai/20'
              : 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-primary/20',
            triggerClassName,
          )}
        >
          {triggerIcon ?? (triggerVariant === 'scan' ? <ScanLine className="w-5 h-5" /> : <Plus className="w-5 h-5" />)}
          {triggerLabel ?? t('common.add')}
        </Button>
      </DialogTrigger>
      <DialogContent 
        showBackButton={false} 
        className="sm:max-w-md glass-card border-border/50 h-[85vh] flex flex-col"
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => {
          if (scanning || showScannedPreview || isSaving) e.preventDefault();
        }}
      >
        <DialogHeader className="flex-shrink-0 pb-2">
          <DialogTitle className="text-xl font-semibold">{t('transactions.newTransaction')}</DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto -mx-6 px-6 relative">
          <ScanningOverlay visible={scanning} imageCount={receiptImages.length || 1} />
          
          {showScannedPreview && scannedData && (
            <ScannedDataPreview
              scannedData={scannedData}
              onScannedDataChange={setScannedData}
              receiptImage={receiptImage}
              receiptImages={receiptImages}
              customPaymentSources={customPaymentSources}
              customCategories={customCategories}
              projects={projects}
              budgets={budgets}
              selectedProjectId={selectedProjectId}
              onSelectedProjectIdChange={setSelectedProjectId}
              selectedBudgetId={selectedBudgetId}
              onSelectedBudgetIdChange={setSelectedBudgetId}
              expenseNature={expenseNature}
              onExpenseNatureChange={setExpenseNature}
              totalWithTip={totalWithTip}
              onTotalWithTipChange={setTotalWithTip}
              saveReceipt={saveReceipt}
              onSaveReceiptChange={setSaveReceipt}
              isSaving={isSaving}
              onAccept={acceptScannedData}
              onReject={rejectScannedData}
            />
          )}

          {!showScannedPreview && (
            <ManualExpenseForm
              type={type}
              onTypeChange={setType}
              merchantName={merchantName}
              onMerchantChange={handleMerchantChange}
              paymentSource={paymentSource}
              onPaymentSourceChange={setPaymentSource}
              selectedCardId={selectedCardId}
              onSelectedCardIdChange={setSelectedCardId}
              customPaymentSources={customPaymentSources}
              transferDestination={transferDestination}
              onTransferDestinationChange={setTransferDestination}
              expenseDate={expenseDate}
              onExpenseDateChange={setExpenseDate}
              isInstallment={isInstallment}
              onIsInstallmentChange={setIsInstallment}
              installmentCount={installmentCount}
              onInstallmentCountChange={setInstallmentCount}
              firstPaymentDate={firstPaymentDate}
              onFirstPaymentDateChange={setFirstPaymentDate}
              projects={projects}
              budgets={budgets}
              selectedProjectId={selectedProjectId}
              onSelectedProjectIdChange={setSelectedProjectId}
              selectedBudgetId={selectedBudgetId}
              onSelectedBudgetIdChange={setSelectedBudgetId}
              expenseNature={expenseNature}
              onExpenseNatureChange={setExpenseNature}
              locationName={locationName}
              locationLoading={locationLoading}
              onGetLocation={handleGetLocation}
              onClearLocation={() => { setLocationName(null); setLocationCoords(null); }}
              items={items}
              showItems={showItems}
              onShowItemsChange={setShowItems}
              onAddItem={addItem}
              onUpdateItem={updateItem}
              onRemoveItem={removeItem}
              amount={amount}
              onAmountChange={setAmount}
              selectedSourceCurrency={selectedSourceCurrency}
              description={description}
              onDescriptionChange={handleDescriptionChange}
              category={category}
              onCategoryChange={handleCategoryChange}
              aiSuggesting={aiSuggesting}
              customCategories={customCategories}
              customIncomeCategories={customIncomeCategories}
              onAddIncomeCategoryClick={() => setIncomeCategoryDialogOpen(true)}
              note={note}
              onNoteChange={setNote}
              receiptImage={receiptImage}
              saveReceipt={saveReceipt}
              onSaveReceiptChange={setSaveReceipt}
              scannedData={scannedData}
              scanning={scanning}
              showMultiImageCollector={showMultiImageCollector}
              receiptImages={receiptImages}
              isNative={isNative}
              onNativeCapture={handleNativeCapture}
              onImageCapture={handleImageCapture}
              onScanMultipleImages={handleScanMultipleImages}
              onToggleMultiMode={() => setShowMultiImageCollector(true)}
              onRemoveReceiptImage={(idx) => setReceiptImages(prev => prev.filter((_, i) => i !== idx))}
              cameraInputRef={cameraInputRef}
              galleryInputRef={galleryInputRef}
              multiCameraInputRef={multiCameraInputRef}
              multiGalleryInputRef={multiGalleryInputRef}
              onSubmit={handleSubmit}
            />
          )}
        </div>
        
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

    <LoanDetectionDialog
      open={loanDialogOpen}
      onOpenChange={setLoanDialogOpen}
      detectedLoans={loanDetected ? [loanDetected] : []}
      onConfirm={handleLoanConfirm}
    />
  </>
  );
};
