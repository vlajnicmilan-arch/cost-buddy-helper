import { useState, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Upload, FileText, Check, AlertCircle, Loader2, Copy, CreditCard } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { parseCSV, ParsedTransaction } from '@/lib/csvParsers';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getCategoryInfo, TransactionType, Expense } from '@/types/expense';
import { format } from 'date-fns';
import { hr, enUS, de } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import { useLoanDetection, DetectedLoan } from '@/hooks/useLoanDetection';
import { LoanDetectionDialog } from '@/components/business/LoanDetectionDialog';
import { useBusinessDebts } from '@/hooks/useBusinessDebts';
import { useAppState } from '@/contexts/AppStateContext';

import { showSuccess } from '@/hooks/useStatusFeedback';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { UpgradePrompt } from '@/components/UpgradePrompt';

interface CSVImportDialogProps {
  onImport: (transactions: ParsedTransaction[]) => Promise<void>;
  onReplaceAutoGen?: (replacements: { tx: ParsedTransaction; existingId: string }[]) => Promise<void>;
  existingExpenses?: Expense[];
  externalOpen?: boolean;
  onExternalOpenChange?: (open: boolean) => void;
  defaultPaymentSource?: string;
  findDuplicates?: FindPdfDuplicatesHandler;
}

type ImportStep = 'upload' | 'preview' | 'importing' | 'complete';

