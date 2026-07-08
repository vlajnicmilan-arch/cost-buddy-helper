import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { validateAmountInput } from '@/lib/amountValidation';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Loader2, Plus, FolderKanban, PiggyBank, MapPin, X, Smartphone, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { Category, CATEGORIES, PaymentSource, PAYMENT_SOURCES, PAYMENT_SOURCE_GROUPS, ReceiptItem, TransactionType, IncomeCategory, INCOME_CATEGORIES } from '@/types/expense';
import { CustomPaymentSource } from '@/types/customPaymentSource';
import { CustomCategory } from '@/types/customCategory';
import { CustomIncomeCategory } from '@/types/customIncomeCategory';
import { ReceiptCaptureButtons } from './ReceiptCaptureButtons';
import { AdvanceLinkSection } from './AdvanceLinkSection';
import { QuickAddCategoryInline } from './QuickAddCategoryInline';
import { PaymentSourceSelector } from './PaymentSourceSelector';
import { PaymentSourceOptions } from './PaymentSourceOptions';
import { ExpenseItemsList } from './ExpenseItemsList';
import { InstallmentToggle } from '@/components/installments';
import { useCurrency, CURRENCIES } from '@/contexts/CurrencyContext';
import { useAppState } from '@/contexts/AppStateContext';
import { VoiceInputButton } from '@/components/VoiceInputButton';
import { getDateRange, toInputDate, clampInputDate, getDateValidationKey } from '@/lib/dateValidation';
import { showError } from '@/hooks/useStatusFeedback';


interface ManualExpenseFormProps {
  // Type
  type: TransactionType;
  onTypeChange: (type: TransactionType) => void;
  // Merchant
  merchantName: string;
  onMerchantChange: (value: string) => void;
  // Payment source
  paymentSource: PaymentSource;
  onPaymentSourceChange: (source: PaymentSource) => void;
  selectedCardId: string | null;
  onSelectedCardIdChange: (id: string | null) => void;
  customPaymentSources: CustomPaymentSource[];
  // Transfer destination
  transferDestination: string | null;
  onTransferDestinationChange: (value: string | null) => void;
  // Date
  expenseDate: string;
  onExpenseDateChange: (value: string) => void;
  // Installments
  isInstallment: boolean;
  onIsInstallmentChange: (value: boolean) => void;
  installmentCount: number;
  onInstallmentCountChange: (value: number) => void;
  firstPaymentDate: string;
  onFirstPaymentDateChange: (value: string) => void;
  // Project/Budget
  projects: { id: string; name: string; color?: string | null; icon?: string | null }[];
  budgets: { id: string; name: string; color?: string | null; icon?: string | null; is_active?: boolean | null }[];
  selectedProjectId: string | null;
  onSelectedProjectIdChange: (id: string | null) => void;
  selectedBudgetId: string | null;
  onSelectedBudgetIdChange: (id: string | null) => void;
  expenseNature: 'regular' | 'extraordinary';
  onExpenseNatureChange: (nature: 'regular' | 'extraordinary') => void;
  // Collaborator advances (see mem://features/collaborator-advances)
  isAdvance: boolean;
  onIsAdvanceChange: (v: boolean) => void;
  collaboratorId: string | null;
  onCollaboratorIdChange: (id: string | null) => void;
  linkedAdvanceIds: string[];
  onLinkedAdvanceIdsChange: (ids: string[]) => void;
  // Location
  locationName: string | null;
  locationLoading: boolean;
  onGetLocation: () => void;
  onClearLocation: () => void;
  // Items
  items: ReceiptItem[];
  showItems: boolean;
  onShowItemsChange: (show: boolean) => void;
  onAddItem: () => void;
  onUpdateItem: (index: number, field: keyof ReceiptItem, value: string | number) => void;
  onRemoveItem: (index: number) => void;
  // Amount
  amount: string;
  onAmountChange: (value: string) => void;
  selectedSourceCurrency: string;
  // Description
  description: string;
  onDescriptionChange: (value: string) => void;
  // Category
  category: Category | IncomeCategory;
  onCategoryChange: (value: Category | IncomeCategory) => void;
  aiSuggesting: boolean;
  customCategories: CustomCategory[];
  customIncomeCategories: CustomIncomeCategory[];
  /** Inline quick-add panel state. */
  quickAddCategoryMode: 'expense' | 'income' | null;
  onRequestQuickAddCategory: (mode: 'expense' | 'income') => void;
  onCancelQuickAddCategory: () => void;
  onCreateQuickCategory: (
    mode: 'expense' | 'income',
    data: { name: string; icon: string; color: string }
  ) => Promise<string | null>;
  // Note
  note: string;
  onNoteChange: (value: string) => void;
  // Receipt
  receiptImage: string | null;
  saveReceipt: boolean;
  onSaveReceiptChange: (value: boolean) => void;
  scannedData: any;
  scanning: boolean;
  // Receipt capture
  showMultiImageCollector: boolean;
  receiptImages: string[];
  isNative: boolean;
  onNativeCapture: (source: 'camera' | 'gallery', multiMode?: boolean) => void;
  onImageCapture: (event: React.ChangeEvent<HTMLInputElement>, multiMode?: boolean) => void;
  onOpenFileInputCapture: (inputRef: React.RefObject<HTMLInputElement>) => void;
  onScanMultipleImages: () => void;
  onToggleMultiMode: () => void;
  onRemoveReceiptImage: (index: number) => void;
  cameraInputRef: React.RefObject<HTMLInputElement>;
  galleryInputRef: React.RefObject<HTMLInputElement>;
  multiCameraInputRef: React.RefObject<HTMLInputElement>;
  multiGalleryInputRef: React.RefObject<HTMLInputElement>;
  // Submit
  onSubmit: (e: React.FormEvent) => void;
}

