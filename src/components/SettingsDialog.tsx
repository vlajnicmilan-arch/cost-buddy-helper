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
import { Settings, Zap, RefreshCw, Loader2, Download, Upload, Check, AlertCircle, FileJson, Coins, Bell, Volume2, Globe, HelpCircle, Database, ChevronRight, Moon, Sun, User, Pencil, Trash2, RotateCcw, Bot, Sparkles, Users, Bug, Shield, Share2, Mail, Copy, MessageCircle, Building2 } from 'lucide-react';
import { BugReportDialog } from '@/components/BugReportDialog';
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
import { useAppState } from '@/contexts/AppStateContext';
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
  const [showBugReport, setShowBugReport] = useState(false);
  const [autoUpdate, setAutoUpdate] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [isDark, setIsDark] = useState(false);
  
  // User profile state
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
  
  // Reset state
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  
  // Family mode disable state
  const [showFamilyDisableConfirm, setShowFamilyDisableConfirm] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);
  
  const { storageMode } = useStorage();
  const { user } = useAuth();
  const { currency, setCurrency } = useCurrency();
  const { 
    displayName, setDisplayName,
    aiAssistantEnabled, setAiAssistantEnabled,
    simpleModeEnabled, setSimpleModeEnabled,
    familyModeEnabled, setFamilyModeEnabled,
    emitFinancialReset,
  } = useAppState();
  const isLocalMode = storageMode === 'local';
  
  const currentLanguage = languages.find(lang => lang.code === i18n.language) || languages[0];


  useEffect(() => {
    if (open) {
      setAutoUpdate(getAutoUpdatePreference());
      setSoundEnabled(getNotificationSoundEnabled());
      setPushEnabled(getPushNotificationsEnabled());
      setIsDark(document.documentElement.classList.contains('dark'));
      
      // Sync tempName from context displayName
      setTempName(displayName);

      // If cloud mode and no local name, load from DB
      if (!displayName && user) {
        supabase
          .from('profiles')
          .select('display_name')
          .eq('user_id', user.id)
          .single()
          .then(({ data }) => {
            if (data?.display_name) {
              setDisplayName(data.display_name);
              setTempName(data.display_name);
            }
          });
      }

      // Check admin role
      if (user) {
        supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .then(({ data }) => {
            setIsAdminUser(data?.some((r: any) => r.role === 'admin') ?? false);
          });
      }
    }
  }, [open, user, displayName, setDisplayName]);


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
      
      // Update via Context (also persists to localStorage)
      setDisplayName(tempName.trim());
      setEditingName(false);
      toast.success(t('settings.nameSaved', 'Ime uspješno spremljeno'));
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

  const handleReset = async () => {
    setIsResetting(true);
    try {
      if (isLocalMode) {
        // Local mode: Clear expenses but keep payment sources
        const { resetLocalData } = await import('@/lib/storage/indexedDB');
        await resetLocalData();
        
        toast.success(t('settings.resetComplete', 'Podaci uspješno resetirani'));
        onDataImported?.();
      } else if (user) {
        // Cloud mode: Delete expenses, projects, budgets but keep payment sources
        
        // 1. Get all user expenses to delete receipt_items
        const { data: expenses } = await supabase
          .from('expenses')
          .select('id')
          .eq('user_id', user.id);
        
        if (expenses && expenses.length > 0) {
          const expenseIds = expenses.map(e => e.id);
          await supabase.from('receipt_items').delete().in('expense_id', expenseIds);
          await supabase.from('transaction_notes').delete().in('expense_id', expenseIds);
        }
        
        // 2. Delete all expenses
        await supabase.from('expenses').delete().eq('user_id', user.id);
        
        // 3. Get all user projects
        const { data: projects } = await supabase
          .from('projects')
          .select('id')
          .eq('user_id', user.id);
        
        if (projects && projects.length > 0) {
          const projectIds = projects.map(p => p.id);
          // Delete project related data
          await supabase.from('project_milestones').delete().in('project_id', projectIds);
          await supabase.from('project_funding').delete().in('project_id', projectIds);
          await supabase.from('project_members').delete().in('project_id', projectIds);
          await supabase.from('project_invitations').delete().in('project_id', projectIds);
        }
        
        // 4. Delete all projects
        await supabase.from('projects').delete().eq('user_id', user.id);
        
        // 5. Get all user budgets
        const { data: budgets } = await supabase
          .from('budget_plans')
          .select('id')
          .eq('user_id', user.id);
        
        if (budgets && budgets.length > 0) {
          const budgetIds = budgets.map(b => b.id);
          // Delete budget related data
          await supabase.from('budget_categories').delete().in('budget_id', budgetIds);
          await supabase.from('savings_goals').delete().in('budget_id', budgetIds);
          await supabase.from('budget_members').delete().in('budget_id', budgetIds);
          await supabase.from('budget_invitations').delete().in('budget_id', budgetIds);
        }
        
        // 6. Delete all budgets
        await supabase.from('budget_plans').delete().eq('user_id', user.id);
        
        toast.success(t('settings.resetComplete', 'Podaci uspješno resetirani'));
        onDataImported?.();
      }
      
      // Notify AI assistant to reset conversation via Context
      emitFinancialReset();
      
      setShowResetConfirm(false);
    } catch (error) {
      console.error('Reset error:', error);
      toast.error(t('errors.generic', 'Došlo je do greške'));
    } finally {
      setIsResetting(false);
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      if (isLocalMode) {
        // Clear IndexedDB for local mode
        const { clearLocalData } = await import('@/lib/storage/indexedDB');
        await clearLocalData();
        
        // Keep storage config, clear user data only
        const storageConfig = localStorage.getItem('finmate-storage-config');
        localStorage.clear();
        if (storageConfig) {
          localStorage.setItem('finmate-storage-config', storageConfig);
        }
        
        toast.success(t('settings.accountDeleted', 'Račun uspješno obrisan'));
        window.location.href = '/onboarding';
      } else if (user) {
        // Delete all user data from Supabase tables
        // Order matters due to foreign key constraints and RLS
        
        try {
          // 1. Get all expenses to delete receipt_items
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
          
          // 4. Get income sources owned by user
          const { data: ownedSources } = await supabase
            .from('income_sources')
            .select('id')
            .eq('user_id', user.id);
          
          if (ownedSources && ownedSources.length > 0) {
            const sourceIds = ownedSources.map(s => s.id);
            // Delete members of owned sources (as owner, we can do this)
            await supabase.from('income_source_members').delete().in('income_source_id', sourceIds);
            // Delete invitations for owned sources
            await supabase.from('income_source_invitations').delete().in('income_source_id', sourceIds);
          }
          
          // 5. Delete income_sources owned by user
          await supabase.from('income_sources').delete().eq('user_id', user.id);
          
          // 6. Delete payment_source_cards
          await supabase.from('payment_source_cards').delete().eq('user_id', user.id);
          
          // 7. Delete custom_payment_sources
          await supabase.from('custom_payment_sources').delete().eq('user_id', user.id);
          
          // 8. Delete custom_categories
          await supabase.from('custom_categories').delete().eq('user_id', user.id);
          
          // 9. Delete bank_connections
          await supabase.from('bank_connections').delete().eq('user_id', user.id);
          
          // 10. Delete notifications
          await supabase.from('notifications').delete().eq('user_id', user.id);
          
          // 11. Delete profile
          await supabase.from('profiles').delete().eq('user_id', user.id);
        } catch (dbError) {
          console.error('Error deleting data:', dbError);
          // Continue with sign out even if some deletes fail
        }
        
        // 12. Sign out and clear local storage but keep storage config
        await supabase.auth.signOut();
        const storageConfig = localStorage.getItem('finmate-storage-config');
        localStorage.clear();
        if (storageConfig) {
          localStorage.setItem('finmate-storage-config', storageConfig);
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
                    <SelectValue placeholder="Language" />
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

              {!isLocalMode && user && (
                <>
                  <button
                    onClick={() => setShowShareDialog(true)}
                    className="w-full flex items-center justify-between p-3 bg-muted/30 rounded-xl hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Share2 className="w-4 h-4 text-primary" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-medium">Pozovi prijatelja</p>
                        <p className="text-xs text-muted-foreground">Podijeli link za preuzimanje aplikacije</p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </button>

                  <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
                    <DialogContent className="max-w-sm rounded-2xl">
                      <DialogHeader>
                        <DialogTitle className="text-center">Podijeli s prijateljem</DialogTitle>
                      </DialogHeader>
                      <div className="grid grid-cols-2 gap-3 py-4">
                        {(() => {
                          const referralUrl = `${window.location.origin}/install?ref=${user.id}`;
                          const shareText = 'Preuzmi CostBuddy aplikaciju za jednostavno praćenje troškova!';
                          return (
                            <>
                              <button
                                onClick={() => {
                                  window.location.href = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText + ' ' + referralUrl)}`;
                                  setShowShareDialog(false);
                                }}
                                className="flex flex-col items-center gap-2 p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors"
                              >
                                <div className="w-12 h-12 rounded-full bg-[#25D366]/10 flex items-center justify-center">
                                  <MessageCircle className="w-6 h-6 text-[#25D366]" />
                                </div>
                                <span className="text-sm font-medium">WhatsApp</span>
                              </button>
                              <button
                                onClick={() => {
                                  window.open(`viber://forward?text=${encodeURIComponent(shareText + ' ' + referralUrl)}`, '_blank');
                                  setShowShareDialog(false);
                                }}
                                className="flex flex-col items-center gap-2 p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors"
                              >
                                <div className="w-12 h-12 rounded-full bg-[#7360F2]/10 flex items-center justify-center">
                                  <MessageCircle className="w-6 h-6 text-[#7360F2]" />
                                </div>
                                <span className="text-sm font-medium">Viber</span>
                              </button>
                              <button
                                onClick={() => {
                                  window.open(`mailto:?subject=${encodeURIComponent('Preuzmi CostBuddy')}&body=${encodeURIComponent(shareText + '\n\n' + referralUrl)}`, '_blank');
                                  setShowShareDialog(false);
                                }}
                                className="flex flex-col items-center gap-2 p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors"
                              >
                                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                                  <Mail className="w-6 h-6 text-primary" />
                                </div>
                                <span className="text-sm font-medium">Email</span>
                              </button>
                              <button
                                onClick={async () => {
                                  try {
                                    await navigator.clipboard.writeText(referralUrl);
                                    toast.success('Link kopiran!');
                                  } catch {
                                    toast.error('Greška pri kopiranju');
                                  }
                                  setShowShareDialog(false);
                                }}
                                className="flex flex-col items-center gap-2 p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors"
                              >
                                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                                  <Copy className="w-6 h-6 text-muted-foreground" />
                                </div>
                                <span className="text-sm font-medium">Kopiraj link</span>
                              </button>
                            </>
                          );
                        })()}
                      </div>
                    </DialogContent>
                  </Dialog>
                </>
              )}

              {!isLocalMode && (
                <button
                  onClick={() => {
                    setOpen(false);
                    setShowBugReport(true);
                  }}
                  className="w-full flex items-center justify-between p-3 bg-muted/30 rounded-xl hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center">
                      <Bug className="w-4 h-4 text-destructive" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-medium">Prijavi problem</p>
                      <p className="text-xs text-muted-foreground">Prijavite grešku ili nejasnoću</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              )}

              {isAdminUser && (
                <button
                  onClick={() => {
                    setOpen(false);
                    navigate('/admin');
                  }}
                  className="w-full flex items-center justify-between p-3 bg-muted/30 rounded-xl hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Shield className="w-4 h-4 text-primary" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-medium">Admin panel</p>
                      <p className="text-xs text-muted-foreground">Pregledaj prijave problema</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              )}
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

            {/* AI Assistant toggle - Cloud only */}
            {!isLocalMode && (
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <Label htmlFor="ai-assistant" className="text-sm font-medium cursor-pointer">
                      {t('settings.aiAssistant', 'AI Asistent')}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {t('settings.aiAssistantDesc', 'Prikaži AI savjete i asistenta')}
                    </p>
                  </div>
                </div>
                <Switch
                  id="ai-assistant"
                  checked={aiAssistantEnabled}
                  onCheckedChange={(checked) => {
                    setAiAssistantEnabled(checked);
                    toast.success(checked 
                      ? t('settings.aiEnabled', 'AI asistent uključen') 
                      : t('settings.aiDisabled', 'AI asistent isključen')
                    );
                  }}
                />
              </div>
            )}

            {/* Simple Mode toggle */}
            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <Label htmlFor="simple-mode" className="text-sm font-medium cursor-pointer">
                    {t('settings.simpleMode', 'Jednostavni način')}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t('settings.simpleModeDesc', 'Samo novčanik, transakcije i neto vrijednost')}
                  </p>
                </div>
              </div>
              <Switch
                id="simple-mode"
                checked={simpleModeEnabled}
                onCheckedChange={(checked) => {
                  setSimpleModeEnabled(checked);
                  toast.success(checked 
                    ? t('settings.simpleModeEnabled', 'Jednostavni način uključen') 
                    : t('settings.simpleModeDisabled', 'Puni način vraćen')
                  );
                }}
              />
            </div>

            {/* Family Mode toggle - Cloud only */}
            {!isLocalMode && (
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Users className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <Label htmlFor="family-mode" className="text-sm font-medium cursor-pointer">
                      {t('settings.familyMode', 'Obiteljski način')}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {t('settings.familyModeDesc', 'Obiteljske grupe, dijeljeni računi i chat')}
                    </p>
                  </div>
                </div>
                <Switch
                  id="family-mode"
                  checked={familyModeEnabled}
                  onCheckedChange={(checked) => {
                    if (!checked) {
                      setShowFamilyDisableConfirm(true);
                    } else {
                      setFamilyModeEnabled(true);
                      toast.success(t('settings.familyModeEnabled', 'Obiteljski način uključen'));
                    }
                  }}
                />
              </div>
            )}
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
            
            {/* Reset data option */}
            <div className="p-3 border border-amber-500/30 bg-amber-500/5 rounded-xl">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <RotateCcw className="w-4 h-4 text-amber-600" />
                </div>
                <div className="flex-1">
                  <Label className="text-sm font-medium text-amber-600">
                    {t('settings.resetData', 'Kreni ispočetka')}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t('settings.resetDataDesc', 'Briše sve transakcije, projekte i budžete. Novčanici ostaju sa svojim stanjima.')}
                  </p>
                </div>
              </div>
              
              <Button
                variant="outline"
                className="w-full gap-2 rounded-xl border-amber-500/50 text-amber-600 hover:bg-amber-500/10 hover:text-amber-600"
                onClick={() => setShowResetConfirm(true)}
              >
                <RotateCcw className="w-4 h-4" />
                {t('settings.resetDataBtn', 'Resetiraj podatke')}
              </Button>
            </div>
            
            {/* Delete account option */}
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

      {/* Family Mode Disable Confirmation */}
      <AlertDialog open={showFamilyDisableConfirm} onOpenChange={setShowFamilyDisableConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
              <Users className="w-5 h-5" />
              {t('settings.familyDisableTitle', 'Isključiti obiteljski način?')}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>{t('settings.familyDisableDesc', 'Isključivanjem obiteljskog načina:')}</p>
              <ul className="list-disc list-inside text-sm space-y-1">
                <li>{t('settings.familyDisableWarn1', 'Nećete više vidjeti obiteljske grupe u navigaciji')}</li>
                <li>{t('settings.familyDisableWarn2', 'Dijeljeni računi, budžeti i ciljevi štednje neće biti vidljivi')}</li>
                <li>{t('settings.familyDisableWarn3', 'Chat poruke i obavijesti neće stizati')}</li>
              </ul>
              <p className="font-medium text-foreground mt-3">
                {t('settings.familyDisableKeep', 'Vaši podaci ostaju sačuvani i bit će dostupni ako ponovno uključite obiteljski način.')}
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Odustani')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 text-white hover:bg-amber-700"
              onClick={() => {
                setFamilyModeEnabled(false);
                setShowFamilyDisableConfirm(false);
                toast.success(t('settings.familyModeDisabled', 'Obiteljski način isključen'));
              }}
            >
              {t('settings.familyDisableConfirm', 'Isključi')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Data Confirmation */}
      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
              <RotateCcw className="w-5 h-5" />
              {t('settings.resetConfirmTitle', 'Resetirati sve podatke?')}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>{t('settings.resetConfirmDesc', 'Ova radnja će obrisati:')}</p>
              <ul className="list-disc list-inside text-sm space-y-1">
                <li>{t('settings.resetWillDelete1', 'Sve transakcije (prihode i rashode)')}</li>
                <li>{t('settings.resetWillDelete2', 'Sve projekte i njihove podatke')}</li>
                <li>{t('settings.resetWillDelete3', 'Sve budžete i njihove postavke')}</li>
              </ul>
              <p className="font-medium text-foreground mt-3">
                {t('settings.resetWillKeep', 'Vaši novčanici (izvori plaćanja) ostaju sa svojim stanjima.')}
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isResetting}>{t('common.cancel', 'Odustani')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 text-white hover:bg-amber-700"
              onClick={handleReset}
              disabled={isResetting}
            >
              {isResetting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t('settings.resetting', 'Resetiram...')}
                </>
              ) : (
                t('settings.confirmReset', 'Resetiraj')
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
      <BugReportDialog open={showBugReport} onOpenChange={setShowBugReport} />

      {/* Import Dialog */}
      <Dialog open={showImportDialog} onOpenChange={(isOpen) => {
        if (!isOpen) resetImportState();
        setShowImportDialog(isOpen);
      }}>
        <DialogContent showBackButton={false} className="sm:max-w-md">
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
        t('help.transfersStep1', "Transferi služe za praćenje prijenosa novca između vaših izvora plaćanja"),
        t('help.transfersStep2', "Npr. prijenos s bankovnog računa na gotovinu"),
        t('help.transfersStep3', "Transfer ne utječe na ukupni saldo - samo preraspodijeli sredstva")
      ]
    },
    {
      icon: "💳",
      title: t('help.paymentSources', 'Izvori plaćanja'),
      content: [
        t('help.paymentSourcesStep1', "Kreirajte izvore plaćanja poput: Plaća, Gotovina, Revolut, itd."),
        t('help.paymentSourcesStep2', "Svaki izvor ima svoj saldo koji se automatski ažurira"),
        t('help.paymentSourcesStep3', "Prihodi povećavaju saldo izvora, rashodi ga smanjuju"),
        t('help.paymentSourcesStep4', "Kliknite na izvor da vidite sve povezane transakcije"),
        t('help.paymentSourcesStep5', "Kliknite na karticu 'Prilagođeni izvori plaćanja' za cjeloviti prikaz")
      ]
    },
    {
      icon: "👥",
      title: t('help.sharedAccounts', 'Dijeljeni računi'),
      content: [
        t('help.sharedAccountsStep1', "Dijelite izvore plaćanja s drugim korisnicima"),
        t('help.sharedAccountsStep2', "Kliknite na ikonu članova (👥) kod izvora plaćanja"),
        t('help.sharedAccountsStep3', "Pozovite članove putem email adrese"),
        t('help.sharedAccountsStep4', "Članovi mogu dodavati transakcije na dijeljeni račun"),
        t('help.sharedAccountsStep5', "Komentirajte transakcije klikom na ikonu komentara (💬)")
      ]
    },
    {
      icon: "🏷️",
      title: t('help.categories', 'Kategorije'),
      content: [
        t('help.categoriesStep1', "Koristite ugrađene kategorije ili kreirajte vlastite"),
        t('help.categoriesStep2', "Kategorije pomažu u praćenju potrošnje po grupama"),
        t('help.categoriesStep3', "Kliknite na kategoriju da vidite sve transakcije u njoj"),
        t('help.categoriesStep4', "Vlastite kategorije kreirate u sekciji 'Prilagođene kategorije'")
      ]
    },
    {
      icon: "📋",
      title: t('help.projects', 'Projekti'),
      content: [
        t('help.projectsStep1', "Kreirajte projekte za praćenje specifičnih troškova"),
        t('help.projectsStep2', "Svaki projekt ima budžet, faze (milestones) i vremensku crtu"),
        t('help.projectsStep3', "Dodajte radnike i pratite radne sate po projektu"),
        t('help.projectsStep4', "Pozovite članove tima za suradnju na projektu"),
        t('help.projectsStep5', "Generirajte izvještaje za svaki projekt")
      ]
    },
    {
      icon: "🎯",
      title: t('help.budgets', 'Budžeti'),
      content: [
        t('help.budgetsStep1', "Postavite mjesečne ili tjedne budžete"),
        t('help.budgetsStep2', "Definirajte limite potrošnje po kategorijama"),
        t('help.budgetsStep3', "Pratite potrošnju u odnosu na postavljene limite"),
        t('help.budgetsStep4', "Primajte obavijesti kada se približite ili premašite limit"),
        t('help.budgetsStep5', "Dijelite budžete s drugim korisnicima")
      ]
    },
    {
      icon: "📅",
      title: t('help.installments', 'Rate (obročno plaćanje)'),
      content: [
        t('help.installmentsStep1', "Pratite obročna plaćanja i rate"),
        t('help.installmentsStep2', "Unesite ukupni iznos, broj rata i datum prve rate"),
        t('help.installmentsStep3', "Aplikacija automatski generira raspored plaćanja"),
        t('help.installmentsStep4', "Preostale obveze umanjuju vaš neto iznos (Net Worth)")
      ]
    },
    {
      icon: "🔍",
      title: t('help.filtersAndBulk', 'Filteri i grupne akcije'),
      content: [
        t('help.filtersStep1', "Filtrirajte transakcije po tipu, kategoriji, izvoru plaćanja i datumu"),
        t('help.filtersStep2', "Koristite pretragu za brzo pronalaženje transakcija"),
        t('help.filtersStep3', "Označite više transakcija odjednom pomoću checkboxova"),
        t('help.filtersStep4', "Grupno mijenjajte kategoriju, izvor plaćanja ili brišite transakcije")
      ]
    },
    {
      icon: "🤖",
      title: t('help.aiAssistant', 'AI financijski asistent'),
      content: [
        t('help.aiAssistantStep1', "Kliknite na AI avatar u donjem desnom kutu ekrana"),
        t('help.aiAssistantStep2', "Postavite pitanja o vašim financijama na prirodnom jeziku"),
        t('help.aiAssistantStep3', "AI analizira vaše prihode, rashode, budžete i projekte"),
        t('help.aiAssistantStep4', "Dobijte savjete za uštedu i pregled trendova potrošnje"),
        t('help.aiAssistantStep5', "Možete ga uključiti/isključiti u Postavkama")
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
        t('help.bankImportStep2', "Kliknite na 'Bankovna poveznica' karticu na početnoj stranici"),
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
        t('help.reportsStep3', "Filtrirajte po datumu i izvezite u PDF")
      ]
    },
    {
      icon: "🔔",
      title: t('help.notifications', 'Obavijesti'),
      content: [
        t('help.notificationsStep1', "Kliknite na ikonu zvona u zaglavlju za pregled obavijesti"),
        t('help.notificationsStep2', "Primajte obavijesti o pozivnicama za dijeljene račune"),
        t('help.notificationsStep3', "Prihvatite ili odbijte pozivnice izravno iz obavijesti"),
        t('help.notificationsStep4', "Budžetna upozorenja stižu kada se približite limitu")
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
      icon: "⚙️",
      title: t('help.settings', 'Postavke'),
      content: [
        t('help.settingsStep1', "Kliknite na ikonu zupčanika u zaglavlju"),
        t('help.settingsStep2', "Promijenite ime, jezik, temu i valutu"),
        t('help.settingsStep3', "Uključite/isključite AI asistenta i jednostavni način rada"),
        t('help.settingsStep4', "Jednostavni način skriva projekte, budžete i rate")
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
      <DialogContent className="max-w-2xl max-h-[100dvh] sm:max-h-[85vh] p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-3">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <HelpCircle className="w-6 h-6 text-primary" />
            {t('help.title', 'Upute za korištenje')}
          </DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="flex-1 max-h-[calc(100dvh-80px)] sm:max-h-[calc(85vh-80px)]">
          <div className="space-y-4 px-6 pb-6">
            <p className="text-muted-foreground text-sm">
              {t('help.intro', 'V&M Balance je aplikacija za praćenje osobnih financija. Evo kako ju koristiti:')}
            </p>
            
            {sections.map((section, index) => (
              <div 
                key={index} 
                className="bg-muted/50 rounded-lg p-3 space-y-1.5"
              >
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-full bg-primary/10 text-base">
                    {section.icon}
                  </div>
                  <h3 className="font-semibold">{section.title}</h3>
                </div>
                <ul className="space-y-0.5 ml-10">
                  {section.content.map((item, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-primary mt-0.5">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            
            <div className="bg-primary/10 rounded-lg p-4">
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