export const CSVImportDialog = ({ onImport, onReplaceAutoGen, existingExpenses = [], externalOpen, onExternalOpenChange, defaultPaymentSource, findDuplicates }: CSVImportDialogProps) => {
  const { t, i18n } = useTranslation();
  const { hasAccess, getRequiredTier } = useFeatureAccess();
  const canImport = hasAccess('csv_import');
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<ImportStep>('upload');
  const [transactions, setTransactions] = useState<ParsedTransaction[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [source, setSource] = useState('');
  const [error, setError] = useState('');
  const [importedCount, setImportedCount] = useState(0);
  const [selectedPaymentSource, setSelectedPaymentSource] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { customPaymentSources } = useCustomPaymentSources();
  const { activeBusinessProfileId, emitAvatarEvent } = useAppState();
  const { detectLoans } = useLoanDetection();
  const { addDebt } = useBusinessDebts();
  const [detectedLoans, setDetectedLoans] = useState<DetectedLoan[]>([]);
  const [loanDialogOpen, setLoanDialogOpen] = useState(false);

  const dateLocale = i18n.language === 'de' ? de : i18n.language === 'en' ? enUS : hr;

  const [duplicateIndices, setDuplicateIndices] = useState<Set<number>>(new Set());
  const [fuzzyDuplicateIndices, setFuzzyDuplicateIndices] = useState<Set<number>>(new Set());
  const [autoGenIndices, setAutoGenIndices] = useState<Set<number>>(new Set());
  const [autoGenMap, setAutoGenMap] = useState<Map<number, Expense>>(new Map());
  const [replaceAutoGen, setReplaceAutoGen] = useState(true);
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  // Simple fallback duplicate detection: same amount and same date (day-level)
  const isSimpleDuplicate = (tx: ParsedTransaction): boolean => {
    return existingExpenses.some(existing => {
      const existingDate = existing.date instanceof Date ? existing.date : new Date(existing.date);
      const txDate = tx.date instanceof Date ? tx.date : new Date(tx.date);
      return Math.abs(existing.amount - tx.amount) < 0.01 &&
        existingDate.getFullYear() === txDate.getFullYear() &&
        existingDate.getMonth() === txDate.getMonth() &&
        existingDate.getDate() === txDate.getDate();
    });
  };

  // Detect duplicates using scoring findDuplicates if available, else simple check
  const detectDuplicates = (txs: ParsedTransaction[]): { strict: Set<number>; fuzzy: Set<number>; autoGen: Set<number>; autoGenMapping: Map<number, Expense> } => {
    if (findDuplicates) {
      const { duplicates, fuzzyDuplicates, autoGenMatches } = findDuplicates(txs);
      const strictSet = new Set<number>();
      const fuzzySet = new Set<number>();
      const autoGenSet = new Set<number>();
      const agMap = new Map<number, Expense>();
      duplicates.forEach(dup => {
        const idx = txs.findIndex(tx => tx === dup);
        if (idx >= 0) strictSet.add(idx);
      });
      fuzzyDuplicates.forEach(dup => {
        const idx = txs.findIndex(tx => tx === dup);
        if (idx >= 0) fuzzySet.add(idx);
      });
      (autoGenMatches || []).forEach(({ tx: agTx, existing }) => {
        const idx = txs.findIndex(tx => tx === agTx);
        if (idx >= 0) {
          autoGenSet.add(idx);
          agMap.set(idx, existing);
        }
      });
      return { strict: strictSet, fuzzy: fuzzySet, autoGen: autoGenSet, autoGenMapping: agMap };
    }
    // Fallback: simple check
    const strictSet = new Set<number>();
    txs.forEach((tx, i) => {
      if (isSimpleDuplicate(tx)) strictSet.add(i);
    });
    return { strict: strictSet, fuzzy: new Set(), autoGen: new Set(), autoGenMapping: new Map() };
  };

  const duplicateCount = duplicateIndices.size;
  const fuzzyCount = fuzzyDuplicateIndices.size;
  const autoGenCount = autoGenIndices.size;

  const resetState = () => {
    setStep('upload');
    setTransactions([]);
    setSelectedIndices(new Set());
    setDuplicateIndices(new Set());
    setFuzzyDuplicateIndices(new Set());
    setAutoGenIndices(new Set());
    setAutoGenMap(new Map());
    setReplaceAutoGen(true);
    setSkipDuplicates(true);
    setSource('');
    setError('');
    setImportedCount(0);
    setSelectedPaymentSource('');
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError('');

    try {
      const content = await file.text();
      const result = parseCSV(content);

      if (!result.success) {
        setError(result.errors.join(', ') || t('import.fileReadError'));
        return;
      }

      setTransactions(result.transactions);
      setSource(result.source);
      // Detect duplicates
      const { strict, fuzzy, autoGen, autoGenMapping } = detectDuplicates(result.transactions);
      setDuplicateIndices(strict);
      setFuzzyDuplicateIndices(fuzzy);
      setAutoGenIndices(autoGen);
      setAutoGenMap(autoGenMapping);
      // Auto-deselect strict duplicates and auto-gen (will be replaced separately)
      const nonStrictDupIndices = new Set(
        result.transactions.map((_, i) => i).filter(i => !strict.has(i) && !autoGen.has(i))
      );
      setSelectedIndices(nonStrictDupIndices);
      setStep('preview');
    } catch (err) {
      setError(t('import.fileReadError'));
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const toggleTransaction = (index: number) => {
    const newSelected = new Set(selectedIndices);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedIndices(newSelected);
  };

  const toggleAll = () => {
    if (selectedIndices.size === transactions.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(transactions.map((_, i) => i)));
    }
  };

  const selectOnlyNew = () => {
    const nonDupIndices = new Set(
      transactions.map((_, i) => i).filter(i => !duplicateIndices.has(i))
    );
    setSelectedIndices(nonDupIndices);
    setSkipDuplicates(true);
  };

  const handleImport = async () => {
    let selectedTransactions = transactions.filter((_, i) => selectedIndices.has(i));

    // Collect auto-gen replacements
    const replacements: { tx: ParsedTransaction; existingId: string }[] = [];
    if (replaceAutoGen && autoGenIndices.size > 0) {
      autoGenIndices.forEach(idx => {
        const tx = transactions[idx];
        const existing = autoGenMap.get(idx);
        if (tx && existing) {
          replacements.push({ tx, existingId: existing.id });
        }
      });
    }

    if (selectedTransactions.length === 0 && replacements.length === 0) return;

    // Use defaultPaymentSource (from payment source context) or user-selected source
    const effectiveSource = defaultPaymentSource || (selectedPaymentSource ? `custom:${selectedPaymentSource}` : undefined);
    if (effectiveSource) {
      selectedTransactions = selectedTransactions.map(tx => ({
        ...tx,
        payment_source: effectiveSource as any
      }));
      replacements.forEach(r => {
        r.tx = { ...r.tx, payment_source: effectiveSource as any };
      });
    }

    setStep('importing');

    try {
      // Handle auto-gen replacements
      if (replacements.length > 0 && onReplaceAutoGen) {
        await onReplaceAutoGen(replacements);
      }

      // Import new transactions
      if (selectedTransactions.length > 0) {
        await onImport(selectedTransactions);
      }

      setImportedCount(selectedTransactions.length + replacements.length);
      setStep('complete');
      emitAvatarEvent('happy', 'Uvezeno! Sve je tu 📊');

      // After successful import, scan for loans in business mode
      if (activeBusinessProfileId) {
        const txsForScan = selectedTransactions.map(tx => ({
          description: tx.description,
          amount: tx.amount,
          type: tx.type,
          date: tx.date instanceof Date ? tx.date : new Date(tx.date),
        }));
        detectLoans(txsForScan).then(detected => {
          if (detected.length > 0) {
            setDetectedLoans(detected);
            setLoanDialogOpen(true);
          }
        });
      }
    } catch (err) {
      setError(t('import.importError'));
      setStep('preview');
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
    showSuccess(`Dodano ${loans.length} pozajmica u evidenciju dugovanja`);
    setDetectedLoans([]);
  };

  const handleClose = () => {
    setOpen(false);
    setTimeout(resetState, 200);
  };

  const formatAmount = (amount: number, type: TransactionType) => {
    const prefix = type === 'income' ? '+' : type === 'transfer' ? '↔' : '-';
    return `${prefix}${amount.toFixed(2)} €`;
  };

  const isControlled = externalOpen !== undefined;
  const dialogOpen = isControlled ? externalOpen : open;
  const handleOpenChange = (isOpen: boolean) => {
    if (isControlled) {
      onExternalOpenChange?.(isOpen);
    } else {
      setOpen(isOpen);
    }
    if (!isOpen) setTimeout(resetState, 200);
  };

  return (
    <>
    <Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
      {!isControlled && (
        <DialogTrigger asChild>
          <Button variant="outline" className="w-full gap-2 rounded-xl">
            <Upload className="w-4 h-4" />
            {t('import.importCSV')}
          </Button>
        </DialogTrigger>
      )}

      <DialogContent showBackButton={false} className="sm:max-w-lg glass-card border-border/50 max-h-[85vh] flex flex-col">
        {!canImport ? (
          <div className="flex-1 flex items-center justify-center p-6 min-h-[300px]">
            <UpgradePrompt
              feature="CSV/PDF uvoz podataka"
              requiredTier={getRequiredTier('csv_import')}
            />
          </div>
        ) : (
        <>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            {step === 'upload' && t('import.importTransactionsTitle')}
            {step === 'preview' && `${t('import.preview')} - ${source}`}
            {step === 'importing' && t('import.importInProgress')}
            {step === 'complete' && t('import.importComplete')}
          </DialogTitle>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {/* Upload Step */}
          {step === 'upload' && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="py-6"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                className="hidden"
              />

              <div
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                aria-label={t('import.selectCSVFile')}
                className="border-2 border-dashed border-border/50 rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="font-medium mb-2">{t('import.selectCSVFile')}</p>
                <p className="text-sm text-muted-foreground">
                  {t('import.supportedBanks')}
                </p>
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-xl flex items-center gap-2 text-destructive"
                >
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span className="text-sm">{error}</span>
                </motion.div>
              )}

              <div className="mt-6 p-4 bg-muted/30 rounded-xl">
                <p className="text-sm font-medium mb-2">{t('import.howToExportCSV')}</p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• <strong>Revolut:</strong> Transactions → Export → CSV</li>
                  <li>• <strong>Aircash:</strong> Transakcije → Izvoz</li>
                  <li>• <strong>Internet bankarstvo:</strong> Izvodi → Izvoz/Export</li>
                </ul>
              </div>
            </motion.div>
          )}

          {/* Preview Step */}
          {step === 'preview' && (
            <motion.div
              key="preview"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col min-h-0"
            >
              {(duplicateCount > 0 || fuzzyCount > 0 || autoGenCount > 0) && (
                <div className="py-2 px-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex flex-col gap-2 text-amber-700 dark:text-amber-400">
                  <div className="flex items-center gap-2">
                    <Copy className="w-4 h-4 flex-shrink-0" />
                    <span className="text-xs font-medium">
                      {duplicateCount > 0 && `${duplicateCount} sigurnih duplikata`}
                      {duplicateCount > 0 && (fuzzyCount > 0 || autoGenCount > 0) && ', '}
                      {fuzzyCount > 0 && `${fuzzyCount} mogućih (2/3 kriterija)`}
                      {fuzzyCount > 0 && autoGenCount > 0 && ', '}
                      {autoGenCount > 0 && `${autoGenCount} auto-generiranih za zamjenu`}
                      {' — strogi automatski preskočeni'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] px-2 rounded-lg border-amber-500/30"
                      onClick={(e) => { e.stopPropagation(); selectOnlyNew(); }}
                    >
                      Samo nove
                    </Button>
                    <Button
                      variant={skipDuplicates ? "outline" : "default"}
                      size="sm"
                      className="h-6 text-[10px] px-2 rounded-lg border-amber-500/30"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSkipDuplicates(!skipDuplicates);
                        if (skipDuplicates) {
                          setSelectedIndices(new Set(transactions.map((_, i) => i)));
                        } else {
                          selectOnlyNew();
                        }
                      }}
                    >
                      {skipDuplicates ? 'Uključi sve' : 'Preskoči duplikate'}
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between py-3 border-b border-border/30">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={selectedIndices.size === transactions.length}
                    onCheckedChange={toggleAll}
                  />
                  <span className="text-sm font-medium">
                    {t('import.selected')}: {selectedIndices.size} / {transactions.length}
                  </span>
                </label>
                <span className="text-xs text-muted-foreground px-2 py-1 bg-muted/50 rounded-lg">
                  {source}
                </span>
              </div>

              {/* Payment source selector - shown when no default source is set */}
              {!defaultPaymentSource && customPaymentSources.length > 0 && (
                <div className="py-3 border-b border-border/30">
                  <label className="text-xs text-muted-foreground mb-1.5 block">
                    <CreditCard className="w-3 h-3 inline mr-1" />
                    Izvor plaćanja za uvoz
                  </label>
                  <Select value={selectedPaymentSource} onValueChange={setSelectedPaymentSource}>
                    <SelectTrigger className="h-9 rounded-xl text-sm">
                      <SelectValue placeholder={t('placeholders.selectPaymentSource')} />
                    </SelectTrigger>
                    <SelectContent>
                      {customPaymentSources.map(ps => (
                        <SelectItem key={ps.id} value={ps.id}>
                          <span className="flex items-center gap-2">
                            <span>{ps.icon}</span>
                            <span>{ps.name}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <ScrollArea className="flex-1 max-h-[300px] -mx-6 px-6">
                <div className="space-y-1 py-2">
                  {transactions.map((tx, index) => {
                    const categoryInfo = getCategoryInfo(tx.category);
                    const isStrict = duplicateIndices.has(index);
                    const isFuzzy = fuzzyDuplicateIndices.has(index);
                    const isAutoGen = autoGenIndices.has(index);
                    return (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.02 }}
                        onClick={() => !isAutoGen && toggleTransaction(index)}
                        className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${
                          isAutoGen
                            ? 'bg-primary/5 border border-primary/20'
                            : isStrict && !selectedIndices.has(index)
                              ? 'bg-destructive/5 border border-destructive/20 opacity-50'
                              : isFuzzy && !selectedIndices.has(index)
                                ? 'bg-amber-500/5 border border-amber-500/20 opacity-60'
                                : selectedIndices.has(index) 
                                  ? 'bg-muted/50 border border-primary/20' 
                                  : 'bg-muted/20 border border-transparent opacity-50'
                        }`}
                      >
                        {!isAutoGen && (
                          <Checkbox
                            checked={selectedIndices.has(index)}
                            onCheckedChange={() => toggleTransaction(index)}
                          />
                        )}
                        {isAutoGen && (
                          <span className="text-xs">🔄</span>
                        )}
                        <span className="text-lg">{categoryInfo.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">
                              {tx.description}
                            </p>
                            {isStrict && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-destructive/40 text-destructive shrink-0">
                                Duplikat
                              </Badge>
                            )}
                            {isFuzzy && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/40 text-amber-600 dark:text-amber-400 shrink-0">
                                Mogući duplikat
                              </Badge>
                            )}
                            {isAutoGen && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/40 text-primary shrink-0">
                                Zamjena
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {format(tx.date, 'd. MMM yyyy', { locale: dateLocale })}
                          </p>
                        </div>
                        <span className={`text-sm font-semibold ${
                          tx.type === 'income' ? 'text-income' : 
                          tx.type === 'transfer' ? 'text-muted-foreground' : 'text-expense'
                        }`}>
                          {formatAmount(tx.amount, tx.type)}
                        </span>
                      </motion.div>
                    );
                  })}
                </div>
              </ScrollArea>

              {error && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-3 p-3 bg-destructive/10 border border-destructive/20 rounded-xl flex items-center gap-2 text-destructive"
                >
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span className="text-sm">{error}</span>
                </motion.div>
              )}

              <div className="flex gap-3 pt-4 mt-auto border-t border-border/30">
                <Button
                  variant="outline"
                  onClick={() => setStep('upload')}
                  className="flex-1 rounded-xl"
                >
                  {t('common.back')}
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={selectedIndices.size === 0}
                  className="flex-1 rounded-xl bg-primary hover:bg-primary/90"
                >
                  {t('import.importCount', { count: selectedIndices.size })}
                </Button>
              </div>
            </motion.div>
          )}

          {/* Importing Step */}
          {step === 'importing' && (
            <motion.div
              key="importing"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="py-12 text-center"
            >
              <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-primary" />
              <p className="font-medium">{t('import.importInProgress')}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {t('import.pleaseWait')}
              </p>
            </motion.div>
          )}

          {/* Complete Step */}
          {step === 'complete' && (
            <motion.div
              key="complete"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="py-12 text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', delay: 0.1 }}
                className="w-16 h-16 mx-auto mb-4 rounded-full bg-income/20 flex items-center justify-center"
              >
                <Check className="w-8 h-8 text-income" />
              </motion.div>
              <p className="font-medium text-lg">{t('import.successfullyImported')}</p>
              <p className="text-muted-foreground mt-1">
                {t('import.transactionsAdded', { count: importedCount })}
              </p>
              <Button
                onClick={handleClose}
                className="mt-6 rounded-xl"
              >
                {t('common.close')}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
        </>
        )}
      </DialogContent>
    </Dialog>

    <LoanDetectionDialog
      open={loanDialogOpen}
      onOpenChange={setLoanDialogOpen}
      detectedLoans={detectedLoans}
      onConfirm={handleLoanConfirm}
    />
    </>
  );
};