export const ManualExpenseForm = (props: ManualExpenseFormProps) => {
  const { t } = useTranslation();
  const { projectsModuleEnabled } = useAppState();
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <form onSubmit={props.onSubmit} className="space-y-5 pb-4">
      {/* Receipt Scan Buttons */}
      <ReceiptCaptureButtons
        scanning={props.scanning}
        showMultiImageCollector={props.showMultiImageCollector}
        receiptImages={props.receiptImages}
        isNative={props.isNative}
        onNativeCapture={props.onNativeCapture}
        onImageCapture={props.onImageCapture}
        onOpenFileInputCapture={props.onOpenFileInputCapture}
        onScanMultipleImages={props.onScanMultipleImages}
        onToggleMultiMode={props.onToggleMultiMode}
        onRemoveImage={props.onRemoveReceiptImage}
        cameraInputRef={props.cameraInputRef}
        galleryInputRef={props.galleryInputRef}
        multiCameraInputRef={props.multiCameraInputRef}
        multiGalleryInputRef={props.multiGalleryInputRef}
      />

      {props.scanning && (
        <div className="text-center py-4 text-muted-foreground text-sm">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
          {t('scanner.analyzing')}
        </div>
      )}

      {/* Receipt Image Preview (after acceptance) */}
      {props.receiptImage && !props.scanning && props.scannedData && (
        <div className="space-y-2">
          <div className="relative rounded-xl overflow-hidden bg-muted/50 p-2">
            <img 
              src={props.receiptImage} 
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
          onClick={() => props.onTypeChange('expense')}
          className={cn(
            "flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all",
            props.type === 'expense' 
              ? "bg-expense text-expense-foreground shadow-sm" 
              : "text-[hsl(var(--expense))] bg-[hsl(var(--expense)/0.1)] hover:bg-[hsl(var(--expense)/0.18)]"
          )}
        >
          {t('transactions.expense')}
        </button>
        <button
          type="button"
          onClick={() => props.onTypeChange('income')}
          className={cn(
            "flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all",
            props.type === 'income' 
              ? "bg-income text-income-foreground shadow-sm" 
              : "text-[hsl(var(--income))] bg-[hsl(var(--income)/0.1)] hover:bg-[hsl(var(--income)/0.18)]"
          )}
        >
          {t('transactions.income')}
        </button>
        <button
          type="button"
          onClick={() => props.onTypeChange('transfer')}
          className={cn(
            "flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all",
            props.type === 'transfer' 
              ? "bg-primary text-primary-foreground shadow-sm" 
              : "text-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.1)] hover:bg-[hsl(var(--primary)/0.18)]"
          )}
        >
          🔄
        </button>
      </div>
      {props.type === 'transfer' && (
        <p className="text-xs text-muted-foreground text-center">
          {t('transactions.transferNote')}
        </p>
      )}

      {/* Merchant */}
      <div className="space-y-2">
        <Label htmlFor="merchant" className="text-sm font-medium">
          {props.type === 'income' ? t('transactions.merchantSource') : t('transactions.merchantStore')}
        </Label>
        <Input
          id="merchant"
          placeholder={props.type === 'income' ? t('transactions.merchantSourcePlaceholder') : t('transactions.merchantPlaceholder')}
          value={props.merchantName}
          onChange={(e) => props.onMerchantChange(e.target.value)}
          className="h-12 rounded-xl"
        />
      </div>

      {/* Payment Source */}
      <PaymentSourceSelector
        type={props.type}
        paymentSource={props.paymentSource}
        onPaymentSourceChange={props.onPaymentSourceChange}
        selectedCardId={props.selectedCardId}
        onSelectedCardIdChange={props.onSelectedCardIdChange}
        customPaymentSources={props.customPaymentSources}
      />

      {/* Transfer Destination */}
      {props.type === 'transfer' && (
        <div className="space-y-3">
          <Label className="text-sm font-medium">📥 Na račun (kamo)</Label>
          <Select
            value={props.transferDestination ? (props.customPaymentSources.some(s => s.id === props.transferDestination) ? `custom:${props.transferDestination}` : props.transferDestination) : 'none'}
            onValueChange={(value) => {
              if (value === 'none') return props.onTransferDestinationChange(null);
              const stripped = value.startsWith('custom:') ? value.slice(7) : value;
              props.onTransferDestinationChange(stripped);
            }}
          >
            <SelectTrigger className="h-12 rounded-xl bg-background">
              <SelectValue placeholder={t('placeholders.selectDestinationAccount')}>
                {(() => {
                  if (!props.transferDestination) return t('placeholders.selectDestinationAccount');
                  const customSource = props.customPaymentSources.find(s => s.id === props.transferDestination);
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
                  const standardSource = PAYMENT_SOURCES.find(s => s.id === props.transferDestination);
                  if (standardSource) {
                    return (
                      <span className="flex items-center gap-2">
                        <span>{standardSource.icon}</span>
                        <span>{standardSource.name}</span>
                      </span>
                    );
                  }
                  return t('placeholders.selectDestinationAccount');
                })()}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="bg-popover z-50 max-h-[300px]">
              <SelectItem value="none">
                <span className="text-muted-foreground">{t('placeholders.noDestination')}</span>
              </SelectItem>
              <PaymentSourceOptions
                customPaymentSources={props.customPaymentSources}
                currentValue={props.transferDestination}
                excludeId={props.paymentSource}
              />
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Visual Transfer Flow */}
      {props.type === 'transfer' && props.paymentSource && props.transferDestination && (
        <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 flex items-center justify-center gap-3">
          {(() => {
            const fromCustom = props.customPaymentSources.find(s => s.id === props.paymentSource);
            const fromStandard = PAYMENT_SOURCES.find(s => s.id === props.paymentSource);
            const toCustom = props.customPaymentSources.find(s => s.id === props.transferDestination);
            const toStandard = PAYMENT_SOURCES.find(s => s.id === props.transferDestination);
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
        {(() => {
          const dateRange = getDateRange('transactionDynamic', props.type as any);
          return (
            <Input
              id="date"
              type="date"
              value={props.expenseDate}
              min={toInputDate(dateRange.min)}
              max={toInputDate(dateRange.max)}
              onChange={(e) => props.onExpenseDateChange(e.target.value)}
              onBlur={(e) => {
                const v = e.target.value;
                if (!v) return;
                const errKey = getDateValidationKey(v, dateRange);
                if (errKey) {
                  const clamped = clampInputDate(v, dateRange);
                  props.onExpenseDateChange(clamped);
                  showError(t(errKey));
                }
              }}
              className="h-12 rounded-xl"
            />
          );
        })()}
      </div>

      {/* Advanced Options - Collapsible */}
      <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown className={cn("w-4 h-4 transition-transform", showAdvanced && "rotate-180")} />
            {showAdvanced ? t('form.lessOptions') : t('form.moreOptions')}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-5">
          {/* Installment Toggle */}
          {props.type !== 'transfer' && (
            <InstallmentToggle
              enabled={props.isInstallment}
              onEnabledChange={props.onIsInstallmentChange}
              installmentCount={props.installmentCount}
              onInstallmentCountChange={props.onInstallmentCountChange}
              firstPaymentDate={props.firstPaymentDate}
              onFirstPaymentDateChange={props.onFirstPaymentDateChange}
              totalAmount={parseFloat(props.amount) || 0}
            />
          )}

          {/* Project Assignment */}
          {/* Project Assignment — Faza 1 modularnog UI-a: gated by Projects modul */}
          {projectsModuleEnabled && props.projects.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                <FolderKanban className="w-4 h-4" />
                {t('transactions.assignToProject')}
              </Label>
              <Select 
                value={props.selectedProjectId || 'none'} 
                onValueChange={(v) => props.onSelectedProjectIdChange(v === 'none' ? null : v)}
              >
                <SelectTrigger className="h-12 rounded-xl bg-background">
                  <SelectValue placeholder={t('transactions.noProject')} />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  <SelectItem value="none">
                    <span className="text-muted-foreground">{t('transactions.noProject')}</span>
                  </SelectItem>
                  {props.projects.map((project) => (
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

          {/* Budget Assignment */}
          {props.type === 'expense' && props.budgets.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                <PiggyBank className="w-4 h-4" />
                {t('transactions.assignToBudget', 'Pridruži budžetu')}
              </Label>
              <Select 
                value={props.selectedBudgetId || 'none'} 
                onValueChange={(v) => props.onSelectedBudgetIdChange(v === 'none' ? null : v)}
              >
                <SelectTrigger className="h-12 rounded-xl bg-background">
                  <SelectValue placeholder={t('transactions.noBudget', 'Bez budžeta')} />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  <SelectItem value="none">
                    <span className="text-muted-foreground">{t('transactions.noBudget', 'Bez budžeta')}</span>
                  </SelectItem>
                  {props.budgets.filter(b => b.is_active).map((budget) => (
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

          {/* Expense Nature */}
          {(props.selectedProjectId || props.selectedBudgetId) && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t('transactions.expenseNature', 'Vrsta troška')}</Label>
              <div className="flex gap-2 p-1 bg-muted rounded-xl">
                <button
                  type="button"
                  onClick={() => props.onExpenseNatureChange('regular')}
                  className={cn(
                    "flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all",
                    props.expenseNature === 'regular'
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t('transactions.regular', 'Redovan')}
                </button>
                <button
                  type="button"
                  onClick={() => props.onExpenseNatureChange('extraordinary')}
                  className={cn(
                    "flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all",
                    props.expenseNature === 'extraordinary'
                      ? "bg-amber-500 text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t('transactions.extraordinary', 'Vanredan')}
                </button>
              </div>
            </div>
          )}

          {/* Collaborator advance section — Faza 1 modularnog UI-a: ovisi o projektima */}
          {projectsModuleEnabled && props.selectedProjectId && props.type === 'expense' && (
            <AdvanceLinkSection
              projectId={props.selectedProjectId}
              type={props.type}
              amount={props.amount}
              isAdvance={props.isAdvance}
              onIsAdvanceChange={props.onIsAdvanceChange}
              collaboratorId={props.collaboratorId}
              onCollaboratorIdChange={props.onCollaboratorIdChange}
              linkedAdvanceIds={props.linkedAdvanceIds}
              onLinkedAdvanceIdsChange={props.onLinkedAdvanceIdsChange}
            />
          )}

          {/* Location toggle */}
          <div className="flex items-center justify-between p-2 bg-muted/30 rounded-xl">
            <button
              type="button"
              onClick={props.onGetLocation}
              className="flex items-center gap-2 text-sm"
            >
              <MapPin className={cn("w-4 h-4", props.locationName ? "text-primary" : "text-muted-foreground")} />
              {props.locationLoading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : props.locationName ? (
                <span className="text-primary text-xs truncate max-w-[200px]">{props.locationName}</span>
              ) : (
                <span className="text-muted-foreground text-xs">{t('transactions.addLocation', 'Dodaj lokaciju')}</span>
              )}
            </button>
            {props.locationName && (
              <button
                type="button"
                onClick={props.onClearLocation}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Items */}
      {props.type === 'expense' && (
        <ExpenseItemsList
          items={props.items}
          showItems={props.showItems}
          onShowItemsChange={props.onShowItemsChange}
          onAddItem={props.onAddItem}
          onUpdateItem={props.onUpdateItem}
          onRemoveItem={props.onRemoveItem}
        />
      )}

      {/* Amount */}
      <div className="space-y-2">
        <Label htmlFor="amount" className="text-sm font-medium">
          {`${t('common.amount')} (${props.selectedSourceCurrency})`}
          {props.items.length > 0 && (
            <span className="text-xs text-muted-foreground ml-2">
              ({t('common.total').toLowerCase()})
            </span>
          )}
        </Label>
        <MoneyInput
          id="amount"
          data-testid="manual-expense-amount"
          placeholder="0,00"
          value={props.amount}
          onChange={(e) => props.onAmountChange(e.target.value)}
          className={cn(
            "h-12 text-lg font-mono rounded-xl",
            props.amount !== '' && !validateAmountInput(props.amount).valid && "border-destructive focus-visible:ring-destructive"
          )}
          required
          aria-invalid={props.amount !== '' && !validateAmountInput(props.amount).valid}
          aria-describedby="amount-hint amount-error"
        />
        {props.amount !== '' && !validateAmountInput(props.amount).valid ? (
          <p id="amount-error" className="text-xs text-destructive">
            {t('validation.amountGreaterThanZero')}
          </p>
        ) : (
          <p id="amount-hint" className="text-xs text-muted-foreground">
            {t('transactions.amountHint')}
          </p>
        )}
      </div>


      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="description" className="text-sm font-medium">{t('common.description')}</Label>
        <div className="relative">
          <Input
            id="description"
            data-testid="manual-expense-description"
            placeholder={props.type === 'transfer' ? t('transactions.transferDescriptionPlaceholder') : t('transactions.descriptionPlaceholder')}
            value={props.description}
            onChange={(e) => props.onDescriptionChange(e.target.value)}
            className="h-12 rounded-xl pr-12"
          />
          <VoiceInputButton
            value={props.description}
            onChange={props.onDescriptionChange}
            className="absolute top-1/2 -translate-y-1/2 right-2"
          />
        </div>
        {props.type === 'transfer' && (
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            💡 {t('transactions.transferCategoryHint')}
          </p>
        )}
      </div>

      {/* Category - expense */}
      {props.type === 'expense' && (
        <div className="space-y-2">
          <Label className="text-sm font-medium flex items-center gap-1.5">
            {t('common.category')}
            {props.aiSuggesting && (
              <span className="text-[10px] text-primary animate-pulse">✨ AI...</span>
            )}
          </Label>
          <Select 
            value={props.category} 
            onValueChange={(v) => {
              if (v === '__add_new__') {
                // Defer so Select closes cleanly before inline panel opens
                setTimeout(() => props.onRequestQuickAddCategory('expense'), 0);
                return;
              }
              props.onCategoryChange(v as Category);
            }}
          >
            <SelectTrigger className="h-12 rounded-xl bg-background">
              <SelectValue placeholder={t('common.category')} />
            </SelectTrigger>
            <SelectContent className="bg-popover z-50 max-h-[300px]" scrollToTopOnOpen>
              <div className="border-b border-border mb-1 pb-1">
                <SelectItem value="__add_new__" className="text-primary">
                  <span className="flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    <span>{t('categories.quickAdd.button', '+ Nova kategorija')}</span>
                  </span>
                </SelectItem>
              </div>
              {props.customCategories.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {t('transactions.customSources', 'Prilagođene')}
                  </div>
                  {props.customCategories.map((cat) => (
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
          {props.quickAddCategoryMode === 'expense' && (
            <QuickAddCategoryInline
              mode="expense"
              existingNames={[
                ...props.customCategories.map((c) => c.name.trim().toLowerCase()),
                ...CATEGORIES.map((c) => t(`categories.${c.id}`).toLowerCase()),
              ]}
              onCreate={async (data) => {
                const id = await props.onCreateQuickCategory('expense', data);
                return id;
              }}
              onCancel={props.onCancelQuickAddCategory}
            />
          )}
        </div>
      )}

      {/* Income Category */}
      {props.type === 'income' && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">{t('common.category')}</Label>
          <Select 
            value={props.category} 
            onValueChange={(v) => {
              if (v === '__add_new__') {
                setTimeout(() => props.onRequestQuickAddCategory('income'), 0);
                return;
              }
              props.onCategoryChange(v as IncomeCategory);
            }}
          >
            <SelectTrigger className="h-12 rounded-xl bg-background">
              <SelectValue placeholder={t('common.category')} />
            </SelectTrigger>
            <SelectContent className="bg-popover z-50 max-h-[300px]" scrollToTopOnOpen>
              <div className="border-b border-border mb-1 pb-1">
                <SelectItem value="__add_new__" className="text-primary">
                  <span className="flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    <span>{t('categories.quickAdd.button', '+ Nova kategorija')}</span>
                  </span>
                </SelectItem>
              </div>
              {props.customIncomeCategories.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {t('transactions.customSources')}
                  </div>
                  {props.customIncomeCategories.map((cat) => (
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
            </SelectContent>
          </Select>
          {props.quickAddCategoryMode === 'income' && (
            <QuickAddCategoryInline
              mode="income"
              existingNames={[
                ...props.customIncomeCategories.map((c) => c.name.trim().toLowerCase()),
                ...INCOME_CATEGORIES.map((c) => t(`incomeCategories.${c.id}`).toLowerCase()),
              ]}
              onCreate={async (data) => {
                const id = await props.onCreateQuickCategory('income', data);
                return id;
              }}
              onCancel={props.onCancelQuickAddCategory}
            />
          )}
        </div>
      )}

      {/* Note */}
      <div className="space-y-2">
        <Label htmlFor="note" className="text-sm font-medium">{t('common.note', 'Bilješka')}</Label>
        <Input
          id="note"
          placeholder={t('transactions.notePlaceholder', 'Dodatna bilješka...')}
          value={props.note}
          onChange={(e) => props.onNoteChange(e.target.value)}
          className="h-12 rounded-xl"
        />
      </div>

      {/* Save Receipt Option */}
      {props.receiptImage && (
        <div>
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="save-receipt" 
              checked={props.saveReceipt}
              onCheckedChange={(checked) => props.onSaveReceiptChange(checked as boolean)}
            />
            <label 
              htmlFor="save-receipt" 
              className="text-sm text-muted-foreground cursor-pointer flex items-center gap-1"
            >
              <Smartphone className="w-3 h-3" />
              {t('scanner.saveImage')}
            </label>
          </div>
          {props.saveReceipt && (
            <p className="text-xs text-muted-foreground/70 ml-4 mt-1">{t('scanner.saveImageHint')}</p>
          )}
        </div>
      )}
    </form>
  );
};
