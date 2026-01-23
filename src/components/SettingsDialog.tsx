import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Settings, Zap, RefreshCw, Loader2, Download, Upload, Check, AlertCircle, FileJson, Coins } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { 
  getAutoUpdatePreference, 
  setAutoUpdatePreference,
  checkForUpdates 
} from '@/components/PWAUpdatePrompt';
import { useStorage } from '@/contexts/StorageContext';
import { useAuth } from '@/hooks/useAuth';
import { useCurrency, CURRENCIES, CurrencyCode } from '@/contexts/CurrencyContext';
import { exportLocalData, importLocalData } from '@/lib/storage/indexedDB';
import { supabase } from '@/integrations/supabase/client';

interface SettingsDialogProps {
  onDataImported?: () => void;
}

export const SettingsDialog = ({ onDataImported }: SettingsDialogProps = {}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [autoUpdate, setAutoUpdate] = useState(false);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  
  // Backup/Restore state
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ expenses: number; items: number } | null>(null);
  const [importError, setImportError] = useState('');
  const [showImportDialog, setShowImportDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { storageMode } = useStorage();
  const { user } = useAuth();
  const { currency, setCurrency } = useCurrency();
  const isLocalMode = storageMode === 'local';

  useEffect(() => {
    if (open) {
      setAutoUpdate(getAutoUpdatePreference());
    }
  }, [open]);

  const handleAutoUpdateChange = (enabled: boolean) => {
    setAutoUpdate(enabled);
    setAutoUpdatePreference(enabled);
    if (enabled) {
      toast.success('Automatsko ažuriranje uključeno');
    } else {
      toast.info('Automatsko ažuriranje isključeno');
    }
  };

  const handleCheckForUpdates = async () => {
    setIsCheckingUpdate(true);
    try {
      await checkForUpdates();
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);

    try {
      let jsonData: string;

      if (isLocalMode) {
        jsonData = await exportLocalData();
      } else {
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

      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vm-balance-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Backup uspješno izvezen');
    } catch (err) {
      console.error('Export error:', err);
      toast.error('Greška pri izvozu');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportError('');
    setImportResult(null);

    try {
      const content = await file.text();
      const data = JSON.parse(content);

      if (!data.expenses || !Array.isArray(data.expenses)) {
        throw new Error('Nevažeći format datoteke');
      }

      if (isLocalMode) {
        const result = await importLocalData(content);
        setImportResult(result);
      } else {
        if (!user) throw new Error('Nisi prijavljen');

        let expenseCount = 0;
        let itemCount = 0;

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

          if (insertError) continue;
          expenseCount++;

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
      setImportError(err instanceof Error ? err.message : 'Greška pri uvozu podataka');
      toast.error('Greška pri uvozu');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const resetImportState = () => {
    setImportError('');
    setImportResult(null);
    setShowImportDialog(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-xl h-9 w-9">
            <Settings className="w-4 h-4 sm:w-5 sm:h-5" />
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              {t('settings.title', 'Postavke')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Updates Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {t('settings.updates', 'Ažuriranja')}
              </h3>
              
              {/* Auto-update toggle */}
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Zap className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <Label htmlFor="auto-update-settings" className="text-sm font-medium cursor-pointer">
                      {t('settings.autoUpdate', 'Automatsko ažuriranje')}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {t('settings.autoUpdateDesc', 'Automatski primijeni nova ažuriranja')}
                    </p>
                  </div>
                </div>
                <Switch
                  id="auto-update-settings"
                  checked={autoUpdate}
                  onCheckedChange={handleAutoUpdateChange}
                />
              </div>

              {/* Check for updates button */}
              <Button
                variant="outline"
                className="w-full gap-2 rounded-xl"
                onClick={handleCheckForUpdates}
                disabled={isCheckingUpdate}
              >
                {isCheckingUpdate ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
              {t('settings.checkForUpdates', 'Provjeri ažuriranja')}
            </Button>
          </div>

          <Separator />

          {/* Currency Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {t('settings.display', 'Prikaz')}
            </h3>

            {/* Currency selector */}
            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Coins className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <Label className="text-sm font-medium">
                    {t('settings.currency', 'Valuta')}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t('settings.currencyDesc', 'Odaberi valutu za prikaz')}
                  </p>
                </div>
              </div>
              <Select
                value={currency.code}
                onValueChange={(value) => {
                  setCurrency(value as CurrencyCode);
                  toast.success(t('settings.currencyChanged', 'Valuta promijenjena'));
                }}
              >
                <SelectTrigger className="w-[100px] rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((curr) => (
                    <SelectItem key={curr.code} value={curr.code}>
                      <span className="flex items-center gap-2">
                        <span>{curr.symbol}</span>
                        <span>{curr.code}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          {/* Data Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {t('settings.data', 'Podaci')}
            </h3>

            {/* Export button */}
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
              {t('settings.export', 'Izvezi podatke (JSON)')}
            </Button>

            {/* Import button */}
            <Button
              variant="outline"
              className="w-full gap-2 rounded-xl justify-start"
              onClick={() => setShowImportDialog(true)}
            >
              <Upload className="w-4 h-4" />
              {t('settings.import', 'Uvezi backup')}
            </Button>
          </div>

          <Separator />

          {/* App Info */}
          <div className="text-center text-xs text-muted-foreground space-y-1">
            <p>V&M Balance</p>
            <p>Verzija 1.0.0</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>

      {/* Import Dialog */}
      <Dialog open={showImportDialog} onOpenChange={(isOpen) => {
        if (!isOpen) resetImportState();
        setShowImportDialog(isOpen);
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileJson className="w-5 h-5" />
              {t('settings.importTitle', 'Uvezi backup')}
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
                      <p className="font-medium">{t('settings.importing', 'Uvozim podatke...')}</p>
                    </>
                  ) : (
                    <>
                      <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                      <p className="font-medium mb-2">{t('settings.selectFile', 'Odaberi JSON datoteku')}</p>
                      <p className="text-sm text-muted-foreground">
                        {t('settings.fileHint', 'Datoteka mora biti prethodno izvezena iz V&M Balance')}
                      </p>
                    </>
                  )}
                </div>

                {importError && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-xl flex items-center gap-2 text-destructive"
                  >
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span className="text-sm">{importError}</span>
                  </motion.div>
                )}
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
                <p className="font-medium text-lg">{t('settings.importComplete', 'Uvoz završen!')}</p>
                <p className="text-muted-foreground mt-1">
                  {t('settings.importedCount', 'Uvezeno {{count}} transakcija', { count: importResult.expenses })}
                  {importResult.items > 0 && ` ${t('settings.andItems', 'i {{count}} artikala', { count: importResult.items })}`}
                </p>
                <Button onClick={resetImportState} className="mt-6 rounded-xl">
                  {t('common.close', 'Zatvori')}
                </Button>
              </motion.div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
