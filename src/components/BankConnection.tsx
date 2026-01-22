import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { FileSpreadsheet, Info, FileText, Loader2, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { CSVImportDialog } from './CSVImportDialog';
import { ParsedTransaction } from '@/lib/csvParsers';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { usePDFParser } from '@/hooks/usePDFParser';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';

interface BankConnectionProps {
  onImportCSV?: (transactions: ParsedTransaction[]) => Promise<void>;
  findDuplicates?: (transactions: ParsedTransaction[]) => { duplicates: ParsedTransaction[]; unique: ParsedTransaction[] };
}

const SUPPORTED_SOURCES = [
  { id: 'revolut', name: 'Revolut', logo: '💳' },
  { id: 'aircash', name: 'Aircash', logo: '📱' },
  { id: 'pbz', name: 'PBZ', logo: '🏦' },
  { id: 'erste', name: 'Erste Bank', logo: '🏛️' },
  { id: 'zaba', name: 'Zagrebačka banka', logo: '🏦' },
  { id: 'other', name: 'Ostale banke', logo: '📄' },
];

export const BankConnection = ({ onImportCSV, findDuplicates }: BankConnectionProps) => {
  const [infoOpen, setInfoOpen] = useState(false);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [duplicateWarningOpen, setDuplicateWarningOpen] = useState(false);
  const [includeDuplicates, setIncludeDuplicates] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState<{ duplicates: ParsedTransaction[]; unique: ParsedTransaction[] } | null>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const { parsing, parsedData, parsePDF, clearParsedData } = usePDFParser();

  const handlePDFSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      toast.error('Molimo odaberi PDF datoteku');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      const result = await parsePDF(base64);
      
      if (result && result.transactions.length > 0) {
        setPdfPreviewOpen(true);
      }
    };
    reader.readAsDataURL(file);

    // Reset input
    if (pdfInputRef.current) {
      pdfInputRef.current.value = '';
    }
  };

  const handleImportPDFTransactions = async () => {
    if (!parsedData || !onImportCSV) return;

    const transactions: ParsedTransaction[] = parsedData.transactions.map(tx => ({
      date: tx.date,
      description: tx.description,
      amount: tx.amount,
      type: tx.type,
      category: tx.category,
      merchant_name: tx.merchant_name || undefined,
      source: 'pdf',
      payment_source: tx.payment_source || 'bank'
    }));

    // Check for duplicates if function is provided
    if (findDuplicates) {
      const { duplicates, unique } = findDuplicates(transactions);
      
      if (duplicates.length > 0) {
        setDuplicateInfo({ duplicates, unique });
        setIncludeDuplicates(false);
        setPdfPreviewOpen(false);
        setDuplicateWarningOpen(true);
        return;
      }
    }

    // No duplicates, import all
    await onImportCSV(transactions);
    setPdfPreviewOpen(false);
    clearParsedData();
    toast.success(`Uvezeno ${transactions.length} transakcija iz PDF-a`);
  };

  const handleConfirmImportWithDuplicates = async () => {
    if (!duplicateInfo || !onImportCSV) return;

    const transactionsToImport = includeDuplicates 
      ? [...duplicateInfo.unique, ...duplicateInfo.duplicates]
      : duplicateInfo.unique;

    if (transactionsToImport.length === 0) {
      toast.info('Nema novih transakcija za uvoz');
      setDuplicateWarningOpen(false);
      clearParsedData();
      setDuplicateInfo(null);
      return;
    }

    await onImportCSV(transactionsToImport);
    setDuplicateWarningOpen(false);
    clearParsedData();
    setDuplicateInfo(null);
    toast.success(`Uvezeno ${transactionsToImport.length} transakcija`);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-2xl p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5" />
          Uvoz transakcija
        </h3>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 rounded-lg"
                onClick={() => setInfoOpen(true)}
              >
                <Info className="w-4 h-4 text-muted-foreground" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Podržani formati</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        Uvezi transakcije iz CSV ili PDF izvoza svoje banke.
      </p>

      <div className="flex flex-col gap-2">
        {onImportCSV && <CSVImportDialog onImport={onImportCSV} />}
        
        {/* PDF Import */}
        <input
          ref={pdfInputRef}
          type="file"
          accept="application/pdf"
          onChange={handlePDFSelect}
          className="hidden"
          id="pdf-input"
        />
        <Button
          variant="outline"
          className="w-full gap-2 rounded-xl"
          onClick={() => pdfInputRef.current?.click()}
          disabled={parsing}
        >
          {parsing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <FileText className="w-4 h-4" />
          )}
          {parsing ? 'Analiziram PDF...' : 'Uvezi iz PDF-a'}
        </Button>
      </div>

      {/* PDF Preview Dialog */}
      <Dialog open={pdfPreviewOpen} onOpenChange={setPdfPreviewOpen}>
        <DialogContent className="sm:max-w-lg glass-card border-border/50 max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Pronađene transakcije</DialogTitle>
          </DialogHeader>
          
          {parsedData && (
            <div className="flex-1 overflow-y-auto space-y-4">
              {/* Detected bank and account info */}
              {(parsedData.detected_bank || parsedData.account_iban || parsedData.cards_detected.length > 0) && (
                <div className="p-3 bg-primary/10 rounded-xl text-sm space-y-1">
                  {parsedData.detected_bank && (
                    <p className="font-medium">
                      🏦 Banka: <span className="text-primary">{parsedData.detected_bank}</span>
                    </p>
                  )}
                  {parsedData.account_iban && (
                    <p className="text-muted-foreground text-xs font-mono">
                      Račun: {parsedData.account_iban}
                    </p>
                  )}
                  {parsedData.cards_detected.length > 0 && (
                    <p className="text-muted-foreground text-xs">
                      💳 Kartice: {parsedData.cards_detected.map(c => `*${c}`).join(', ')}
                    </p>
                  )}
                </div>
              )}

              {parsedData.summary && (
                <div className="grid grid-cols-3 gap-2 p-3 bg-muted/50 rounded-xl text-sm">
                  <div className="text-center">
                    <p className="text-muted-foreground">Prihodi</p>
                    <p className="font-bold text-income">€{parsedData.summary.total_income.toFixed(2)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-muted-foreground">Rashodi</p>
                    <p className="font-bold text-expense">€{parsedData.summary.total_expenses.toFixed(2)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-muted-foreground">Ukupno</p>
                    <p className="font-bold">{parsedData.summary.transaction_count}</p>
                  </div>
                </div>
              )}

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {parsedData.transactions.map((tx, idx) => (
                  <div 
                    key={idx} 
                    className="flex items-center justify-between p-3 bg-background/50 rounded-xl text-sm"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{tx.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {tx.date.toLocaleDateString('hr-HR')} • {tx.merchant_name || tx.category}
                        {tx.card_last4 && <span className="ml-1 font-mono">(*{tx.card_last4})</span>}
                      </p>
                    </div>
                    <p className={`font-mono font-bold ${tx.type === 'income' ? 'text-income' : 'text-expense'}`}>
                      {tx.type === 'income' ? '+' : '-'}€{tx.amount.toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>

              <Button 
                onClick={handleImportPDFTransactions}
                className="w-full rounded-xl"
              >
                Uvezi {parsedData.transactions.length} transakcija
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Duplicate Warning Dialog */}
      <Dialog open={duplicateWarningOpen} onOpenChange={setDuplicateWarningOpen}>
        <DialogContent className="sm:max-w-lg glass-card border-border/50 max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              Pronađeni duplikati
            </DialogTitle>
          </DialogHeader>
          
          {duplicateInfo && (
            <div className="flex-1 overflow-y-auto space-y-4">
              <div className="p-3 bg-orange-500/10 border border-orange-500/20 rounded-xl text-sm">
                <p className="font-medium text-orange-600 dark:text-orange-400">
                  {duplicateInfo.duplicates.length} transakcija već postoji u bazi
                </p>
                <p className="text-muted-foreground text-xs mt-1">
                  {duplicateInfo.unique.length} novih transakcija je spremno za uvoz
                </p>
              </div>

              {duplicateInfo.duplicates.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Duplikati:</p>
                  <div className="max-h-40 overflow-y-auto space-y-2">
                    {duplicateInfo.duplicates.map((tx, idx) => (
                      <div 
                        key={idx} 
                        className="flex items-center justify-between p-2 bg-muted/50 rounded-lg text-sm border border-border/50"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate text-xs">{tx.description}</p>
                          <p className="text-xs text-muted-foreground">
                            {tx.date.toLocaleDateString('hr-HR')}
                          </p>
                        </div>
                        <p className={`font-mono text-xs ${tx.type === 'income' ? 'text-income' : 'text-expense'}`}>
                          {tx.type === 'income' ? '+' : '-'}€{tx.amount.toFixed(2)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center space-x-2 p-3 bg-muted/50 rounded-xl">
                <Checkbox 
                  id="include-duplicates" 
                  checked={includeDuplicates}
                  onCheckedChange={(checked) => setIncludeDuplicates(checked === true)}
                />
                <label htmlFor="include-duplicates" className="text-sm cursor-pointer">
                  Svejedno uvezi duplikate ({duplicateInfo.duplicates.length})
                </label>
              </div>
            </div>
          )}

          <DialogFooter className="flex gap-2 mt-4">
            <Button 
              variant="outline" 
              onClick={() => {
                setDuplicateWarningOpen(false);
                clearParsedData();
                setDuplicateInfo(null);
              }}
              className="rounded-xl"
            >
              Odustani
            </Button>
            <Button 
              onClick={handleConfirmImportWithDuplicates}
              className="rounded-xl"
            >
              Uvezi {includeDuplicates 
                ? (duplicateInfo?.unique.length || 0) + (duplicateInfo?.duplicates.length || 0)
                : duplicateInfo?.unique.length || 0
              } transakcija
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Info Dialog */}
      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent className="sm:max-w-md glass-card border-border/50">
          <DialogHeader>
            <DialogTitle>Podržani izvori</DialogTitle>
          </DialogHeader>
          
          <div className="grid grid-cols-2 gap-3 mt-4">
            {SUPPORTED_SOURCES.map((source) => (
              <div
                key={source.id}
                className="flex items-center gap-3 p-3 rounded-xl bg-muted/50"
              >
                <span className="text-xl">{source.logo}</span>
                <span className="text-sm font-medium">{source.name}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 p-4 bg-muted/50 rounded-xl">
            <p className="text-sm font-medium mb-2">Podržani formati</p>
            <ul className="text-xs text-muted-foreground space-y-2">
              <li>
                <strong>CSV:</strong> Standardni format za izvoz transakcija
              </li>
              <li>
                <strong>PDF:</strong> AI automatski prepoznaje transakcije iz PDF izvoda
              </li>
            </ul>
          </div>

          <div className="mt-2 p-4 bg-muted/50 rounded-xl">
            <p className="text-sm font-medium mb-2">Kako izvesti?</p>
            <ul className="text-xs text-muted-foreground space-y-2">
              <li>
                <strong>Revolut:</strong> Transactions → Export statement
              </li>
              <li>
                <strong>Aircash:</strong> Transakcije → Izvoz
              </li>
              <li>
                <strong>Internet bankarstvo:</strong> Izvodi/Prometi → Preuzmi
              </li>
            </ul>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};
