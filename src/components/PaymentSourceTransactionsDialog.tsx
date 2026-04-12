import { useState, useMemo, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Expense, getCategoryInfo, Category } from '@/types/expense';
import { TransactionFilters, FilterState, defaultFilters, applyFilters } from './TransactionFilters';
import { EditTransactionDialog } from './EditTransactionDialog';
import { TransactionDetailDialog } from './TransactionDetailDialog';
import { BulkActionsToolbar } from './BulkActionsToolbar';
import { ImportBatchDialog } from './ImportBatchDialog';
import { CustomPaymentSource } from '@/types/customPaymentSource';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useInstallments } from '@/hooks/useInstallments';
import { useCustomCategories } from '@/hooks/useCustomCategories';
import { resolveCategory, getCategoryBgStyle } from '@/hooks/useResolvedCategory';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { Pencil, Trash2, TrendingUp, TrendingDown, ArrowLeftRight, CreditCard, CheckSquare, Search, X as XIcon, Calendar, ChevronRight, FileText, Upload, Loader2, AlertTriangle, Printer, Download, Code2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';

import { ScrollArea } from '@/components/ui/scroll-area';
import { usePDFParser } from '@/hooks/usePDFParser';
import { ParsedTransaction } from '@/lib/csvParsers';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { CSVImportDialog } from './CSVImportDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { generatePDFReport, generateCSVReport, ReportData, CurrencyConfig } from '@/lib/reportExport';

interface PaymentSourceTransactionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paymentSource: CustomPaymentSource | null;
  expenses: Expense[];
  onUpdate: (expense: Expense) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onImportCSV?: (transactions: ParsedTransaction[]) => Promise<void>;
  findDuplicates?: (transactions: ParsedTransaction[]) => { duplicates: ParsedTransaction[]; fuzzyDuplicates: ParsedTransaction[]; fuzzyMatchedExpenses: Expense[]; autoGenMatches: { tx: ParsedTransaction; existing: Expense }[]; unique: ParsedTransaction[] };
}

