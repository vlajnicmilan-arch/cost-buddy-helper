import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Download, Upload, FileJson, Check, AlertCircle, Loader2, HardDrive } from 'lucide-react';
import { motion } from 'framer-motion';
import { useStorage } from '@/contexts/StorageContext';
import { exportLocalData, importLocalData } from '@/lib/storage/indexedDB';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface BackupRestoreProps {
  onDataImported?: () => void;
}

export const BackupRestore = ({ onDataImported }: BackupRestoreProps) => {
  const [open, setOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ expenses: number; items: number } | null>(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { storageMode } = useStorage();
  const { user } = useAuth();

  const isLocalMode = storageMode === 'local';

  const handleExport = async () => {
    setIsExporting(true);
    setError('');

    try {
      let jsonData: string;

      if (isLocalMode) {
        jsonData = await exportLocalData();
      } else {
        // Export from Supabase
        if (!user) throw new Error('Nisi prijavljen');

        const { data: expenses, error: expError } = await supabase
          .from('expenses')
          .select('*')
          .eq('user_id', user.id);

        if (expError) throw expError;

        const { data: receiptItems, error: itemsError } = await supabase
          .from('receipt_items')
          .select('*')
          .in('expense_id', expenses?.map(e => e.id) || []);

        if (itemsError) throw itemsError;

        jsonData = JSON.stringify({
          version: 1,
          exportedAt: new Date().toISOString(),
          source: 'cloud',
          expenses: expenses || [],
          receiptItems: receiptItems || []
        }, null, 2);
      }

      // Create and download file
      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `finmate-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Backup uspješno izvezen');
    } catch (err) {
      console.error('Export error:', err);
      setError('Greška pri izvozu podataka');
      toast.error('Greška pri izvozu');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setError('');
    setImportResult(null);

    try {
      const content = await file.text();
      const data = JSON.parse(content);

      // Validate data structure
      if (!data.expenses || !Array.isArray(data.expenses)) {
        throw new Error('Nevažeći format datoteke');
      }

      if (isLocalMode) {
        const result = await importLocalData(content);
        setImportResult(result);
      } else {
        // Import to Supabase
        if (!user) throw new Error('Nisi prijavljen');

        let expenseCount = 0;
        let itemCount = 0;

        // Import expenses
        for (const expense of data.expenses) {
          const { data: inserted, error: insertError } = await supabase
            .from('expenses')
            .insert({
              user_id: user.id,
              amount: expense.amount,
              description: expense.description,
              category: expense.category || 'other',
              type: expense.type || 'expense',
              date: expense.date,
              payment_source: expense.payment_source || 'cash',
              merchant_name: expense.merchant_name,
              ai_extracted: expense.ai_extracted || false
            })
            .select()
            .single();

          if (insertError) {
            console.error('Error importing expense:', insertError);
            continue;
          }

          expenseCount++;

          // Import receipt items for this expense
          if (data.receiptItems && inserted) {
            const relatedItems = data.receiptItems.filter(
              (item: any) => item.expense_id === expense.id
            );

            for (const item of relatedItems) {
              const { error: itemError } = await supabase
                .from('receipt_items')
                .insert({
                  expense_id: inserted.id,
                  name: item.name,
                  quantity: item.quantity || 1,
                  unit_price: item.unit_price,
                  total_price: item.total_price
                });

              if (!itemError) itemCount++;
            }
          }
        }

        setImportResult({ expenses: expenseCount, items: itemCount });
      }

      toast.success('Podaci uspješno uvezeni');
      onDataImported?.();
    } catch (err) {
      console.error('Import error:', err);
      setError(err instanceof Error ? err.message : 'Greška pri uvozu podataka');
      toast.error('Greška pri uvozu');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const resetState = () => {
    setError('');
    setImportResult(null);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-2xl p-6"
    >
      <div className="flex items-center gap-2 mb-4">
        <HardDrive className="w-5 h-5" />
        <h3 className="text-lg font-semibold">Backup i Restore</h3>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        Izvezi svoje podatke kao JSON datoteku ili uvezi postojeći backup.
      </p>

      <div className="space-y-3">
        {/* Export Button */}
        <Button
          variant="outline"
          className="w-full gap-2 rounded-xl justify-start"
          onClick={handleExport}
          disabled={isExporting}
        >
          {isExporting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          Izvezi podatke (JSON)
        </Button>

        {/* Import Button */}
        <Dialog open={open} onOpenChange={(isOpen) => {
          setOpen(isOpen);
          if (!isOpen) resetState();
        }}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              className="w-full gap-2 rounded-xl justify-start"
            >
              <Upload className="w-4 h-4" />
              Uvezi backup
            </Button>
          </DialogTrigger>

          <DialogContent className="sm:max-w-md glass-card border-border/50">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileJson className="w-5 h-5" />
                Uvezi backup
              </DialogTitle>
            </DialogHeader>

            <div className="py-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleImport}
                className="hidden"
              />

              {!importResult ? (
                <>
                  <div
                    onClick={() => !isImporting && fileInputRef.current?.click()}
                    className={`border-2 border-dashed border-border/50 rounded-xl p-8 text-center cursor-pointer transition-all ${
                      isImporting ? 'opacity-50' : 'hover:border-primary/50 hover:bg-muted/30'
                    }`}
                  >
                    {isImporting ? (
                      <>
                        <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-primary" />
                        <p className="font-medium">Uvozim podatke...</p>
                      </>
                    ) : (
                      <>
                        <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                        <p className="font-medium mb-2">Odaberi JSON datoteku</p>
                        <p className="text-sm text-muted-foreground">
                          Datoteka mora biti prethodno izvezena iz FinMate
                        </p>
                      </>
                    )}
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

                  <div className="mt-4 p-4 bg-muted/30 rounded-xl">
                    <p className="text-xs text-muted-foreground">
                      <strong>Napomena:</strong> Uvoz će dodati nove transakcije bez brisanja postojećih. 
                      Duplicirane transakcije neće biti automatski uklonjene.
                    </p>
                  </div>
                </>
              ) : (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center py-6"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', delay: 0.1 }}
                    className="w-16 h-16 mx-auto mb-4 rounded-full bg-income/20 flex items-center justify-center"
                  >
                    <Check className="w-8 h-8 text-income" />
                  </motion.div>
                  <p className="font-medium text-lg">Uvoz završen!</p>
                  <p className="text-muted-foreground mt-1">
                    Uvezeno {importResult.expenses} transakcija
                    {importResult.items > 0 && ` i ${importResult.items} artikala`}
                  </p>
                  <Button
                    onClick={() => setOpen(false)}
                    className="mt-6 rounded-xl"
                  >
                    Zatvori
                  </Button>
                </motion.div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </motion.div>
  );
};
