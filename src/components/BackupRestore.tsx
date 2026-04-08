import { useState, useRef, useEffect } from 'react';
import { exportTextFile } from '@/lib/fileExport';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Download, Upload, FileJson, Check, AlertCircle, Loader2, HardDrive, Clock, History, Settings2, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStorage } from '@/contexts/StorageContext';
import { exportLocalData, importLocalData } from '@/lib/storage/indexedDB';
import { 
  getAutoBackups, 
  getBackupSettings, 
  saveBackupSettings, 
  restoreFromBackup,
  deleteBackup,
  AutoBackup,
  BackupSettings
} from '@/lib/storage/autoBackup';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDistanceToNow } from 'date-fns';
import { hr, enUS, de } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { useAppState } from '@/contexts/AppStateContext';

interface BackupRestoreProps {
  onDataImported?: () => void;
}

export const BackupRestore = ({ onDataImported }: BackupRestoreProps) => {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [importResult, setImportResult] = useState<{ expenses: number; items: number } | null>(null);
  const [error, setError] = useState('');
  const [backupSettings, setBackupSettings] = useState<BackupSettings | null>(null);
  const [autoBackups, setAutoBackups] = useState<AutoBackup[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { storageMode } = useStorage();
  const { user } = useAuth();
  const { emitAvatarEvent } = useAppState();

  const isLocalMode = storageMode === 'local';
  const dateLocale = i18n.language === 'de' ? de : i18n.language === 'en' ? enUS : hr;

  useEffect(() => {
    if (isLocalMode) {
      loadBackupSettings();
      loadAutoBackups();
    }
  }, [isLocalMode]);

  const loadBackupSettings = async () => {
    try {
      const settings = await getBackupSettings();
      setBackupSettings(settings);
    } catch (error) {
      console.error('Failed to load backup settings:', error);
    }
  };

  const loadAutoBackups = async () => {
    try {
      const backups = await getAutoBackups();
      setAutoBackups(backups);
    } catch (error) {
      console.error('Failed to load auto backups:', error);
    }
  };

  const handleSettingChange = async (key: keyof BackupSettings, value: any) => {
    if (!backupSettings) return;
    
    const newSettings = { ...backupSettings, [key]: value };
    setBackupSettings(newSettings);
    
    try {
      await saveBackupSettings(newSettings);
      showSuccess(t('backup.settingsSaved'));
    } catch (error) {
      showError(t('errors.saveError'));
    }
  };

  const handleRestoreBackup = async (backup: AutoBackup) => {
    setIsRestoring(true);
    try {
      const data = await restoreFromBackup(backup);
      
      // Import the restored data
      const jsonData = JSON.stringify({
        version: 1,
        expenses: data.expenses,
        receiptItems: data.receiptItems
      });
      
      await importLocalData(jsonData);
      showSuccess(t('backup.restored', { count: data.expenses.length }));
      onDataImported?.();
      setHistoryOpen(false);
    } catch (error) {
      showError(t('errors.saveError'));
    } finally {
      setIsRestoring(false);
    }
  };

  const handleDeleteBackup = async (id: string) => {
    try {
      await deleteBackup(id);
      await loadAutoBackups();
      showSuccess(t('backup.backupDeleted'));
    } catch (error) {
      showError(t('errors.deleteError'));
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    setError('');

    try {
      let jsonData: string;

      if (isLocalMode) {
        jsonData = await exportLocalData();
      } else {
        if (!user) throw new Error(t('backup.notLoggedIn'));

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

      await exportTextFile(jsonData, `vm-balance-backup-${new Date().toISOString().split('T')[0]}.json`, 'application/json');

      emitAvatarEvent('proud', 'Podatci su sigurni! 🔒');
      showSuccess(t('backup.exportSuccess'));
    } catch (err) {
      console.error('Export error:', err);
      setError(t('errors.saveError'));
      showError(t('errors.saveError'));
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

      if (!data.expenses || !Array.isArray(data.expenses)) {
        throw new Error(t('backup.invalidFileFormat'));
      }

      if (isLocalMode) {
        const result = await importLocalData(content);
        setImportResult(result);
      } else {
        if (!user) throw new Error(t('backup.notLoggedIn'));

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

      emitAvatarEvent('proud', 'Podatci su sigurni! 🔒');
      showSuccess(t('backup.importSuccess'));
      onDataImported?.();
    } catch (err) {
      console.error('Import error:', err);
      setError(err instanceof Error ? err.message : t('errors.saveError'));
      showError(t('errors.saveError'));
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

  const formatBackupTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return formatDistanceToNow(date, { addSuffix: true, locale: dateLocale });
    } catch {
      return dateStr;
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-2xl p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <HardDrive className="w-5 h-5" />
          <h3 className="text-lg font-semibold">{t('backup.title')}</h3>
        </div>
        {isLocalMode && (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => {
                loadAutoBackups();
                setHistoryOpen(true);
              }}
            >
              <History className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings2 className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Last backup info */}
      {isLocalMode && backupSettings?.lastBackupAt && (
        <div className="flex items-center gap-2 mb-4 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          <span>{t('backup.lastBackup')}: {formatBackupTime(backupSettings.lastBackupAt)}</span>
        </div>
      )}

      {/* Auto backup status */}
      {isLocalMode && backupSettings && (
        <div className="flex items-center justify-between p-3 bg-muted/30 rounded-xl mb-4">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${backupSettings.enabled ? 'bg-income' : 'bg-muted-foreground'}`} />
            <span className="text-sm">
              {backupSettings.enabled ? t('backup.autoBackupActive') : t('backup.autoBackupDisabled')}
            </span>
          </div>
          <Switch
            checked={backupSettings.enabled}
            onCheckedChange={(checked) => handleSettingChange('enabled', checked)}
          />
        </div>
      )}

      <div className="space-y-3">
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
          {t('backup.export')}
        </Button>

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
              {t('backup.import')}
            </Button>
          </DialogTrigger>

          <DialogContent className="sm:max-w-md glass-card border-border/50">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileJson className="w-5 h-5" />
                {t('backup.import')}
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
                        <p className="font-medium">{t('backup.importing')}</p>
                      </>
                    ) : (
                      <>
                        <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                        <p className="font-medium mb-2">{t('backup.selectJsonFile')}</p>
                        <p className="text-sm text-muted-foreground">
                          {t('backup.fileMustBeExported')}
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
                  <p className="font-medium text-lg">{t('backup.importComplete')}</p>
                  <p className="text-muted-foreground mt-1">
                    {t('backup.importedTransactions', { count: importResult.expenses })}
                    {importResult.items > 0 && ` ${t('backup.importedItems', { count: importResult.items })}`}
                  </p>
                  <Button onClick={() => setOpen(false)} className="mt-6 rounded-xl">
                    {t('common.close')}
                  </Button>
                </motion.div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Settings Dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-md glass-card border-border/50">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="w-5 h-5" />
              {t('backup.backupSettings')}
            </DialogTitle>
          </DialogHeader>

          <div className="py-4 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <Label>{t('backup.autoBackup')}</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('backup.autoBackupDesc')}
                </p>
              </div>
              <Switch
                checked={backupSettings?.enabled || false}
                onCheckedChange={(checked) => handleSettingChange('enabled', checked)}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('backup.backupInterval')}</Label>
              <Select
                value={String(backupSettings?.intervalMinutes || 60)}
                onValueChange={(value) => handleSettingChange('intervalMinutes', parseInt(value))}
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">{t('backup.every15min')}</SelectItem>
                  <SelectItem value="30">{t('backup.every30min')}</SelectItem>
                  <SelectItem value="60">{t('backup.everyHour')}</SelectItem>
                  <SelectItem value="180">{t('backup.every3hours')}</SelectItem>
                  <SelectItem value="360">{t('backup.every6hours')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="p-4 bg-muted/30 rounded-xl">
              <p className="text-xs text-muted-foreground">
                {t('backup.backupInfoDesc')}
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-md glass-card border-border/50">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              {t('backup.backupHistory')}
            </DialogTitle>
          </DialogHeader>

          <div className="py-4">
            {autoBackups.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>{t('backup.noBackups')}</p>
              </div>
            ) : (
              <ScrollArea className="max-h-[300px]">
                <div className="space-y-2">
                  <AnimatePresence>
                    {autoBackups.map((backup, index) => (
                      <motion.div
                        key={backup.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ delay: index * 0.05 }}
                        className="flex items-center justify-between p-3 bg-muted/30 rounded-xl"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">
                            {backup.expenseCount} {t('incomeSources.transactions')}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatBackupTime(backup.createdAt)} • €{backup.totalAmount.toFixed(2)}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleRestoreBackup(backup)}
                            disabled={isRestoring}
                          >
                            {isRestoring ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <RotateCcw className="w-4 h-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleDeleteBackup(backup.id)}
                          >
                            <AlertCircle className="w-4 h-4" />
                          </Button>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </ScrollArea>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};