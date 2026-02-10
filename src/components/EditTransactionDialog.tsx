import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Expense, Category, PaymentSource, CATEGORIES, PAYMENT_SOURCE_GROUPS, TransactionType, getPaymentSourceInfo, IncomeCategory, INCOME_CATEGORIES } from '@/types/expense';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import { useCustomIncomeCategories } from '@/hooks/useCustomIncomeCategories';
import { useCustomCategories } from '@/hooks/useCustomCategories';
import { useProjects } from '@/hooks/useProjects';
import { useBudgets } from '@/hooks/useBudgets';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Loader2, Plus, FolderKanban, PiggyBank } from 'lucide-react';
import { format } from 'date-fns';
import { hr, enUS, de } from 'date-fns/locale';
import { cn } from '@/lib/utils';

import { useTranslation } from 'react-i18next';
import { CustomIncomeCategoryDialog } from '@/components/custom-categories/CustomIncomeCategoryDialog';

interface EditTransactionDialogProps {
  expense: Expense | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (expense: Expense) => Promise<void>;
}

export const EditTransactionDialog = ({ expense, open, onOpenChange, onSave }: EditTransactionDialogProps) => {
  const { t, i18n } = useTranslation();
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Category | IncomeCategory>('other');
  const [paymentSource, setPaymentSource] = useState<PaymentSource>('cash');
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [date, setDate] = useState<Date>(new Date());
  const [type, setType] = useState<TransactionType>('expense');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedBudgetId, setSelectedBudgetId] = useState<string | null>(null);
  
  const [note, setNote] = useState<string>('');
  const [saving, setSaving] = useState(false);

  
  const { customPaymentSources } = useCustomPaymentSources();
  const { customIncomeCategories, addCustomIncomeCategory, refetch: refetchIncomeCategories } = useCustomIncomeCategories();
  const { customCategories } = useCustomCategories();
  const { projects } = useProjects();
  const { budgets } = useBudgets();
  const [incomeCategoryDialogOpen, setIncomeCategoryDialogOpen] = useState(false);

  // Get date locale based on current language
  const dateLocale = i18n.language === 'de' ? de : i18n.language === 'en' ? enUS : hr;

  // Normalize payment source - strip "custom:" prefix for select matching
  const normalizedPaymentSource = paymentSource?.startsWith('custom:') 
    ? paymentSource.replace('custom:', '') 
    : paymentSource;

  // Get cards for currently selected custom payment source
  const selectedSource = customPaymentSources.find(s => s.id === normalizedPaymentSource);
  const availableCards = selectedSource?.cards || [];

  // Initialize form when dialog opens or expense changes
  useEffect(() => {
    if (open && expense) {
      try {
        setAmount(expense.amount?.toString() || '0');
        setDescription(expense.description || '');
        setCategory(expense.category || 'other');
        // Normalize "custom:UUID" to just "UUID" for select matching
        const ps = expense.payment_source || 'cash';
        setPaymentSource((ps.startsWith('custom:') ? ps.replace('custom:', '') : ps) as PaymentSource);
        setSelectedCardId(expense.payment_source_card_id || null);
        // Safe date parsing
        const parsedDate = expense.date instanceof Date ? expense.date : new Date(expense.date);
        setDate(isNaN(parsedDate.getTime()) ? new Date() : parsedDate);
        setType(expense.type || 'expense');
        setSelectedProjectId(expense.project_id || null);
        setSelectedBudgetId(expense.budget_id || null);
        setNote(expense.note || '');
      } catch (err) {
        console.error('Error initializing edit form:', err);
        // Set safe defaults
        setDate(new Date());
        setCategory('other');
        setPaymentSource('cash');
      }
    }
  }, [open, expense]);

  const handleSave = async () => {
    if (!expense) return;
    
    setSaving(true);
    try {
      // Re-add "custom:" prefix if payment source is a custom source UUID
      const isCustomSource = customPaymentSources.some(s => s.id === paymentSource);
      const finalPaymentSource = isCustomSource ? `custom:${paymentSource}` : paymentSource;
      
      console.log('EditTransactionDialog saving:', {
        id: expense.id,
        paymentSource,
        isCustomSource,
        finalPaymentSource,
        amount: parseFloat(amount),
        category,
        type,
      });

      await onSave({
        ...expense,
        amount: parseFloat(amount),
        description,
        category,
        payment_source: finalPaymentSource as PaymentSource,
        payment_source_card_id: selectedCardId,
        date,
        type,
        project_id: selectedProjectId,
        budget_id: selectedBudgetId,
        note: note.trim() || null,
        updated_at: new Date().toISOString()
      });
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving transaction:', error);
      const { toast } = await import('sonner');
      toast.error('Greška pri spremanju. Pokušaj ponovno.');
    } finally {
      setSaving(false);
    }
  };

  // Get dialog title based on transaction type
  const getDialogTitle = () => {
    if (type === 'income') return t('transactions.editIncome');
    if (type === 'transfer') return t('transactions.editTransfer');
    return t('transactions.editExpense');
  };

  if (!expense) return null;

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showBackButton={false} className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{getDialogTitle()}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Type Toggle */}
          <div className="space-y-2">
            <Label>{t('transactions.type')}</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={type === 'expense' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setType('expense')}
              >
                {t('transactions.expense')}
              </Button>
              <Button
                type="button"
                variant={type === 'income' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setType('income')}
              >
                {t('transactions.income')}
              </Button>
              <Button
                type="button"
                variant={type === 'transfer' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setType('transfer')}
              >
                🔄
              </Button>
            </div>
            {type === 'transfer' && (
              <p className="text-xs text-muted-foreground">
                {t('transactions.transferNote')}
              </p>
            )}
          </div>


          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="amount">{t('transactions.amountEur')}</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">{t('common.description')}</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('transactions.descriptionPlaceholder')}
            />
          </div>

          {/* Category - Different label and options for income */}
          <div className="space-y-2">
            <Label>{type === 'income' ? t('transactions.incomeCategory') : t('common.category')}</Label>
            <Select 
              value={category} 
              onValueChange={(v) => {
                if (v === '__add_new__') {
                  setIncomeCategoryDialogOpen(true);
                } else {
                  setCategory(v as Category | IncomeCategory);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue>
                  {(() => {
                    if (type === 'income') {
                      const customCat = customIncomeCategories.find(c => c.id === category);
                      if (customCat) {
                        return (
                          <span className="flex items-center gap-2">
                            <span>{customCat.icon}</span>
                            <span>{customCat.name}</span>
                          </span>
                        );
                      }
                    } else {
                      const customCat = customCategories.find(c => c.id === category);
                      if (customCat) {
                        return (
                          <span className="flex items-center gap-2">
                            <span>{customCat.icon}</span>
                            <span>{customCat.name}</span>
                          </span>
                        );
                      }
                    }
                    return null;
                  })()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="bg-popover z-50">
                {type === 'income' ? (
                  <>
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
                  </>
                ) : (
                  <>
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
                    {/* Standard categories */}
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
                  </>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Payment Source */}
          <div className="space-y-2">
            <Label>{t('transactions.paymentSource')}</Label>
            <Select 
              value={paymentSource} 
              onValueChange={(v) => {
                setPaymentSource(v as PaymentSource);
                setSelectedCardId(null); // Reset card when changing source
              }}
            >
              <SelectTrigger>
                <SelectValue>
                  {paymentSource && (() => {
                    // Check if it's a custom payment source
                    const customSource = customPaymentSources.find(s => s.id === paymentSource);
                    if (customSource) {
                      return (
                        <span className="flex items-center gap-2">
                          <span 
                            className="w-5 h-5 rounded-full flex items-center justify-center text-white text-xs"
                            style={{ backgroundColor: customSource.color }}
                          >
                            {customSource.icon}
                          </span>
                          <span>{customSource.name}</span>
                        </span>
                      );
                    }
                    // Otherwise use standard payment source info
                    const info = getPaymentSourceInfo(paymentSource);
                    return (
                      <span className="flex items-center gap-2">
                        <span>{info.icon}</span>
                        <span>{t(`paymentSources.${paymentSource}`) !== `paymentSources.${paymentSource}` ? t(`paymentSources.${paymentSource}`) : info.name}</span>
                      </span>
                    );
                  })()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {PAYMENT_SOURCE_GROUPS.map((group) => (
                  <div key={group.label}>
                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide bg-muted/50">
                      {t(`paymentSources.${group.label.toLowerCase().replace(/\s+/g, '')}`) !== `paymentSources.${group.label.toLowerCase().replace(/\s+/g, '')}` 
                        ? t(`paymentSources.${group.label.toLowerCase().replace(/\s+/g, '')}`) 
                        : group.label}
                    </div>
                    {group.sources.map((src) => (
                      <SelectItem key={src.id} value={src.id}>
                        <span className="flex items-center gap-2">
                          <span>{src.icon}</span>
                          <span>{t(`paymentSources.${src.id}`) !== `paymentSources.${src.id}` ? t(`paymentSources.${src.id}`) : src.name}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </div>
                ))}
                {/* Custom Payment Sources */}
                {customPaymentSources.length > 0 && (
                  <div>
                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide bg-muted/50">
                      {t('transactions.customSources')}
                    </div>
                    {customPaymentSources.map((src) => (
                      <SelectItem key={`custom-${src.id}`} value={src.id}>
                        <span className="flex items-center gap-2">
                          <span 
                            className="w-5 h-5 rounded-full flex items-center justify-center text-white text-xs"
                            style={{ backgroundColor: src.color }}
                          >
                            {src.icon}
                          </span>
                          <span>{src.name}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Card Selection - Show when custom payment source with cards is selected */}
          {availableCards.length > 0 && (
            <div className="space-y-2">
              <Label>{t('transactions.selectCard')}</Label>
              <Select 
                value={selectedCardId || 'none'} 
                onValueChange={(v) => setSelectedCardId(v === 'none' ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('transactions.selectCard')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('transactions.noCard')}</SelectItem>
                  {availableCards.map((card) => (
                    <SelectItem key={card.id} value={card.id}>
                      <span className="flex items-center gap-2">
                        <span>💳</span>
                        <span>{card.card_name}</span>
                        <span className="text-muted-foreground">•••• {card.last_four_digits}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Date */}
          <div className="space-y-2">
            <Label>{t('common.date')}</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !date && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date && !isNaN(date.getTime()) ? format(date, "PPP", { locale: dateLocale }) : t('transactions.selectDate')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(d) => d && setDate(d)}
                  locale={dateLocale}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Project Assignment */}
          {projects.length > 0 && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <FolderKanban className="w-4 h-4" />
                {t('transactions.assignToProject')}
              </Label>
              <Select 
                value={selectedProjectId || 'none'} 
                onValueChange={(v) => setSelectedProjectId(v === 'none' ? null : v)}
              >
                <SelectTrigger>
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
              <Label className="flex items-center gap-2">
                <PiggyBank className="w-4 h-4" />
                {t('transactions.assignToBudget', 'Pridruži budžetu')}
              </Label>
              <Select 
                value={selectedBudgetId || 'none'} 
                onValueChange={(v) => setSelectedBudgetId(v === 'none' ? null : v)}
              >
                <SelectTrigger>
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

        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving || !amount || !description}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {t('common.save')}
          </Button>
        </div>
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
    </>
  );
};

