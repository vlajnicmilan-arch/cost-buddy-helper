import { useState, useEffect, useRef } from 'react';
import { APP_VERSION } from '@/lib/version';
import { exportTextFile } from '@/lib/fileExport';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Settings, Loader2, Download, Check, AlertCircle, FileJson, HelpCircle, ChevronRight, User, Trash2, RotateCcw, Users, Bug, Shield, Share2, Mail, Copy, MessageCircle, Upload } from 'lucide-react';
import { BugReportDialog } from '@/components/BugReportDialog';
import { BusinessProfileDialog } from '@/components/BusinessProfileDialog';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { motion } from 'framer-motion';
import { 
  getAutoUpdatePreference, 
  setAutoUpdatePreference,
  checkForUpdates 
} from '@/components/PWAUpdatePrompt';
import { useStorage } from '@/contexts/StorageContext';
import { useAuth } from '@/hooks/useAuth';
import { useCurrency, CurrencyCode } from '@/contexts/CurrencyContext';
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
import { useAppLock } from '@/contexts/AppLockContext';
import { SetPinDialog } from '@/components/SetPinDialog';
import { SubscriptionSection } from '@/components/SubscriptionSection';

import { ProfileSection } from './ProfileSection';
import { AppearanceSection } from './AppearanceSection';
import { SecuritySection } from './SecuritySection';
import { NotificationsSection } from './NotificationsSection';
import { DataSection } from './DataSection';
import { DangerZoneSection } from './DangerZoneSection';
import { HelpDialogContent } from './HelpDialogContent';

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
  
  const [editingName, setEditingName] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [tempName, setTempName] = useState('');
  
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ expenses: number; items: number } | null>(null);
  const [importError, setImportError] = useState('');
  const [showImportDialog, setShowImportDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [showDeleteConfirm1, setShowDeleteConfirm1] = useState(false);
  const [showDeleteConfirm2, setShowDeleteConfirm2] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  
  const [showFamilyDisableConfirm, setShowFamilyDisableConfirm] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [showBusinessProfile, setShowBusinessProfile] = useState(false);
  const [showSetPin, setShowSetPin] = useState(false);
  
  const { storageMode } = useStorage();
  const { user } = useAuth();
  const { currency, setCurrency, multiCurrencyEnabled, setMultiCurrencyEnabled } = useCurrency();
  const { 
    displayName, setDisplayName,
    aiAssistantEnabled, setAiAssistantEnabled,
    simpleModeEnabled, setSimpleModeEnabled,
    familyModeEnabled, setFamilyModeEnabled,
    businessModeEnabled, setBusinessModeEnabled,
    emitFinancialReset,
  } = useAppState();
  const isLocalMode = storageMode === 'local';
  const appLock = useAppLock();

  useEffect(() => {
    if (open) {
      setAutoUpdate(getAutoUpdatePreference());
      setSoundEnabled(getNotificationSoundEnabled());
      setPushEnabled(getPushNotificationsEnabled());
      setIsDark(document.documentElement.classList.contains('dark'));
      setTempName(displayName);

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
    showSuccess(newIsDark ? t('settings.darkMode', 'Tamna tema aktivirana') : t('settings.lightMode', 'Svijetla tema aktivirana'));
  };

  const handleLanguageChange = (langCode: string) => {
    i18n.changeLanguage(langCode);
    showSuccess(t('settings.languageChanged', 'Jezik promijenjen'));
  };

  const handleSaveName = async () => {
    if (!tempName.trim()) {
      showError(t('settings.nameRequired', 'Ime je obavezno'));
      return;
    }
    setSavingName(true);
    try {
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
      showSuccess(t('settings.nameSaved', 'Ime uspješno spremljeno'));
    } catch (error) {
      console.error('Save name error:', error);
      showError(t('errors.generic', 'Došlo je do greške'));
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
      showSuccess(t('settings.autoUpdateEnabled', t('toasts.autoUpdateOn')));
    } else {
      toast.info(t('settings.autoUpdateDisabled', t('toasts.autoUpdateOff')));
    }
  };

  const handleCheckForUpdates = async () => {
    setIsCheckingUpdate(true);
    try { await checkForUpdates(); } finally { setIsCheckingUpdate(false); }
  };

  const handleSoundToggle = (enabled: boolean) => {
    setSoundEnabled(enabled);
    setNotificationSoundEnabled(enabled);
    showSuccess(enabled ? t('settings.soundEnabled', 'Zvučne obavijesti uključene') : t('settings.soundDisabled', 'Zvučne obavijesti isključene'));
  };

  const handlePushToggle = async (enabled: boolean) => {
    if (enabled) {
      const granted = await requestNotificationPermission();
      if (granted) {
        setPushEnabled(true);
        setPushNotificationsEnabled(true);
        showSuccess(t('settings.pushEnabled', 'Push obavijesti uključene'));
      } else {
        showError(t('settings.pushDenied', 'Preglednik je blokirao push obavijesti'));
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
        const { data: expenses, error: expError } = await supabase.from('expenses').select('*').eq('user_id', user.id);
        if (expError) throw expError;
        const { data: receiptItems, error: itemsError } = await supabase.from('receipt_items').select('*').in('expense_id', expenses?.map(e => e.id) || []);
        if (itemsError) throw itemsError;
        jsonData = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), source: 'cloud', expenses: expenses || [], receiptItems: receiptItems || [] }, null, 2);
      }
      await exportTextFile(jsonData, `vm-balance-backup-${new Date().toISOString().split('T')[0]}.json`, 'application/json');
      showSuccess(t('settings.exportSuccess', 'Backup uspješno izvezen'));
    } catch (err) {
      console.error('Export error:', err);
      showError(t('settings.exportError', 'Greška pri izvozu'));
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
        throw new Error(t('settings.invalidFileFormat', 'Nevažeći format datoteke'));
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
            .insert({ user_id: user.id, amount: expense.amount, description: expense.description, category: expense.category || 'other', type: expense.type || 'expense', date: expense.date, payment_source: expense.payment_source || 'cash', merchant_name: expense.merchant_name, ai_extracted: expense.ai_extracted || false })
            .select().single();
          if (insertError) continue;
          expenseCount++;
          if (data.receiptItems && inserted) {
            const relatedItems = data.receiptItems.filter((item: any) => item.expense_id === expense.id);
            for (const item of relatedItems) {
              const { error: itemError } = await supabase.from('receipt_items').insert({ expense_id: inserted.id, name: item.name, quantity: item.quantity || 1, unit_price: item.unit_price, total_price: item.total_price });
              if (!itemError) itemCount++;
            }
          }
        }
        setImportResult({ expenses: expenseCount, items: itemCount });
      }
      showSuccess(t('settings.importSuccess', 'Podaci uspješno uvezeni'));
      onDataImported?.();
    } catch (err) {
      console.error('Import error:', err);
      setImportError(err instanceof Error ? err.message : t('settings.importError', 'Greška pri uvozu podataka'));
      showError(t('settings.importError', 'Greška pri uvozu'));
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const resetImportState = () => { setImportError(''); setImportResult(null); setShowImportDialog(false); };

  const handleReset = async () => {
    setIsResetting(true);
    try {
      if (isLocalMode) {
        const { resetLocalData } = await import('@/lib/storage/indexedDB');
        await resetLocalData();
        showSuccess(t('settings.resetComplete', 'Podaci uspješno resetirani'));
        onDataImported?.();
      } else if (user) {
        const { data: expenses } = await supabase.from('expenses').select('id').eq('user_id', user.id);
        if (expenses && expenses.length > 0) {
          const expenseIds = expenses.map(e => e.id);
          await supabase.from('receipt_items').delete().in('expense_id', expenseIds);
          await supabase.from('transaction_notes').delete().in('expense_id', expenseIds);
        }
        await supabase.from('expenses').delete().eq('user_id', user.id);
        const { data: projects } = await supabase.from('projects').select('id').eq('user_id', user.id);
        if (projects && projects.length > 0) {
          const projectIds = projects.map(p => p.id);
          await supabase.from('project_milestones').delete().in('project_id', projectIds);
          await supabase.from('project_funding').delete().in('project_id', projectIds);
          await supabase.from('project_members').delete().in('project_id', projectIds);
          await supabase.from('project_invitations').delete().in('project_id', projectIds);
        }
        await supabase.from('projects').delete().eq('user_id', user.id);
        const { data: budgets } = await supabase.from('budget_plans').select('id').eq('user_id', user.id);
        if (budgets && budgets.length > 0) {
          const budgetIds = budgets.map(b => b.id);
          await supabase.from('budget_categories').delete().in('budget_id', budgetIds);
          await supabase.from('savings_goals').delete().in('budget_id', budgetIds);
          await supabase.from('budget_members').delete().in('budget_id', budgetIds);
          await supabase.from('budget_invitations').delete().in('budget_id', budgetIds);
        }
        await supabase.from('budget_plans').delete().eq('user_id', user.id);
        showSuccess(t('settings.resetComplete', 'Podaci uspješno resetirani'));
        onDataImported?.();
      }
      emitFinancialReset();
      setShowResetConfirm(false);
    } catch (error) {
      console.error('Reset error:', error);
      showError(t('errors.generic', 'Došlo je do greške'));
    } finally {
      setIsResetting(false);
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      if (isLocalMode) {
        const { clearLocalData } = await import('@/lib/storage/indexedDB');
        await clearLocalData();
        const storageConfig = localStorage.getItem('finmate-storage-config');
        const aiAssistant = localStorage.getItem('ai_assistant_enabled');
        const simpleMode = localStorage.getItem('simple_mode_enabled');
        const familyMode = localStorage.getItem('family_mode_enabled');
        const businessMode = localStorage.getItem('business_mode_enabled');
        localStorage.clear();
        if (storageConfig) localStorage.setItem('finmate-storage-config', storageConfig);
        if (aiAssistant) localStorage.setItem('ai_assistant_enabled', aiAssistant);
        if (simpleMode) localStorage.setItem('simple_mode_enabled', simpleMode);
        if (familyMode) localStorage.setItem('family_mode_enabled', familyMode);
        if (businessMode) localStorage.setItem('business_mode_enabled', businessMode);
        showSuccess(t('settings.accountDeleted', 'Račun uspješno obrisan'));
        window.location.href = '/onboarding';
      } else if (user) {
        try {
          const { data: expenses } = await supabase.from('expenses').select('id').eq('user_id', user.id);
          if (expenses && expenses.length > 0) {
            const expenseIds = expenses.map(e => e.id);
            await supabase.from('receipt_items').delete().in('expense_id', expenseIds);
          }
          await supabase.from('transaction_notes').delete().eq('user_id', user.id);
          await supabase.from('expenses').delete().eq('user_id', user.id);
          const { data: ownedSources } = await supabase.from('income_sources').select('id').eq('user_id', user.id);
          if (ownedSources && ownedSources.length > 0) {
            const sourceIds = ownedSources.map(s => s.id);
            await supabase.from('income_source_members').delete().in('income_source_id', sourceIds);
            await supabase.from('income_source_invitations').delete().in('income_source_id', sourceIds);
          }
          await supabase.from('income_sources').delete().eq('user_id', user.id);
          await supabase.from('payment_source_cards').delete().eq('user_id', user.id);
          await supabase.from('custom_payment_sources').delete().eq('user_id', user.id);
          await supabase.from('custom_categories').delete().eq('user_id', user.id);
          await supabase.from('bank_connections').delete().eq('user_id', user.id);
          await supabase.from('notifications').delete().eq('user_id', user.id);
          await supabase.from('profiles').delete().eq('user_id', user.id);
        } catch (dbError) {
          console.error('Error deleting data:', dbError);
        }
        await supabase.auth.signOut();
        const storageConfig = localStorage.getItem('finmate-storage-config');
        const aiAssistant = localStorage.getItem('ai_assistant_enabled');
        const simpleMode = localStorage.getItem('simple_mode_enabled');
        const familyMode = localStorage.getItem('family_mode_enabled');
        const businessMode = localStorage.getItem('business_mode_enabled');
        localStorage.clear();
        if (storageConfig) localStorage.setItem('finmate-storage-config', storageConfig);
        if (aiAssistant) localStorage.setItem('ai_assistant_enabled', aiAssistant);
        if (simpleMode) localStorage.setItem('simple_mode_enabled', simpleMode);
        if (familyMode) localStorage.setItem('family_mode_enabled', familyMode);
        if (businessMode) localStorage.setItem('business_mode_enabled', businessMode);
        showSuccess(t('settings.accountDeleted', 'Račun uspješno obrisan'));
        window.location.href = '/';
      }
    } catch (error) {
      console.error('Delete account error:', error);
      showError(t('errors.generic', 'Došlo je do greške'));
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm2(false);
    }
  };

  const handleShareApp = async () => {
    if (!user) return;
    try {
      const text = 'Isprobaj V&M Balance - aplikaciju za praćenje financija!';
      const url = `https://vmbalance.com?ref=${user.id}`;
      if (navigator.share) {
        await navigator.share({ title: 'V&M Balance', text, url });
      } else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        showSuccess(t('common.copied', 'Link kopiran!'));
      }
    } catch (e: any) {
      if (!e?.message?.includes('cancel') && !e?.message?.includes('abort')) {
        console.error('Share error:', e);
      }
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
            <ProfileSection
              displayName={displayName}
              editingName={editingName}
              setEditingName={setEditingName}
              tempName={tempName}
              setTempName={setTempName}
              savingName={savingName}
              onSaveName={handleSaveName}
              onCancelEditName={handleCancelEditName}
            />

            <SubscriptionSection />

            <AppearanceSection
              isDark={isDark}
              onToggleTheme={toggleTheme}
              languageCode={i18n.language}
              onLanguageChange={handleLanguageChange}
            />

            <Separator />

            <SecuritySection
              appLock={appLock}
              onShowSetPin={() => setShowSetPin(true)}
            />

            <Separator />

            {/* Help Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {t('settings.help', 'Pomoć')}
              </h3>
              
              <button
                onClick={() => { setOpen(false); setShowHelpDialog(true); }}
                className="w-full flex items-center justify-between p-3 bg-muted/30 rounded-xl hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <HelpCircle className="w-4 h-4 text-primary" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium">{t('settings.userGuide', 'Upute za korištenje')}</p>
                    <p className="text-xs text-muted-foreground">{t('settings.userGuideDesc', 'Naučite koristiti aplikaciju')}</p>
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
                        <p className="text-sm font-medium">{t('settings.inviteFriend', 'Pozovi prijatelja')}</p>
                        <p className="text-xs text-muted-foreground">{t('settings.inviteFriendDesc', 'Podijeli link za preuzimanje aplikacije')}</p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </button>

                  <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
                    <DialogContent className="max-w-sm rounded-2xl">
                      <DialogHeader>
                        <DialogTitle className="text-center">{t('settings.shareWithFriend', 'Podijeli s prijateljem')}</DialogTitle>
                      </DialogHeader>
                      <div className="grid grid-cols-2 gap-3 py-4">
                        {(() => {
                          const referralUrl = `${window.location.origin}/install?ref=${user.id}`;
                          const shareText = t('settings.shareText', 'Preuzmi CostBuddy aplikaciju za jednostavno praćenje troškova!');
                          return (
                            <>
                              <button onClick={() => { window.location.href = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText + ' ' + referralUrl)}`; setShowShareDialog(false); }} className="flex flex-col items-center gap-2 p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors">
                                <div className="w-12 h-12 rounded-full bg-[#25D366]/10 flex items-center justify-center"><MessageCircle className="w-6 h-6 text-[#25D366]" /></div>
                                <span className="text-sm font-medium">WhatsApp</span>
                              </button>
                              <button onClick={() => { window.open(`viber://forward?text=${encodeURIComponent(shareText + ' ' + referralUrl)}`, '_blank'); setShowShareDialog(false); }} className="flex flex-col items-center gap-2 p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors">
                                <div className="w-12 h-12 rounded-full bg-[#7360F2]/10 flex items-center justify-center"><MessageCircle className="w-6 h-6 text-[#7360F2]" /></div>
                                <span className="text-sm font-medium">Viber</span>
                              </button>
                              <button onClick={() => { window.open(`mailto:?subject=${encodeURIComponent('CostBuddy')}&body=${encodeURIComponent(shareText + '\n\n' + referralUrl)}`, '_blank'); setShowShareDialog(false); }} className="flex flex-col items-center gap-2 p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors">
                                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center"><Mail className="w-6 h-6 text-primary" /></div>
                                <span className="text-sm font-medium">Email</span>
                              </button>
                              <button onClick={async () => { try { await navigator.clipboard.writeText(referralUrl); showSuccess(t('settings.linkCopied', 'Link kopiran!')); } catch { showError(t('settings.copyError', 'Greška pri kopiranju')); } setShowShareDialog(false); }} className="flex flex-col items-center gap-2 p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors">
                                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center"><Copy className="w-6 h-6 text-muted-foreground" /></div>
                                <span className="text-sm font-medium">{t('settings.copyLink', 'Kopiraj link')}</span>
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
                  onClick={() => { setOpen(false); setShowBugReport(true); }}
                  className="w-full flex items-center justify-between p-3 bg-muted/30 rounded-xl hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center">
                      <Bug className="w-4 h-4 text-destructive" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-medium">{t('settings.reportProblem', 'Prijavi problem')}</p>
                      <p className="text-xs text-muted-foreground">{t('settings.reportProblemDesc', 'Prijavite grešku ili nejasnoću')}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              )}

              {isAdminUser && (
                <button
                  onClick={() => { setOpen(false); navigate('/admin'); }}
                  className="w-full flex items-center justify-between p-3 bg-muted/30 rounded-xl hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Shield className="w-4 h-4 text-primary" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-medium">{t('settings.adminPanel', 'Admin panel')}</p>
                      <p className="text-xs text-muted-foreground">{t('settings.adminPanelDesc', 'Pregledaj prijave problema')}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              )}
            </div>

            <Separator />

            <DataSection
              isLocalMode={isLocalMode}
              onNavigateToSetup={() => { setOpen(false); navigate('/setup'); }}
              autoUpdate={autoUpdate}
              onAutoUpdateChange={handleAutoUpdateChange}
              onCheckForUpdates={handleCheckForUpdates}
              isCheckingUpdate={isCheckingUpdate}
              currencyCode={currency.code}
              onCurrencyChange={(code) => setCurrency(code)}
              multiCurrencyEnabled={multiCurrencyEnabled}
              onMultiCurrencyChange={setMultiCurrencyEnabled}
              onExport={handleExport}
              isExporting={isExporting}
              onShowImportDialog={() => setShowImportDialog(true)}
            />

            <Separator />

            <NotificationsSection
              soundEnabled={soundEnabled}
              onSoundToggle={handleSoundToggle}
              pushEnabled={pushEnabled}
              onPushToggle={handlePushToggle}
              aiAssistantEnabled={aiAssistantEnabled}
              onAiAssistantChange={setAiAssistantEnabled}
              simpleModeEnabled={simpleModeEnabled}
              onSimpleModeChange={setSimpleModeEnabled}
              familyModeEnabled={familyModeEnabled}
              onFamilyModeToggle={(checked) => {
                if (!checked) {
                  setShowFamilyDisableConfirm(true);
                } else {
                  setFamilyModeEnabled(true);
                  showSuccess(t('settings.familyModeEnabled', 'Obiteljski način uključen'));
                }
              }}
              businessModeEnabled={businessModeEnabled}
              onBusinessModeChange={setBusinessModeEnabled}
              onShowBusinessProfile={() => setShowBusinessProfile(true)}
              isLocalMode={isLocalMode}
            />

            <Separator />

            <DangerZoneSection
              onShowResetConfirm={() => setShowResetConfirm(true)}
              onShowDeleteConfirm={() => setShowDeleteConfirm1(true)}
              user={user}
              onNavigateToPrivacy={() => { setOpen(false); navigate('/privacy-policy'); }}
              onShareApp={handleShareApp}
            />
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
            <AlertDialogAction className="bg-amber-600 text-white hover:bg-amber-700" onClick={() => { setFamilyModeEnabled(false); setShowFamilyDisableConfirm(false); showSuccess(t('settings.familyModeDisabled', 'Obiteljski način isključen')); }}>
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
            <AlertDialogAction className="bg-amber-600 text-white hover:bg-amber-700" onClick={handleReset} disabled={isResetting}>
              {isResetting ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('settings.resetting', 'Resetiram...')}</>) : t('settings.confirmReset', 'Resetiraj')}
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
          <div className="p-3 bg-muted/50 border border-border rounded-xl space-y-2">
            <p className="text-sm font-medium flex items-center gap-2">
              <Download className="w-4 h-4 text-primary" />
              {t('settings.exportBeforeDelete', 'Želite li prvo izvesti podatke?')}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('settings.exportBeforeDeleteDesc', 'Preporučujemo izvoz podataka prije brisanja računa kako biste imali sigurnosnu kopiju.')}
            </p>
            <Button variant="outline" size="sm" className="w-full gap-2 rounded-lg" onClick={handleExport} disabled={isExporting}>
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {t('settings.exportNow', 'Izvezi sada')}
            </Button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Odustani')}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { setShowDeleteConfirm1(false); setShowDeleteConfirm2(true); }}>
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
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDeleteAccount} disabled={isDeleting}>
              {isDeleting ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('settings.deleting', 'Brišem...')}</>) : t('settings.deleteForever', 'Obriši zauvijek')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SetPinDialog open={showSetPin} onOpenChange={setShowSetPin} />
      <HelpDialogContent open={showHelpDialog} onOpenChange={setShowHelpDialog} />
      <BugReportDialog open={showBugReport} onOpenChange={setShowBugReport} />
      <BusinessProfileDialog open={showBusinessProfile} onOpenChange={setShowBusinessProfile} />

      {/* Import Dialog */}
      <Dialog open={showImportDialog} onOpenChange={(isOpen) => { if (!isOpen) resetImportState(); setShowImportDialog(isOpen); }}>
        <DialogContent showBackButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileJson className="w-5 h-5" />
              {t('settings.importTitle', 'Uvezi backup')}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
            {!importResult ? (
              <>
                <div
                  onClick={() => !isImporting && fileInputRef.current?.click()}
                  className={`border-2 border-dashed border-border/50 rounded-xl p-8 text-center cursor-pointer transition-all ${isImporting ? 'opacity-50' : 'hover:border-primary/50 hover:bg-muted/30'}`}
                >
                  {isImporting ? (
                    <><Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-primary" /><p className="font-medium">{t('settings.importing', 'Uvozim podatke...')}</p></>
                  ) : (
                    <><Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" /><p className="font-medium mb-2">{t('settings.selectFile', 'Odaberi JSON datoteku')}</p><p className="text-sm text-muted-foreground">{t('settings.fileHint', 'Datoteka mora biti prethodno izvezena iz V&M Balance')}</p></>
                  )}
                </div>
                {importError && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-xl flex items-center gap-2 text-destructive">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span className="text-sm">{importError}</span>
                  </motion.div>
                )}
              </>
            ) : (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-6">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.1 }} className="w-16 h-16 mx-auto mb-4 rounded-full bg-income/20 flex items-center justify-center">
                  <Check className="w-8 h-8 text-income" />
                </motion.div>
                <p className="font-medium text-lg">{t('settings.importComplete', 'Uvoz završen!')}</p>
                <p className="text-muted-foreground mt-1">
                  {t('settings.importedCount', 'Uvezeno {{count}} transakcija', { count: importResult.expenses })}
                  {importResult.items > 0 && ` ${t('settings.andItems', 'i {{count}} artikala', { count: importResult.items })}`}
                </p>
                <Button onClick={resetImportState} className="mt-6 rounded-xl">{t('common.close', 'Zatvori')}</Button>
              </motion.div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
