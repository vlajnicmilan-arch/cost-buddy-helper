import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Upload, FileText, Check, AlertCircle, Loader2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { parseCSV, ParsedTransaction } from '@/lib/csvParsers';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getCategoryInfo, Category } from '@/types/expense';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';

interface CSVImportDialogProps {
  onImport: (transactions: ParsedTransaction[]) => Promise<void>;
}

type ImportStep = 'upload' | 'preview' | 'importing' | 'complete';

export const CSVImportDialog = ({ onImport }: CSVImportDialogProps) => {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<ImportStep>('upload');
  const [transactions, setTransactions] = useState<ParsedTransaction[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [source, setSource] = useState('');
  const [error, setError] = useState('');
  const [importedCount, setImportedCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setStep('upload');
    setTransactions([]);
    setSelectedIndices(new Set());
    setSource('');
    setError('');
    setImportedCount(0);
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError('');

    try {
      const content = await file.text();
      const result = parseCSV(content);

      if (!result.success) {
        setError(result.errors.join(', ') || 'Greška pri čitanju datoteke');
        return;
      }

      setTransactions(result.transactions);
      setSource(result.source);
      setSelectedIndices(new Set(result.transactions.map((_, i) => i)));
      setStep('preview');
    } catch (err) {
      setError('Greška pri čitanju datoteke');
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

  const handleImport = async () => {
    const selectedTransactions = transactions.filter((_, i) => selectedIndices.has(i));
    if (selectedTransactions.length === 0) return;

    setStep('importing');

    try {
      await onImport(selectedTransactions);
      setImportedCount(selectedTransactions.length);
      setStep('complete');
    } catch (err) {
      setError('Greška pri uvozu transakcija');
      setStep('preview');
    }
  };

  const handleClose = () => {
    setOpen(false);
    setTimeout(resetState, 200);
  };

  const formatAmount = (amount: number, type: 'expense' | 'income') => {
    const prefix = type === 'income' ? '+' : '-';
    return `${prefix}${amount.toFixed(2)} €`;
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) setTimeout(resetState, 200);
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full gap-2 rounded-xl">
          <Upload className="w-4 h-4" />
          Uvezi CSV
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg glass-card border-border/50 max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            {step === 'upload' && 'Uvezi transakcije'}
            {step === 'preview' && `Pregled - ${source}`}
            {step === 'importing' && 'Uvoz u tijeku...'}
            {step === 'complete' && 'Uvoz završen!'}
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
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border/50 rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-all"
              >
                <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="font-medium mb-2">Klikni za odabir CSV datoteke</p>
                <p className="text-sm text-muted-foreground">
                  Podržani formati: Revolut, Aircash, PBZ, Erste, Zagrebačka banka
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
                <p className="text-sm font-medium mb-2">Kako izvesti CSV?</p>
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
              <div className="flex items-center justify-between py-3 border-b border-border/30">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={selectedIndices.size === transactions.length}
                    onCheckedChange={toggleAll}
                  />
                  <span className="text-sm font-medium">
                    Odabrano: {selectedIndices.size} / {transactions.length}
                  </span>
                </label>
                <span className="text-xs text-muted-foreground px-2 py-1 bg-muted/50 rounded-lg">
                  {source}
                </span>
              </div>

              <ScrollArea className="flex-1 max-h-[300px] -mx-6 px-6">
                <div className="space-y-1 py-2">
                  {transactions.map((tx, index) => {
                    const categoryInfo = getCategoryInfo(tx.category);
                    return (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.02 }}
                        onClick={() => toggleTransaction(index)}
                        className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${
                          selectedIndices.has(index) 
                            ? 'bg-muted/50 border border-primary/20' 
                            : 'bg-muted/20 border border-transparent opacity-50'
                        }`}
                      >
                        <Checkbox
                          checked={selectedIndices.has(index)}
                          onCheckedChange={() => toggleTransaction(index)}
                        />
                        <span className="text-lg">{categoryInfo.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {tx.description}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(tx.date, 'd. MMM yyyy', { locale: hr })}
                          </p>
                        </div>
                        <span className={`text-sm font-semibold ${
                          tx.type === 'income' ? 'text-income' : 'text-expense'
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
                  Natrag
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={selectedIndices.size === 0}
                  className="flex-1 rounded-xl bg-primary hover:bg-primary/90"
                >
                  Uvezi {selectedIndices.size} transakcija
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
              <p className="font-medium">Uvoz transakcija u tijeku...</p>
              <p className="text-sm text-muted-foreground mt-1">
                Molimo pričekajte
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
              <p className="font-medium text-lg">Uspješno uvezeno!</p>
              <p className="text-muted-foreground mt-1">
                {importedCount} transakcija dodano u tvoje troškove
              </p>
              <Button
                onClick={handleClose}
                className="mt-6 rounded-xl"
              >
                Zatvori
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
};