export const PaymentSourceTransactionsDialog = ({
  open,
  onOpenChange,
  paymentSource,
  expenses,
  onUpdate,
  onDelete,
  onImportCSV,
  findDuplicates
}: PaymentSourceTransactionsDialogProps) => {
  const { t } = useTranslation();
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [detailExpense, setDetailExpense] = useState<Expense | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
   const [searchTerm, setSearchTerm] = useState('');
   const [filters, setFilters] = useState<FilterState>(defaultFilters);
   const [visibleCount, setVisibleCount] = useState(50);
   const [installmentsExpanded, setInstallmentsExpanded] = useState(false);
  const [importBatchDialogOpen, setImportBatchDialogOpen] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [duplicateWarningOpen, setDuplicateWarningOpen] = useState(false);
  const [includeDuplicates, setIncludeDuplicates] = useState(false);
  const [selectedFuzzy, setSelectedFuzzy] = useState<Set<number>>(new Set());
  const [duplicateInfo, setDuplicateInfo] = useState<{ duplicates: ParsedTransaction[]; fuzzyDuplicates: ParsedTransaction[]; fuzzyMatchedExpenses: Expense[]; unique: ParsedTransaction[] } | null>(null);
  const [isImportingPdf, setIsImportingPdf] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const htmlInputRef = useRef<HTMLInputElement>(null);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const { formatAmount, currency } = useCurrency();
  const { plans } = useInstallments();
  const { parsing, parsedData, parsePDF, parseHTML, clearParsedData } = usePDFParser();
  const { customCategories } = useCustomCategories();

  // Filter installment plans for this payment source
  const sourceInstallments = useMemo(() => {
    if (!paymentSource) return [];
    return plans.filter(plan => {
      if (!plan.payment_source) return false;
      const ps = plan.payment_source;
      return ps === `custom:${paymentSource.id}` || ps === paymentSource.id;
    });
  }, [plans, paymentSource]);

  const handleClose = () => {
    clearSelection();
    setSearchTerm('');
    setFilters(defaultFilters);
    setVisibleCount(50);
    onOpenChange(false);
  };

  

  // Filter expenses for this payment source
  const sourceExpenses = useMemo(() => {
    if (!paymentSource) return [];
    
    return expenses.filter(e => {
      if (e.payment_source?.startsWith(`custom:${paymentSource.id}`)) return true;
      if (e.payment_source === paymentSource.id) return true;
      if (e.payment_source_card_id && paymentSource.cards) {
        return paymentSource.cards.some(card => card.id === e.payment_source_card_id);
      }
      if (e.type === 'transfer' && e.income_source_id === paymentSource.id) return true;
      return false;
    }).sort((a, b) => {
      // Primary sort: transaction date descending
      const dateA = a.date.getTime();
      const dateB = b.date.getTime();
      if (dateB !== dateA) return dateB - dateA;
      // Secondary sort: created_at descending (for same-day transactions)
      return (b.created_at ?? '') > (a.created_at ?? '') ? 1 : -1;
    });
  }, [expenses, paymentSource]);

  // Calculate running balance for each transaction (chronological order, newest first)
  const runningBalances = useMemo(() => {
    if (!paymentSource || sourceExpenses.length === 0) return new Map<string, number>();
    
    // We need chronological order (oldest first) to compute running balance
    const chronological = [...sourceExpenses].reverse();
    const balanceMap = new Map<string, number>();

    // Helper: determine how a transaction affects THIS payment source's balance
    const getEffect = (e: Expense): number => {
      const isInboundTransfer = e.type === 'transfer' && e.income_source_id === paymentSource.id;
      const isOutboundTransfer = e.type === 'transfer' && !isInboundTransfer;

      if (e.type === 'income') return e.amount;          // income increases balance
      if (e.type === 'expense') return -e.amount;         // expense decreases balance
      if (isInboundTransfer) return e.amount;             // incoming transfer increases balance
      if (isOutboundTransfer) return -e.amount;           // outgoing transfer decreases balance
      return 0;
    };
    
    // Start from current balance and reverse all visible transactions to get "before" balance
    let runningBalance = paymentSource.balance;
    for (const e of sourceExpenses) {
      runningBalance -= getEffect(e);
    }
    
    // Now walk forward chronologically, applying each transaction
    for (const e of chronological) {
      runningBalance += getEffect(e);
      balanceMap.set(e.id, runningBalance);
    }
    
    return balanceMap;
  }, [sourceExpenses, paymentSource]);

  // Apply filters (search + date + amount + category)
  const filteredSourceExpenses = useMemo(() => {
    return applyFilters(sourceExpenses, filters);
  }, [sourceExpenses, filters]);

  // Calculate totals
  const { totalIncome, totalExpenses: totalExp, totalTransfers } = useMemo(() => {
    return sourceExpenses.reduce((acc, e) => {
      if (e.type === 'income') acc.totalIncome += e.amount;
      else if (e.type === 'expense') acc.totalExpenses += e.amount;
      else if (e.type === 'transfer') {
        if (e.income_source_id === paymentSource?.id) {
          acc.totalIncome += e.amount;
        } else {
          acc.totalTransfers += e.amount;
        }
      }
      return acc;
    }, { totalIncome: 0, totalExpenses: 0, totalTransfers: 0 });
  }, [sourceExpenses, paymentSource]);

  const handleEdit = (expense: Expense) => {
    setEditingExpense(expense);
    setEditDialogOpen(true);
  };

  const handleSave = async (expense: Expense) => {
    await onUpdate(expense);
    setEditDialogOpen(false);
    setEditingExpense(null);
  };

  const handleDelete = async (id: string) => {
    await onDelete(id);
  };

  const getCardInfo = (expense: Expense) => {
    if (!expense.payment_source_card_id || !paymentSource?.cards) return null;
    return paymentSource.cards.find(c => c.id === expense.payment_source_card_id);
  };

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedIds(newSelected);
  };

  const selectAll = () => setSelectedIds(new Set(filteredSourceExpenses.map(e => e.id)));
  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkCategoryChange = async (category: Category) => {
    const selected = filteredSourceExpenses.filter(e => selectedIds.has(e.id));
    let count = 0;
    for (const expense of selected) {
      try { await onUpdate({ ...expense, category }); count++; } catch {}
    }
    showSuccess(t('transactions.categoryChanged', { count }));
    clearSelection();
  };

  const handleBulkPaymentSourceChange = async (newPaymentSource: string) => {
    const selected = filteredSourceExpenses.filter(e => selectedIds.has(e.id));
    let count = 0;
    for (const expense of selected) {
      try { await onUpdate({ ...expense, payment_source: newPaymentSource as any, payment_source_card_id: null }); count++; } catch {}
    }
    showSuccess(t('transactions.paymentSourceChanged', { count }));
    clearSelection();
  };

  const handleBulkDelete = async () => {
    const selected = filteredSourceExpenses.filter(e => selectedIds.has(e.id));
    let count = 0;
    for (const expense of selected) {
      try { await onDelete(expense.id); count++; } catch {}
    }
    showSuccess(t('transactions.deleted', { count }));
    clearSelection();
  };

  // PDF import handlers
  const handlePDFSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    // Accept PDF by MIME type or file extension (mobile browsers may not set type correctly)
    const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPDF) {
      showError(t('import.selectPDF'));
      if (pdfInputRef.current) pdfInputRef.current.value = '';
      return;
    }
    
    // Clone the file into a Blob before resetting input — on mobile, resetting
    // the input can invalidate the File reference before FileReader finishes.
    const fileBlob = new Blob([await file.arrayBuffer()], { type: file.type || 'application/pdf' });
    
    // Reset input so same file can be re-selected next time
    if (pdfInputRef.current) pdfInputRef.current.value = '';
    
    toast.info(t('toasts.loadingPdf'));
    
    const reader = new FileReader();
    reader.onerror = () => {
      showError(t('toasts.fileReadError'));
    };
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      if (!base64) {
        showError(t('toasts.fileReadError'));
        return;
      }
      try {
        const result = await parsePDF(base64);
        if (result && result.transactions.length > 0) {
          setPdfPreviewOpen(true);
        } else if (result && result.transactions.length === 0) {
          toast.warning(t('toasts.pdfNoTransactions'));
        }
      } catch (err) {
        console.error('PDF parse error:', err);
        showError(t('toasts.pdfAnalysisError'));
      }
    };
    reader.readAsDataURL(fileBlob);
  };

  const handleHTMLSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const isHTMLFile = file.type === 'text/html' || file.name.toLowerCase().endsWith('.html') || file.name.toLowerCase().endsWith('.htm');
    if (!isHTMLFile) {
      showError(t('toasts.selectHtmlFile'));
      if (htmlInputRef.current) htmlInputRef.current.value = '';
      return;
    }
    if (htmlInputRef.current) htmlInputRef.current.value = '';
    toast.info(t('toasts.loadingHtml'));
    try {
      const content = await file.text();
      const result = await parseHTML(content);
      if (result && result.transactions.length > 0) {
        setPdfPreviewOpen(true);
      } else if (result && result.transactions.length === 0) {
        toast.warning(t('toasts.htmlNoTransactions'));
      }
    } catch (err) {
      console.error('HTML parse error:', err);
      showError(t('toasts.htmlAnalysisError'));
    }
  };

  const handleImportPDFTransactions = async () => {
    if (!parsedData || !onImportCSV || !paymentSource) return;

    const paymentSourceValue = `custom:${paymentSource.id}`;
    const transactions: ParsedTransaction[] = parsedData.transactions.map(tx => ({
      date: tx.date,
      description: tx.description,
      amount: tx.amount,
      type: tx.type,
      category: tx.category,
      merchant_name: tx.merchant_name || undefined,
      source: 'pdf' as const,
      payment_source: paymentSourceValue as any
    }));

    try {
      setIsImportingPdf(true);

      if (findDuplicates) {
        const { duplicates, fuzzyDuplicates, fuzzyMatchedExpenses, unique } = findDuplicates(transactions);

        if (duplicates.length > 0 || fuzzyDuplicates.length > 0) {
          if (unique.length === 0 && fuzzyDuplicates.length === 0) {
            toast.info(t('import.noNewTransactions'));
            setPdfPreviewOpen(false);
            clearParsedData();
            return;
          }

          setDuplicateInfo({ duplicates, fuzzyDuplicates, fuzzyMatchedExpenses, unique });
          setIncludeDuplicates(false);
          setSelectedFuzzy(new Set());
          setPdfPreviewOpen(false);
          setDuplicateWarningOpen(true);
          return;
        }
      }

      await onImportCSV(transactions);
      setPdfPreviewOpen(false);
      clearParsedData();
      showSuccess(t('import.importedFromPDF', { count: transactions.length }));
    } catch (error) {
      console.error('Error importing PDF transactions:', error);
      showError(t('toasts.importError'));
    } finally {
      setIsImportingPdf(false);
    }
  };

  const handleConfirmImportWithDuplicates = async () => {
    if (!duplicateInfo || !onImportCSV) return;
    const fuzzyToInclude = duplicateInfo.fuzzyDuplicates.filter((_, i) => selectedFuzzy.has(i));
    const strictToInclude = includeDuplicates ? duplicateInfo.duplicates : [];
    const transactionsToImport = [...duplicateInfo.unique, ...fuzzyToInclude, ...strictToInclude];
    if (transactionsToImport.length === 0) {
      toast.info(t('import.noNewTransactions'));
      setDuplicateWarningOpen(false);
      clearParsedData();
      setDuplicateInfo(null);
      return;
    }

    try {
      setIsImportingPdf(true);
      await onImportCSV(transactionsToImport);
      setDuplicateWarningOpen(false);
      clearParsedData();
      setDuplicateInfo(null);
      showSuccess(t('import.importedTransactions', { count: transactionsToImport.length }));
    } catch (error) {
      console.error('Error importing duplicate-reviewed transactions:', error);
      showError(t('toasts.importError'));
    } finally {
      setIsImportingPdf(false);
    }
  };

  // Print handler
  const handlePrint = () => {
    if (!paymentSource || filteredSourceExpenses.length === 0) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const rows = filteredSourceExpenses.map(e => {
      const cat = resolveCategory(e.category, customCategories);
      const isInbound = e.type === 'transfer' && e.income_source_id === paymentSource.id;
      const sign = e.type === 'income' || isInbound ? '+' : '-';
      const color = e.type === 'income' || isInbound ? '#16a34a' : '#dc2626';
      return `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${format(e.date, 'dd.MM.yyyy')}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${e.type === 'income' ? t('transactions.income') : e.type === 'transfer' ? t('transactions.transfer') : t('transactions.expense')}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${e.description}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${cat.name}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;color:${color}">${sign}${formatAmount(e.amount)}</td>
      </tr>`;
    }).join('');

    printWindow.document.write(`<!DOCTYPE html><html><head><title>${paymentSource.name} - ${t('transactions.transactions')}</title>
      <style>body{font-family:system-ui,sans-serif;padding:24px}table{width:100%;border-collapse:collapse}th{text-align:left;padding:8px;border-bottom:2px solid #333;font-size:13px}td{font-size:13px}.summary{margin-top:16px;padding:12px;background:#f5f5f5;border-radius:8px;font-size:14px}h1{font-size:18px;margin-bottom:4px}h2{font-size:15px;color:#666;margin-top:0}</style></head><body>
      <h1>${paymentSource.icon} ${paymentSource.name}</h1>
      <h2>${t('summary.balance')}: ${formatAmount(paymentSource.balance)} | ${filteredSourceExpenses.length} ${t('transactions.transactions')}</h2>
      <table><thead><tr>
        <th>${t('common.date', 'Datum')}</th>
        <th>${t('common.type', 'Tip')}</th>
        <th>${t('common.description', 'Opis')}</th>
        <th>${t('common.category', 'Kategorija')}</th>
        <th style="text-align:right">${t('common.amount', 'Iznos')}</th>
      </tr></thead><tbody>${rows}</tbody></table>
      <div class="summary">
        <strong>${t('summary.totalIncome')}:</strong> ${formatAmount(totalIncome)} &nbsp;|&nbsp;
        <strong>${t('summary.totalExpenses')}:</strong> ${formatAmount(totalExp)} &nbsp;|&nbsp;
        <strong>${t('transactions.transfers', 'Prijenosi')}:</strong> ${formatAmount(totalTransfers)}
      </div></body></html>`);
    printWindow.document.close();
    printWindow.print();
  };

  // Export handlers
  const buildReportData = (): ReportData => {
    const byCategory: Record<string, number> = {};
    const byPaymentSource: Record<string, number> = {};
    
    filteredSourceExpenses.forEach(e => {
      if (e.type === 'expense') {
        byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
      }
      const ps = e.payment_source || 'cash';
      byPaymentSource[ps] = (byPaymentSource[ps] || 0) + e.amount;
    });

    const dates = filteredSourceExpenses.map(e => e.date.getTime());
    const start = dates.length > 0 ? new Date(Math.min(...dates)) : new Date();
    const end = dates.length > 0 ? new Date(Math.max(...dates)) : new Date();

    const currencyConfig: CurrencyConfig = {
      code: currency.code,
      symbol: currency.symbol,
      locale: currency.locale,
    };

    return {
      expenses: filteredSourceExpenses,
      dateRange: { start, end },
      totals: {
        income: totalIncome,
        expenses: totalExp,
        balance: totalIncome - totalExp,
        transfers: totalTransfers,
      },
      byCategory,
      byPaymentSource,
      currency: currencyConfig,
    };
  };

  const handleExportPDF = async () => {
    if (!paymentSource || filteredSourceExpenses.length === 0) return;
    const data = buildReportData();
    await generatePDFReport(data, `${paymentSource.name} - ${t('transactions.transactions')}`);
    showSuccess(t('reports.pdfExported', 'PDF izvoz završen'));
  };

  const handleExportCSV = async () => {
    if (!paymentSource || filteredSourceExpenses.length === 0) return;
    const data = buildReportData();
    await generateCSVReport(data);
    showSuccess(t('reports.csvExported', 'CSV izvoz završen'));
  };

  if (!paymentSource) return null;

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[60] bg-background flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="px-4 py-3 border-b bg-background/95 backdrop-blur-sm sticky top-0 z-10">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <span 
                    className="w-9 h-9 rounded-full flex items-center justify-center text-lg shrink-0"
                    style={{ backgroundColor: paymentSource.color + '20', color: paymentSource.color }}
                  >
                    {paymentSource.icon}
                  </span>
                  <div className="min-w-0">
                    <h1 className="text-base font-semibold truncate">{paymentSource.name}</h1>
                    <p className="text-xs text-muted-foreground">
                      {sourceExpenses.length} {t('transactions.transactions')}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 min-w-0 sm:justify-end">
                  {onImportCSV && (
                    <>
                      <input
                        ref={pdfInputRef}
                        type="file"
                        accept=".pdf,application/pdf"
                        onChange={handlePDFSelect}
                        className="hidden"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => pdfInputRef.current?.click()}
                        disabled={parsing}
                        className="h-7 text-xs gap-1.5 border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10"
                      >
                        {parsing ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <FileText className="w-3.5 h-3.5" />
                        )}
                        PDF
                      </Button>
                      <input
                        ref={htmlInputRef}
                        type="file"
                        accept=".html,.htm,text/html"
                        onChange={handleHTMLSelect}
                        className="hidden"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => htmlInputRef.current?.click()}
                        disabled={parsing}
                        className="h-7 text-xs gap-1.5 border-purple-500/30 text-purple-600 dark:text-purple-400 hover:bg-purple-500/10"
                      >
                        {parsing ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Code2 className="w-3.5 h-3.5" />
                        )}
                        HTML
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCsvImportOpen(true)}
                        className="h-7 text-xs gap-1.5 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        CSV
                      </Button>
                    </>
                  )}
                  {filteredSourceExpenses.length > 0 && (
                    <>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
                            <Download className="w-3.5 h-3.5" />
                            {t('common.export', 'Izvoz')}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={handlePrint}>
                            <Printer className="w-4 h-4 mr-2" />
                            {t('common.print', 'Ispis')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={handleExportPDF}>
                            <FileText className="w-4 h-4 mr-2" />
                            PDF
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={handleExportCSV}>
                            <Download className="w-4 h-4 mr-2" />
                            CSV
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={selectedIds.size === filteredSourceExpenses.length ? clearSelection : selectAll}
                        className="h-7 text-xs gap-1.5 max-w-full"
                      >
                        <CheckSquare className="w-3.5 h-3.5 shrink-0" />
                        <span className="sm:hidden">Sve</span>
                        <span className="hidden sm:inline">{selectedIds.size === filteredSourceExpenses.length ? t('common.cancelSelection') : t('common.selectAll')}</span>
                      </Button>
                    </>
                  )}
                  <Button variant="ghost" size="icon" onClick={handleClose} className="h-8 w-8 ml-auto sm:ml-0">
                    <XIcon className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-2xl mx-auto w-full pl-3 pr-5 sm:px-4 py-4 space-y-4">
                {/* Balance & Summary */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-primary/10 col-span-2">
                    <p className="text-xs text-muted-foreground mb-1">{t('summary.balance')}</p>
                    <p className={cn(
                      "text-2xl font-bold font-mono",
                      paymentSource.balance >= 0 ? "text-primary" : "text-destructive"
                    )}>
                      {formatAmount(paymentSource.balance)}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-muted/50">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingUp className="w-3 h-3 text-primary" />
                      <p className="text-xs text-muted-foreground">{t('summary.totalIncome')}</p>
                    </div>
                    <p className="text-sm font-semibold text-primary font-mono">+{formatAmount(totalIncome)}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-muted/50">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingDown className="w-3 h-3 text-destructive" />
                      <p className="text-xs text-muted-foreground">{t('summary.totalExpenses')}</p>
                    </div>
                    <p className="text-sm font-semibold text-expense font-mono">-{formatAmount(totalExp)}</p>
                  </div>
                </div>

                {/* Cards */}
                {paymentSource.cards && paymentSource.cards.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {paymentSource.cards.map(card => (
                      <motion.div 
                        key={card.id}
                        whileHover={{ scale: 1.05 }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs"
                        style={{ 
                          borderColor: paymentSource.color + '40',
                          borderLeftWidth: 3,
                          borderLeftColor: paymentSource.color,
                          backgroundColor: paymentSource.color + '10'
                        }}
                      >
                        <CreditCard className="w-3 h-3" style={{ color: paymentSource.color }} />
                        <span className="font-medium">{card.card_name}</span>
                        <span className="text-muted-foreground">****{card.last_four_digits}</span>
                      </motion.div>
                    ))}
                  </div>
                )}

                {/* Installments for this wallet */}
                {sourceInstallments.length > 0 && (
                  <div className="rounded-xl border border-border/50 overflow-hidden">
                    <button
                      onClick={() => setInstallmentsExpanded(!installmentsExpanded)}
                      className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-4 h-4 text-primary" />
                        <span className="text-sm font-medium">
                          Rate ({sourceInstallments.length})
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground font-mono">
                          {formatAmount(sourceInstallments.reduce((s, p) => s + p.remainingAmount, 0))} preostalo
                        </span>
                        <motion.div animate={{ rotate: installmentsExpanded ? 90 : 0 }} transition={{ duration: 0.2 }}>
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </motion.div>
                      </div>
                    </button>
                    <AnimatePresence>
                      {installmentsExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          style={{ overflow: 'hidden' }}
                        >
                          <div className="px-3 pb-3 space-y-2">
                            {sourceInstallments.map(plan => {
                              const catInfo = resolveCategory(plan.category, customCategories);
                              const progress = (plan.paidCount / plan.totalCount) * 100;
                              return (
                                <div key={plan.id} className="p-3 rounded-lg bg-muted/30 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <span className="text-base">{catInfo.icon}</span>
                                      <span className="text-sm font-medium">{plan.description}</span>
                                    </div>
                                    <span className="text-xs font-mono font-semibold">{formatAmount(plan.total_amount)}</span>
                                  </div>
                                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                                    <span>Rata {plan.paidCount}/{plan.totalCount}</span>
                                    <span className="font-medium text-primary">{formatAmount(plan.remainingAmount)} preostalo</span>
                                  </div>
                                  <Progress value={progress} className="h-1.5" />
                                  {plan.nextInstallment && (
                                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                      <Calendar className="w-3 h-3" />
                                      <span>Sljedeća: {format(plan.nextInstallment.due_date, 'd. MMM', { locale: hr })} • {formatAmount(plan.nextInstallment.amount)}</span>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {/* Filters */}
                <TransactionFilters
                  filters={filters}
                  onFiltersChange={(f) => {
                    setFilters(f);
                    setVisibleCount(50);
                  }}
                  showAmountFilter={true}
                  showCardFilter={!!paymentSource.cards?.length}
                  cards={paymentSource.cards}
                />

                {/* Export filtered results */}
                {filteredSourceExpenses.length > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {filteredSourceExpenses.length} {t('transactions.transactions')}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handlePrint}
                        className="h-7 text-xs gap-1.5"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        {t('common.print', 'Ispis')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleExportPDF}
                        className="h-7 text-xs gap-1.5"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        PDF
                      </Button>
                    </div>
                  </div>
                )}

                <BulkActionsToolbar
                  selectedCount={selectedIds.size}
                  totalCount={filteredSourceExpenses.length}
                  onSelectAll={selectAll}
                  onClearSelection={clearSelection}
                  onBulkCategoryChange={handleBulkCategoryChange}
                  onBulkPaymentSourceChange={handleBulkPaymentSourceChange}
                  onBulkDelete={handleBulkDelete}
                />

                {/* Transaction List */}
                {filteredSourceExpenses.length === 0 ? (
                  <div className="py-12 text-center">
                    <p className="text-muted-foreground">
                      {sourceExpenses.length === 0 
                        ? t('transactions.noTransactions')
                        : t('transactions.noSearchResults')}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-0">
                      <AnimatePresence>
                        {filteredSourceExpenses.slice(0, visibleCount).map((expense, index) => {
                          const categoryInfo = resolveCategory(expense.category, customCategories);
                          const cardInfo = getCardInfo(expense);
                          const isSelected = selectedIds.has(expense.id);
                          const balanceAfter = runningBalances.get(expense.id);

                          const prevExpense = index > 0 ? filteredSourceExpenses[index - 1] : null;
                          const showBatchStart = expense.import_batch_id && 
                            (!prevExpense || prevExpense.import_batch_id !== expense.import_batch_id);
                          const batchExpenseCount = showBatchStart 
                            ? filteredSourceExpenses.filter(e => e.import_batch_id === expense.import_batch_id).length 
                            : 0;
                          
                          return (
                            <div key={expense.id}>
                              {showBatchStart && (
                                <div 
                                  className="flex items-center gap-2 my-2 px-2 cursor-pointer group"
                                  onClick={() => {
                                    setSelectedBatchId(expense.import_batch_id!);
                                    setImportBatchDialogOpen(true);
                                  }}
                                >
                                  <div className="flex-1 h-px bg-destructive/40" />
                                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-destructive/10 border border-destructive/20 group-hover:bg-destructive/20 transition-colors">
                                    <FileText className="w-3 h-3 text-destructive" />
                                    <span className="text-[11px] font-medium text-destructive">
                                      Uvoz • {batchExpenseCount} tr.
                                    </span>
                                  </div>
                                  <div className="flex-1 h-px bg-destructive/40" />
                                </div>
                              )}
                              <motion.div
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                onClick={() => {
                                  if (selectedIds.size === 0) {
                                    setDetailExpense(expense);
                                    setDetailDialogOpen(true);
                                  }
                                }}
                                className={cn(
                                  "group py-2.5 px-3 rounded-lg transition-colors cursor-pointer active:bg-muted/70",
                                  isSelected ? "bg-primary/10" : "hover:bg-muted/50"
                                )}
                              >
                                <div className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-x-1.5 gap-y-1">
                                  <div onClick={(e) => e.stopPropagation()} className="shrink-0 row-span-2 self-start pt-0.5">
                                    <Checkbox
                                      checked={isSelected}
                                      onCheckedChange={() => toggleSelection(expense.id)}
                                    />
                                  </div>

                                  <div 
                                    className="w-7 h-7 rounded-md flex items-center justify-center text-sm shrink-0 row-span-2 self-start"
                                    style={{ backgroundColor: expense.type === 'transfer' 
                                      ? 'hsl(var(--muted))' 
                                      : getCategoryBgStyle(categoryInfo)
                                    }}
                                  >
                                    {expense.type === 'transfer' ? (
                                      <ArrowLeftRight className="w-3.5 h-3.5 text-muted-foreground" />
                                    ) : (
                                      categoryInfo.icon
                                    )}
                                  </div>

                                  <p className="min-w-0 font-medium text-foreground truncate text-[15px] leading-tight">
                                    {expense.merchant_name || expense.description}
                                  </p>

                                  {(() => {
                                    const isInboundTransfer = expense.type === 'transfer' && expense.income_source_id === paymentSource?.id;
                                    const colorClass = expense.type === 'income' || isInboundTransfer ? 'text-income' : 
                                      expense.type === 'expense' ? 'text-expense' : 'text-muted-foreground';
                                    const prefix = expense.type === 'expense' ? '-' : 
                                      (expense.type === 'income' || isInboundTransfer) ? '+' : '↔';
                                    return (
                                      <p className={cn("font-mono font-semibold text-[13px] leading-tight shrink-0 whitespace-nowrap text-right", colorClass)}>
                                        {prefix}{formatAmount(expense.amount)}
                                      </p>
                                    );
                                  })()}

                                  <div className="min-w-0 flex items-center gap-1 text-xs text-muted-foreground leading-tight truncate">
                                    {expense.type === 'expense' && (
                                      <span className="truncate max-w-[84px]">{categoryInfo.name}</span>
                                    )}
                                    {expense.type === 'transfer' && expense.income_source_id === paymentSource?.id && (
                                      <span className="text-income whitespace-nowrap">{t('transactions.transfer', 'Prijenos')} ↓</span>
                                    )}
                                    {expense.type === 'transfer' && expense.income_source_id !== paymentSource?.id && (
                                      <span className="text-primary whitespace-nowrap">{t('transactions.transfer', 'Prijenos')} ↑</span>
                                    )}
                                    {expense.type === 'income' && (
                                      <span className="text-income whitespace-nowrap">{t('transactions.income', 'Prihod')}</span>
                                    )}
                                    {cardInfo && (
                                      <>
                                        <span className="text-muted-foreground/40">•</span>
                                        <span className="text-[11px] font-mono whitespace-nowrap">••{cardInfo.last_four_digits}</span>
                                      </>
                                    )}
                                    <span className="text-muted-foreground/40">•</span>
                                    <span className="text-[11px] text-muted-foreground/70 whitespace-nowrap">
                                      {format(expense.date, 'd. MMM', { locale: hr })}
                                    </span>
                                  </div>

                                  {balanceAfter !== undefined && (
                                    <span className={cn(
                                      "text-[13px] font-mono font-bold leading-tight shrink-0 whitespace-nowrap text-right",
                                      balanceAfter >= 0 
                                        ? "text-primary" 
                                        : "text-destructive"
                                    )}>
                                      <span className="text-[10px] font-semibold opacity-60 mr-0.5">S:</span>{formatAmount(balanceAfter)}
                                    </span>
                                  )}
                                </div>
                              </motion.div>
                            </div>
                          );
                        })}
                      </AnimatePresence>
                    </div>
                    {filteredSourceExpenses.length > visibleCount && (
                      <div className="pt-4 pb-2 flex justify-center">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setVisibleCount(prev => prev + 50)}
                          className="rounded-xl gap-2"
                        >
                          {t('common.showMore', 'Prikaži još')} ({filteredSourceExpenses.length - visibleCount})
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <TransactionDetailDialog
        expense={detailExpense}
        open={detailDialogOpen}
        onOpenChange={(open) => {
          setDetailDialogOpen(open);
          if (!open) setDetailExpense(null);
        }}
        onEdit={(expense) => {
          setDetailDialogOpen(false);
          setDetailExpense(null);
          handleEdit(expense);
        }}
        onDelete={(id) => {
          setDetailDialogOpen(false);
          setDetailExpense(null);
          handleDelete(id);
        }}
      />

      <EditTransactionDialog
        expense={editingExpense}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSave={handleSave}
      />

      {selectedBatchId && (
        <ImportBatchDialog
          open={importBatchDialogOpen}
          onOpenChange={setImportBatchDialogOpen}
          batchId={selectedBatchId}
          allExpenses={expenses}
          onDeleteBatch={async (ids) => {
            for (const id of ids) {
              await onDelete(id);
            }
            setImportBatchDialogOpen(false);
            setSelectedBatchId(null);
          }}
        />
      )}

      {/* PDF Parsing Overlay */}
      <AnimatePresence>
        {parsing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center gap-6 p-8"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="flex flex-col items-center gap-4 text-center"
            >
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <FileText className="w-8 h-8 text-primary animate-pulse" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-foreground">Analiziram izvod...</h3>
                <p className="text-sm text-muted-foreground max-w-xs">
                  AI obrađuje PDF i prepoznaje transakcije. To može potrajati do 30 sekundi.
                </p>
              </div>
              <div className="w-48">
                <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                  <motion.div
                    className="h-full bg-primary rounded-full"
                    initial={{ x: '-100%' }}
                    animate={{ x: '100%' }}
                    transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
                    style={{ width: '40%' }}
                  />
                </div>
              </div>
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PDF Preview Dialog */}
      <Dialog open={pdfPreviewOpen} onOpenChange={setPdfPreviewOpen}>
        <DialogContent showBackButton={false} className="sm:max-w-lg glass-card border-border/50 max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-primary" />
              {t('import.foundTransactions')} → {paymentSource?.name}
            </DialogTitle>
          </DialogHeader>
          {parsedData && (
            <div className="flex-1 overflow-y-auto space-y-4">
              {(parsedData.detected_bank || parsedData.account_iban || parsedData.cards_detected.length > 0) && (
                <div className="p-3 bg-primary/10 rounded-xl text-sm space-y-1">
                  {parsedData.detected_bank && (
                    <p className="font-medium">🏦 {t('import.bank')}: <span className="text-primary">{parsedData.detected_bank}</span></p>
                  )}
                  {parsedData.account_iban && (
                    <p className="text-muted-foreground text-xs font-mono">{t('import.account')}: {parsedData.account_iban}</p>
                  )}
                  {parsedData.cards_detected.length > 0 && (
                    <p className="text-muted-foreground text-xs">💳 {t('import.cards')}: {parsedData.cards_detected.map(c => `*${c}`).join(', ')}</p>
                  )}
                </div>
              )}
              {parsedData.summary && (
                <div className="grid grid-cols-3 gap-2 p-3 bg-muted/50 rounded-xl text-sm">
                  <div className="text-center">
                    <p className="text-muted-foreground">{t('import.income')}</p>
                    <p className="font-bold text-income">{formatAmount(parsedData.summary.total_income)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-muted-foreground">{t('import.expenses')}</p>
                    <p className="font-bold text-expense">{formatAmount(parsedData.summary.total_expenses)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-muted-foreground">{t('import.total')}</p>
                    <p className="font-bold">{parsedData.summary.transaction_count}</p>
                  </div>
                </div>
              )}
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {parsedData.transactions.map((tx, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-background/50 rounded-xl text-sm">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{tx.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {tx.date.toLocaleDateString()} • {tx.merchant_name || tx.category}
                        {tx.card_last4 && <span className="ml-1 font-mono">(*{tx.card_last4})</span>}
                      </p>
                    </div>
                    <p className={cn("font-mono font-bold", 
                      tx.type === 'income' ? 'text-income' : tx.type === 'transfer' ? 'text-muted-foreground' : 'text-expense'
                    )}>
                      {tx.type === 'income' ? '+' : tx.type === 'transfer' ? '↔' : '-'}{formatAmount(tx.amount)}
                    </p>
                  </div>
                ))}
              </div>
              <div className="p-2 bg-primary/5 rounded-lg text-xs text-muted-foreground text-center">
                ℹ️ Sve transakcije će biti dodijeljene izvoru: <strong className="text-foreground">{paymentSource?.name}</strong>
              </div>
              <Button
                onClick={handleImportPDFTransactions}
                disabled={isImportingPdf}
                className="w-full rounded-xl"
              >
                {isImportingPdf ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Uvozim...
                  </>
                ) : (
                  t('import.importCount', { count: parsedData.transactions.length })
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Duplicate Warning Dialog */}
      <Dialog open={duplicateWarningOpen} onOpenChange={setDuplicateWarningOpen}>
        <DialogContent showBackButton={false} className="sm:max-w-lg glass-card border-border/50 max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              {t('import.duplicatesFound')}
            </DialogTitle>
          </DialogHeader>
          {duplicateInfo && (
            <div className="flex-1 overflow-y-auto space-y-4">
              <div className="p-3 bg-orange-500/10 border border-orange-500/20 rounded-xl text-sm">
                <p className="font-medium text-orange-600 dark:text-orange-400">
                  {duplicateInfo.duplicates.length > 0 && `${duplicateInfo.duplicates.length} sigurnih duplikata`}
                  {duplicateInfo.duplicates.length > 0 && duplicateInfo.fuzzyDuplicates.length > 0 && ' • '}
                  {duplicateInfo.fuzzyDuplicates.length > 0 && `${duplicateInfo.fuzzyDuplicates.length} mogućih duplikata (±3 dana)`}
                </p>
                <p className="text-muted-foreground text-xs mt-1">
                  {t('import.newTransactionsReady', { count: duplicateInfo.unique.length })}
                </p>
              </div>

              {/* Strict duplicates */}
              {duplicateInfo.duplicates.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-destructive/80">🚫 Sigurni duplikati (isti datum i iznos):</p>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {duplicateInfo.duplicates.map((tx, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 bg-destructive/5 rounded-lg text-sm border border-destructive/10 opacity-60">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate text-xs">{tx.description}</p>
                          <p className="text-xs text-muted-foreground">{tx.date.toLocaleDateString()}</p>
                        </div>
                        <p className={cn("font-mono text-xs", tx.type === 'income' ? 'text-income' : 'text-expense')}>
                          {tx.type === 'income' ? '+' : '-'}{formatAmount(tx.amount)}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center space-x-2 p-2 bg-muted/30 rounded-lg">
                    <Checkbox id="include-strict-dups-source" checked={includeDuplicates} onCheckedChange={(checked) => setIncludeDuplicates(checked === true)} />
                    <label htmlFor="include-strict-dups-source" className="text-xs cursor-pointer text-muted-foreground">
                      Ipak uvezi sigurne duplikate ({duplicateInfo.duplicates.length})
                    </label>
                  </div>
                </div>
              )}

              {/* Fuzzy duplicates - comparison view with individual checkboxes */}
              {duplicateInfo.fuzzyDuplicates.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-amber-600 dark:text-amber-400">⚠️ Mogući duplikati (±3 dana, isti iznos):</p>
                  <p className="text-xs text-muted-foreground">Usporedi i odaberi koje želiš uvesti:</p>
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {duplicateInfo.fuzzyDuplicates.map((tx, idx) => {
                      const matchedExpense = duplicateInfo.fuzzyMatchedExpenses[idx];
                      return (
                        <div 
                          key={idx} 
                          className={`rounded-xl text-sm border cursor-pointer transition-colors overflow-hidden ${
                            selectedFuzzy.has(idx) 
                              ? 'border-primary/30' 
                              : 'border-amber-500/20'
                          }`}
                          onClick={() => {
                            const next = new Set(selectedFuzzy);
                            next.has(idx) ? next.delete(idx) : next.add(idx);
                            setSelectedFuzzy(next);
                          }}
                        >
                          {/* Existing transaction */}
                          <div className="flex items-center gap-2 p-2 bg-muted/40 border-b border-border/30">
                            <span className="text-[10px] font-medium text-muted-foreground uppercase w-14 shrink-0">Postojeća</span>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate text-xs">{matchedExpense.description}</p>
                              <p className="text-[10px] text-muted-foreground">{matchedExpense.date.toLocaleDateString()}</p>
                            </div>
                            <p className={cn("font-mono text-xs shrink-0", matchedExpense.type === 'income' ? 'text-income' : 'text-expense')}>
                              {matchedExpense.type === 'income' ? '+' : '-'}{formatAmount(Number(matchedExpense.amount))}
                            </p>
                          </div>
                          {/* New transaction */}
                          <div className={`flex items-center gap-2 p-2 ${selectedFuzzy.has(idx) ? 'bg-primary/5' : 'bg-amber-500/5'}`}>
                            <Checkbox 
                              checked={selectedFuzzy.has(idx)}
                              className="ml-0.5"
                              onCheckedChange={() => {
                                const next = new Set(selectedFuzzy);
                                next.has(idx) ? next.delete(idx) : next.add(idx);
                                setSelectedFuzzy(next);
                              }}
                            />
                            <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400 uppercase w-8 shrink-0">Nova</span>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate text-xs">{tx.description}</p>
                              <p className="text-[10px] text-muted-foreground">{tx.date.toLocaleDateString()}</p>
                            </div>
                            <p className={cn("font-mono text-xs shrink-0", tx.type === 'income' ? 'text-income' : 'text-expense')}>
                              {tx.type === 'income' ? '+' : '-'}{formatAmount(tx.amount)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="flex gap-2 mt-4">
            <Button variant="outline" onClick={() => { setDuplicateWarningOpen(false); clearParsedData(); setDuplicateInfo(null); }} className="rounded-xl">
              {t('common.cancel')}
            </Button>
            <Button onClick={handleConfirmImportWithDuplicates} disabled={isImportingPdf} className="rounded-xl">
              {isImportingPdf ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Uvozim...
                </>
              ) : (
                t('import.importCount', { 
                  count: (duplicateInfo?.unique.length || 0) + 
                         selectedFuzzy.size + 
                         (includeDuplicates ? (duplicateInfo?.duplicates.length || 0) : 0)
                })
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV Import Dialog */}
      {onImportCSV && paymentSource && (
        <CSVImportDialog
          onImport={onImportCSV}
          existingExpenses={expenses}
          externalOpen={csvImportOpen}
          onExternalOpenChange={setCsvImportOpen}
          defaultPaymentSource={`custom:${paymentSource.id}`}
          findDuplicates={findDuplicates}
        />
      )}
    </>
  );
};
