import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { FileSpreadsheet, Info, FileText, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CSVImportDialog } from './CSVImportDialog';
import { ParsedTransaction } from '@/lib/csvParsers';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { usePDFParser } from '@/hooks/usePDFParser';
import { toast } from 'sonner';

interface BankConnectionProps {
  onImportCSV?: (transactions: ParsedTransaction[]) => Promise<void>;
}

const SUPPORTED_SOURCES = [
  { id: 'revolut', name: 'Revolut', logo: '💳' },
  { id: 'aircash', name: 'Aircash', logo: '📱' },
  { id: 'pbz', name: 'PBZ', logo: '🏦' },
  { id: 'erste', name: 'Erste Bank', logo: '🏛️' },
  { id: 'zaba', name: 'Zagrebačka banka', logo: '🏦' },
  { id: 'other', name: 'Ostale banke', logo: '📄' },
];

export const BankConnection = ({ onImportCSV }: BankConnectionProps) => {
  const [infoOpen, setInfoOpen] = useState(false);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
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

    await onImportCSV(transactions);
    setPdfPreviewOpen(false);
    clearParsedData();
    toast.success(`Uvezeno ${transactions.length} transakcija iz PDF-a`);
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
