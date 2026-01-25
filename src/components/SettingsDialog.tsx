import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Settings, Zap, RefreshCw, Loader2, Download, Upload, Check, AlertCircle, FileJson, Coins, Bell, Volume2, Globe, HelpCircle, Database, ChevronRight, Moon, Sun, User, Pencil, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
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
import {
  getNotificationSoundEnabled,
  setNotificationSoundEnabled,
  getPushNotificationsEnabled,
  setPushNotificationsEnabled,
  requestNotificationPermission
} from '@/hooks/useNotificationSound';
import { languages } from '@/i18n';

interface SettingsDialogProps {
  onDataImported?: () => void;
}

export const SettingsDialog = ({ onDataImported }: SettingsDialogProps = {}) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [autoUpdate, setAutoUpdate] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [isDark, setIsDark] = useState(false);
  
  // User profile state
  const [displayName, setDisplayName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [tempName, setTempName] = useState('');
  
  // Backup/Restore state
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ expenses: number; items: number } | null>(null);
  const [importError, setImportError] = useState('');
  const [showImportDialog, setShowImportDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Account deletion state
  const [showDeleteConfirm1, setShowDeleteConfirm1] = useState(false);
  const [showDeleteConfirm2, setShowDeleteConfirm2] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const { storageMode } = useStorage();
  const { user } = useAuth();
  const { currency, setCurrency } = useCurrency();
  const isLocalMode = storageMode === 'local';
  
  const currentLanguage = languages.find(lang => lang.code === i18n.language) || languages[0];

  useEffect(() => {
    if (open) {
      setAutoUpdate(getAutoUpdatePreference());
      setSoundEnabled(getNotificationSoundEnabled());
      setPushEnabled(getPushNotificationsEnabled());
      setIsDark(document.documentElement.classList.contains('dark'));
      
      // Load display name
      const loadName = async () => {
        const localName = localStorage.getItem('user_display_name');
        if (localName) {
          setDisplayName(localName);
          setTempName(localName);
        } else if (user) {
          const { data } = await supabase
            .from('profiles')
            .select('display_name')
            .eq('user_id', user.id)
            .single();
          if (data?.display_name) {
            setDisplayName(data.display_name);
            setTempName(data.display_name);
          }
        }
      };
      loadName();
    }
  }, [open, user]);

  const toggleTheme = () => {
    const newIsDark = !isDark;
    setIsDark(newIsDark);
    
    if (newIsDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
    toast.success(newIsDark ? t('settings.darkMode', 'Tamna tema aktivirana') : t('settings.lightMode', 'Svijetla tema aktivirana'));
  };

  const handleLanguageChange = (langCode: string) => {
    i18n.changeLanguage(langCode);
    toast.success(t('settings.languageChanged', 'Jezik promijenjen'));
  };

  const handleSaveName = async () => {
    if (!tempName.trim()) {
      toast.error(t('settings.nameRequired', 'Ime je obavezno'));
      return;
    }
    
    setSavingName(true);
    try {
      // Always save to localStorage for quick access
      localStorage.setItem('user_display_name', tempName.trim());
      
      // If cloud mode, also save to Supabase
      if (!isLocalMode && user) {
        const { error } = await supabase
          .from('profiles')
          .upsert({
            user_id: user.id,
            display_name: tempName.trim(),
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id' });
        
        if (error) throw error;
      }
      
      setDisplayName(tempName.trim());
      setEditingName(false);
      toast.success(t('settings.nameSaved', 'Ime uspješno spremljeno'));
      
      // Trigger a page refresh to update the greeting
      window.dispatchEvent(new CustomEvent('displayNameChanged', { detail: tempName.trim() }));
    } catch (error) {
      console.error('Save name error:', error);
      toast.error(t('errors.generic', 'Došlo je do greške'));
    } finally {
      setSavingName(false);
    }
  };

  const handleCancelEditName = () => {
    setTempName(displayName);
    setEditingName(false);
  };

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

  const handleSoundToggle = (enabled: boolean) => {
    setSoundEnabled(enabled);
    setNotificationSoundEnabled(enabled);
    toast.success(enabled ? t('settings.soundEnabled', 'Zvučne obavijesti uključene') : t('settings.soundDisabled', 'Zvučne obavijesti isključene'));
  };

  const handlePushToggle = async (enabled: boolean) => {
    if (enabled) {
      const granted = await requestNotificationPermission();
      if (granted) {
        setPushEnabled(true);
        setPushNotificationsEnabled(true);
        toast.success(t('settings.pushEnabled', 'Push obavijesti uključene'));
      } else {
        toast.error(t('settings.pushDenied', 'Preglednik je blokirao push obavijesti'));
      }
    } else {
      setPushEnabled(false);
      setPushNotificationsEnabled(false);
      toast.info(t('settings.pushDisabled', 'Push obavijesti isključene'));
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

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      if (isLocalMode) {
        // Clear IndexedDB for local mode
        const { clearLocalData } = await import('@/lib/storage/indexedDB');
        await clearLocalData();
        
        // Keep storage mode, clear user data only
        const currentStorageMode = localStorage.getItem('storage_mode');
        localStorage.clear();
        if (currentStorageMode) {
          localStorage.setItem('storage_mode', currentStorageMode);
        }
        
        toast.success(t('settings.accountDeleted', 'Račun uspješno obrisan'));
        window.location.href = '/onboarding';
      } else if (user) {
        // Delete all user data from Supabase tables
        // Order matters due to foreign key constraints
        
        // 1. Delete receipt_items (via expense cascade or manually)
        const { data: expenses } = await supabase
          .from('expenses')
          .select('id')
          .eq('user_id', user.id);
        
        if (expenses && expenses.length > 0) {
          const expenseIds = expenses.map(e => e.id);
          await supabase.from('receipt_items').delete().in('expense_id', expenseIds);
        }
        
        // 2. Delete transaction_notes
        await supabase.from('transaction_notes').delete().eq('user_id', user.id);
        
        // 3. Delete expenses
        await supabase.from('expenses').delete().eq('user_id', user.id);
        
        // 4. Delete income_source_members
        await supabase.from('income_source_members').delete().eq('user_id', user.id);
        
        // 5. Delete income_source_invitations
        await supabase.from('income_source_invitations').delete().eq('invited_by', user.id);
        
        // 6. Delete income_sources
        await supabase.from('income_sources').delete().eq('user_id', user.id);
        
        // 7. Delete payment_source_cards
        await supabase.from('payment_source_cards').delete().eq('user_id', user.id);
        
        // 8. Delete custom_payment_sources
        await supabase.from('custom_payment_sources').delete().eq('user_id', user.id);
        
        // 9. Delete custom_categories
        await supabase.from('custom_categories').delete().eq('user_id', user.id);
        
        // 10. Delete bank_connections
        await supabase.from('bank_connections').delete().eq('user_id', user.id);
        
        // 11. Delete notifications
        await supabase.from('notifications').delete().eq('user_id', user.id);
        
        // 12. Delete profile
        await supabase.from('profiles').delete().eq('user_id', user.id);
        
        // 13. Sign out and clear local storage but keep storage mode
        await supabase.auth.signOut();
        const currentStorageMode = localStorage.getItem('storage_mode');
        localStorage.clear();
        if (currentStorageMode) {
          localStorage.setItem('storage_mode', currentStorageMode);
        }
        
        toast.success(t('settings.accountDeleted', 'Račun uspješno obrisan'));
        window.location.href = '/auth';
      }
    } catch (error) {
      console.error('Delete account error:', error);
      toast.error(t('errors.generic', 'Došlo je do greške'));
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm2(false);
    }
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

          <ScrollArea className="max-h-[70vh]">
          <div className="space-y-6 py-4 pr-4">
            {/* Profile Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {t('settings.profile', 'Profil')}
              </h3>
              
              {/* Display Name */}
              <div className="p-3 bg-muted/30 rounded-xl">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <User className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <Label className="text-sm font-medium">
                      {t('settings.displayName', 'Vaše ime')}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {t('settings.displayNameDesc', 'Ime koje se koristi za personalizirane poruke')}
                    </p>
                  </div>
                  {!editingName && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setEditingName(true)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                
                {editingName ? (
                  <div className="flex gap-2">
                    <Input
                      value={tempName}
                      onChange={(e) => setTempName(e.target.value)}
                      placeholder={t('onboarding.namePlaceholder', 'npr. Marko')}
                      className="flex-1"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveName();
                        if (e.key === 'Escape') handleCancelEditName();
                      }}
                    />
                    <Button
                      size="sm"
                      onClick={handleSaveName}
                      disabled={savingName}
                    >
                      {savingName ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleCancelEditName}
                      disabled={savingName}
                    >
                      {t('common.cancel', 'Odustani')}
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm font-medium pl-12">
                    {displayName || t('settings.noName', 'Nije postavljeno')}
                  </p>
                )}
              </div>
            </div>

            <Separator />

            {/* Appearance Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {t('settings.appearance', 'Izgled')}
              </h3>
              
              {/* Theme toggle */}
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    {isDark ? <Moon className="w-4 h-4 text-primary" /> : <Sun className="w-4 h-4 text-primary" />}
                  </div>
                  <div>
                    <Label htmlFor="theme-toggle" className="text-sm font-medium cursor-pointer">
                      {t('settings.theme', 'Tema')}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {isDark ? t('settings.darkMode', 'Tamna tema') : t('settings.lightMode', 'Svijetla tema')}
                    </p>
                  </div>
                </div>
                <Switch
                  id="theme-toggle"
                  checked={isDark}
                  onCheckedChange={toggleTheme}
                />
              </div>

              {/* Language */}
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Globe className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <Label className="text-sm font-medium">
                      {t('settings.appLanguage', 'Jezik aplikacije')}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {t('settings.appLanguageDesc', 'Odaberi jezik sučelja')}
                    </p>
                  </div>
                </div>
                <Select
                  value={i18n.language}
                  onValueChange={handleLanguageChange}
                >
                  <SelectTrigger className="w-[130px] rounded-xl">
                    <SelectValue>
                      <span className="flex items-center gap-2">
                        <span>{currentLanguage.flag}</span>
                        <span>{currentLanguage.name}</span>
                      </span>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {languages.map((lang) => (
                      <SelectItem key={lang.code} value={lang.code}>
                        <span className="flex items-center gap-2">
                          <span>{lang.flag}</span>
                          <span>{lang.name}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            {/* Storage Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {t('settings.storage', 'Pohrana')}
              </h3>
              
              <button
                onClick={() => {
                  setOpen(false);
                  navigate('/setup');
                }}
                className="w-full flex items-center justify-between p-3 bg-muted/30 rounded-xl hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Database className="w-4 h-4 text-primary" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium">
                      {t('settings.storageMode', 'Način pohrane')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {isLocalMode 
                        ? t('settings.localMode', 'Lokalna pohrana') 
                        : t('settings.cloudMode', 'Cloud pohrana')}
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            <Separator />

            {/* Help Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {t('settings.help', 'Pomoć')}
              </h3>
              
              <button
                onClick={() => {
                  setOpen(false);
                  setShowHelpDialog(true);
                }}
                className="w-full flex items-center justify-between p-3 bg-muted/30 rounded-xl hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <HelpCircle className="w-4 h-4 text-primary" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium">
                      {t('settings.userGuide', 'Upute za korištenje')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t('settings.userGuideDesc', 'Naučite koristiti aplikaciju')}
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            <Separator />

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

          {/* Notifications Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {t('settings.notifications', 'Obavijesti')}
            </h3>

            {/* Sound notifications toggle */}
            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Volume2 className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <Label htmlFor="sound-notifications" className="text-sm font-medium cursor-pointer">
                    {t('settings.soundNotifications', 'Zvučne obavijesti')}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t('settings.soundNotificationsDesc', 'Reproduciraj zvuk za nove obavijesti')}
                  </p>
                </div>
              </div>
              <Switch
                id="sound-notifications"
                checked={soundEnabled}
                onCheckedChange={handleSoundToggle}
              />
            </div>

            {/* Push notifications toggle */}
            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Bell className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <Label htmlFor="push-notifications" className="text-sm font-medium cursor-pointer">
                    {t('settings.pushNotifications', 'Push obavijesti')}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t('settings.pushNotificationsDesc', 'Prikaži obavijesti kada je aplikacija u pozadini')}
                  </p>
                </div>
              </div>
              <Switch
                id="push-notifications"
                checked={pushEnabled}
                onCheckedChange={handlePushToggle}
              />
            </div>
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

          {/* Danger Zone */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-destructive uppercase tracking-wide">
              {t('settings.dangerZone', 'Opasna zona')}
            </h3>
            
            <div className="p-3 border border-destructive/30 bg-destructive/5 rounded-xl">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center">
                  <Trash2 className="w-4 h-4 text-destructive" />
                </div>
                <div className="flex-1">
                  <Label className="text-sm font-medium text-destructive">
                    {t('settings.deleteAccount', 'Obriši račun')}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t('settings.deleteAccountDesc', 'Trajno briše sve vaše podatke. Ova radnja se ne može poništiti.')}
                  </p>
                </div>
              </div>
              
              <Button
                variant="destructive"
                className="w-full gap-2 rounded-xl"
                onClick={() => setShowDeleteConfirm1(true)}
              >
                <Trash2 className="w-4 h-4" />
                {t('settings.deleteAccountBtn', 'Obriši moj račun')}
              </Button>
            </div>
          </div>

          <Separator />

          {/* App Info */}
          <div className="text-center text-xs text-muted-foreground space-y-1">
            <p>V&M Balance</p>
            <p>Verzija 1.0.0</p>
          </div>
        </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>

      {/* First Delete Confirmation */}
      <AlertDialog open={showDeleteConfirm1} onOpenChange={setShowDeleteConfirm1}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" />
              {t('settings.deleteConfirmTitle', 'Jeste li sigurni?')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('settings.deleteConfirmDesc1', 'Ova radnja će trajno obrisati sve vaše transakcije, izvore prihoda, kategorije i ostale podatke. Ovo se ne može poništiti.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          {/* Export before delete option */}
          <div className="p-3 bg-muted/50 border border-border rounded-xl space-y-2">
            <p className="text-sm font-medium flex items-center gap-2">
              <Download className="w-4 h-4 text-primary" />
              {t('settings.exportBeforeDelete', 'Želite li prvo izvesti podatke?')}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('settings.exportBeforeDeleteDesc', 'Preporučujemo izvoz podataka prije brisanja računa kako biste imali sigurnosnu kopiju.')}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2 rounded-lg"
              onClick={handleExport}
              disabled={isExporting}
            >
              {isExporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {t('settings.exportNow', 'Izvezi sada')}
            </Button>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Odustani')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setShowDeleteConfirm1(false);
                setShowDeleteConfirm2(true);
              }}
            >
              {t('settings.continueDelete', 'Nastavi s brisanjem')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Second Delete Confirmation */}
      <AlertDialog open={showDeleteConfirm2} onOpenChange={setShowDeleteConfirm2}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="w-5 h-5" />
              {t('settings.finalConfirmTitle', 'Posljednja provjera!')}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>{t('settings.finalConfirmDesc', 'Ovo je vaša posljednja prilika da odustanete. Nakon što kliknete "Obriši zauvijek", svi podaci će biti nepovratno izgubljeni.')}</p>
              <p className="font-semibold text-destructive">
                {t('settings.noUndo', 'UPOZORENJE: Ova radnja se NE MOŽE poništiti!')}
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t('common.cancel', 'Odustani')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteAccount}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t('settings.deleting', 'Brišem...')}
                </>
              ) : (
                t('settings.deleteForever', 'Obriši zauvijek')
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Help Dialog */}
      <HelpDialogContent open={showHelpDialog} onOpenChange={setShowHelpDialog} />

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

// Help Dialog Content component
const HelpDialogContent = ({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) => {
  const { t } = useTranslation();
  
  const sections = [
    {
      icon: "➕",
      title: t('help.addTransactions', 'Dodavanje transakcija'),
      content: [
        t('help.addTransactionsStep1', "Kliknite na '+' gumb u gornjem desnom kutu"),
        t('help.addTransactionsStep2', "Odaberite vrstu: Prihod, Rashod ili Transfer"),
        t('help.addTransactionsStep3', "Unesite iznos, opis, kategoriju i datum"),
        t('help.addTransactionsStep4', "Za rashode možete dodati i fotografiju računa")
      ]
    },
    {
      icon: "↔️",
      title: t('help.transfers', 'Transferi između izvora'),
      content: [
        t('help.transfersStep1', "Transferi služe za praćenje prijenosa novca između vaših izvora prihoda"),
        t('help.transfersStep2', "Npr. prijenos s bankovnog računa na gotovinu"),
        t('help.transfersStep3', "Transfer ne utječe na ukupni saldo - samo preraspodijeli sredstva")
      ]
    },
    {
      icon: "💰",
      title: t('help.incomeSources', 'Izvori prihoda'),
      content: [
        t('help.incomeSourcesStep1', "Kreirajte izvore prihoda poput: Plaća, Gotovina, Revolut, itd."),
        t('help.incomeSourcesStep2', "Svaki izvor ima svoj saldo koji se automatski ažurira"),
        t('help.incomeSourcesStep3', "Prihodi povećavaju saldo izvora, rashodi ga smanjuju"),
        t('help.incomeSourcesStep4', "Kliknite na izvor da vidite sve povezane transakcije")
      ]
    },
    {
      icon: "🏷️",
      title: t('help.categories', 'Kategorije'),
      content: [
        t('help.categoriesStep1', "Koristite ugrađene kategorije ili kreirajte vlastite"),
        t('help.categoriesStep2', "Kategorije pomažu u praćenju potrošnje po grupama"),
        t('help.categoriesStep3', "Kliknite na kategoriju da vidite sve transakcije u njoj")
      ]
    },
    {
      icon: "🧾",
      title: t('help.receiptScanning', 'Skeniranje računa'),
      content: [
        t('help.receiptScanningStep1', "Prilikom dodavanja rashoda možete fotografirati račun"),
        t('help.receiptScanningStep2', "AI automatski prepoznaje iznos i trgovinu"),
        t('help.receiptScanningStep3', "Fotografija se sprema uz transakciju za kasniji pregled")
      ]
    },
    {
      icon: "📄",
      title: t('help.bankImport', 'Import iz banke'),
      content: [
        t('help.bankImportStep1', "Podržan je import CSV izvoda iz većine banaka"),
        t('help.bankImportStep2', "Idite na 'Bankovna poveznica' u bočnoj traci"),
        t('help.bankImportStep3', "Odaberite CSV datoteku i banku iz koje dolazi"),
        t('help.bankImportStep4', "Transakcije će se automatski kategorizirati")
      ]
    },
    {
      icon: "📊",
      title: t('help.reports', 'Izvještaji'),
      content: [
        t('help.reportsStep1', "Kliknite na 'Izvještaji' gumb za detaljan pregled"),
        t('help.reportsStep2', "Pregledajte potrošnju po kategorijama i mjesecima"),
        t('help.reportsStep3', "Filtrirajte po datumu i izvozu u PDF")
      ]
    },
    {
      icon: "📥",
      title: t('help.backup', 'Backup i obnova'),
      content: [
        t('help.backupStep1', "Redovito radite backup podataka"),
        t('help.backupStep2', "U lokalnom načinu rada, podaci se čuvaju na vašem uređaju"),
        t('help.backupStep3', "U cloud načinu, podaci su automatski sinkronizirani")
      ]
    },
    {
      icon: "📱",
      title: t('help.install', 'Instalacija na mobitel'),
      content: [
        t('help.installStep1', "Aplikaciju možete instalirati kao mobilnu aplikaciju"),
        t('help.installStep2', "Android: Menu (⋮) → 'Instaliraj aplikaciju'"),
        t('help.installStep3', "iPhone: Share (⬆) → 'Dodaj na početni zaslon'"),
        t('help.installStep4', "Posjetite /install stranicu za detaljne upute")
      ]
    }
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <HelpCircle className="w-6 h-6 text-primary" />
            {t('help.title', 'Upute za korištenje')}
          </DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="h-[65vh] pr-4">
          <div className="space-y-6">
            <p className="text-muted-foreground">
              {t('help.intro', 'V&M Balance je aplikacija za praćenje osobnih financija. Evo kako ju koristiti:')}
            </p>
            
            {sections.map((section, index) => (
              <div 
                key={index} 
                className="bg-muted/50 rounded-lg p-4 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-full bg-primary/10 text-lg">
                    {section.icon}
                  </div>
                  <h3 className="font-semibold text-lg">{section.title}</h3>
                </div>
                <ul className="space-y-1 ml-11">
                  {section.content.map((item, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-primary mt-1">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            
            <div className="bg-primary/10 rounded-lg p-4 mt-6">
              <h3 className="font-semibold mb-2">💡 {t('help.tip', 'Savjet')}</h3>
              <p className="text-sm text-muted-foreground">
                {t('help.tipContent', 'Za najbolje iskustvo, redovito unosite transakcije i kategorizirajte ih. Tako ćete imati jasniji uvid u svoje financije i moći donositi bolje odluke.')}
              </p>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
