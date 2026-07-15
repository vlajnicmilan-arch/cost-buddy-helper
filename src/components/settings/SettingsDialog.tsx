import { useState, useEffect, useRef } from 'react';
import { APP_VERSION } from '@/lib/version';
import { exportTextFile, type ExportMode } from '@/lib/fileExport';
import { coerceCanonicalShape } from '@/lib/paymentSource/normalize';
import { exportAllUserDataAsZip } from '@/lib/dataExportZip';
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
import { checkForUpdates } from '@/components/PWAUpdatePrompt';

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
import { ModulesSection } from './ModulesSection';
import { DataSection } from './DataSection';
import { AdvancedSection } from './AdvancedSection';
import { DangerZoneSection } from './DangerZoneSection';



import { HelpDialogContent } from './HelpDialogContent';
import { MyFeedbackSection } from '@/components/feedback/MyFeedbackSection';
import { ContactSupportDialog } from '@/components/support/ContactSupportDialog';

interface SettingsDialogProps {
  onDataImported?: () => void;
}

export const SettingsDialog = ({ onDataImported }: SettingsDialogProps = {}) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [showSupportDialog, setShowSupportDialog] = useState(false);

  // Open Help/FAQ when redirected from auto-responder email (?openHelp=1)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('openHelp') === '1') {
      setShowHelpDialog(true);
      params.delete('openHelp');
      const newSearch = params.toString();
      const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash;
      window.history.replaceState({}, '', newUrl);
    }
  }, []);

  const [showBugReport, setShowBugReport] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(false);

  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [isDark, setIsDark] = useState(false);
  
  const [editingName, setEditingName] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [tempName, setTempName] = useState('');
  
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingZip, setIsExportingZip] = useState(false);
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
    emitFinancialReset,
  } = useAppState();
  const isLocalMode = storageMode === 'local';
  const appLock = useAppLock();

  useEffect(() => {
    if (open) {
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
      // Try native push first (Capacitor); falls back to web on browser
      const { Capacitor } = await import('@capacitor/core');
      if (Capacitor.isNativePlatform()) {
        const { registerNativePush } = await import('@/lib/nativePush');
        const ok = await registerNativePush();
        if (ok) {
          setPushEnabled(true);
          setPushNotificationsEnabled(true);
          showSuccess(t('settings.pushEnabled', 'Push obavijesti uključene'));
        } else {
          showError(t('settings.pushDenied', 'Dozvola odbijena'));
        }
        return;
      }
      const granted = await requestNotificationPermission();
      if (granted) {
        setPushEnabled(true);
        setPushNotificationsEnabled(true);
        showSuccess(t('settings.pushEnabled', 'Push obavijesti uključene'));
      } else {
        showError(t('settings.pushDenied', 'Preglednik je blokirao push obavijesti'));
      }
    } else {
      const { Capacitor } = await import('@capacitor/core');
      if (Capacitor.isNativePlatform()) {
        const { unregisterNativePush } = await import('@/lib/nativePush');
        await unregisterNativePush();
      }
      setPushEnabled(false);
      setPushNotificationsEnabled(false);
      toast.info(t('settings.pushDisabled', 'Push obavijesti isključene'));
    }
  };

  const handleExport = async (mode: ExportMode = 'save') => {
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
      await exportTextFile(jsonData, `vm-balance-backup-${new Date().toISOString().split('T')[0]}.json`, 'application/json', false, mode);
      showSuccess(t('settings.exportSuccess', 'Backup uspješno izvezen'));
    } catch (err) {
      console.error('Export error:', err);
      showError(t('settings.exportError', 'Greška pri izvozu'));
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportZip = async (mode: ExportMode = 'save') => {
    if (isLocalMode) {
      showError(t('settings.exportZipCloudOnly', 'ZIP izvoz dostupan je samo u cloud načinu'));
      return;
    }
    setIsExportingZip(true);
    try {
      await exportAllUserDataAsZip(mode);
      showSuccess(t('settings.exportZipSuccess', 'Svi podaci izvezeni u ZIP'));
    } catch (err) {
      console.error('ZIP export error:', err);
      showError(t('settings.exportZipError', 'Greška pri ZIP izvozu'));
    } finally {
      setIsExportingZip(false);
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
          // Backup-restore: older exports may carry raw UUID payment sources.
          // Coerce to canonical shape so DB CHECK constraint accepts the row.
          const canonicalPaymentSource = coerceCanonicalShape(expense.payment_source, 'cash');
          /* eslint-disable no-restricted-syntax -- backup-restore is a one-shot import path with shape-coerced value */
          const { data: inserted, error: insertError } = await supabase
            .from('expenses')
            .insert({ user_id: user.id, amount: expense.amount, description: expense.description, category: expense.category || 'other', type: expense.type || 'expense', date: expense.date, payment_source: canonicalPaymentSource, merchant_name: expense.merchant_name, ai_extracted: expense.ai_extracted || false })
            .select().single();
          /* eslint-enable no-restricted-syntax */
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
        const krugMode = localStorage.getItem('krug_mode_enabled');
        const businessMode = localStorage.getItem('business_mode_enabled');
        localStorage.clear();
        if (storageConfig) localStorage.setItem('finmate-storage-config', storageConfig);
        if (aiAssistant) localStorage.setItem('ai_assistant_enabled', aiAssistant);
        if (krugMode) localStorage.setItem('krug_mode_enabled', krugMode);
        if (businessMode) localStorage.setItem('business_mode_enabled', businessMode);
        showSuccess(t('settings.accountDeleted', 'Račun uspješno obrisan'));
        window.location.href = '/onboarding';
      } else if (user) {
        // Pozovi edge funkciju koja zakazuje brisanje za 30 dana (grace period)
        const { data, error } = await supabase.functions.invoke('request-account-deletion', {
          body: { reason: null },
        });
        if (error) throw error;

        const scheduledDate = new Date(data.scheduled_for).toLocaleDateString(
          i18n.language || 'hr-HR'
        );
        if (data?.already_scheduled) {
          showSuccess(t('settings.deletionAlreadyScheduled', { date: scheduledDate }));
        } else {
          showSuccess(t('settings.deletionScheduled', { date: scheduledDate }));
        }

        await supabase.auth.signOut();
        const storageConfig = localStorage.getItem('finmate-storage-config');
        const aiAssistant = localStorage.getItem('ai_assistant_enabled');
        const krugMode = localStorage.getItem('krug_mode_enabled');
        const businessMode = localStorage.getItem('business_mode_enabled');
        localStorage.clear();
        if (storageConfig) localStorage.setItem('finmate-storage-config', storageConfig);
        if (aiAssistant) localStorage.setItem('ai_assistant_enabled', aiAssistant);
        if (krugMode) localStorage.setItem('krug_mode_enabled', krugMode);
        if (businessMode) localStorage.setItem('business_mode_enabled', businessMode);
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

            <ModulesSection
              onShowBusinessProfile={() => setShowBusinessProfile(true)}
              isLocalMode={isLocalMode}
            />

            <Separator />

            <NotificationsSection
              soundEnabled={soundEnabled}
              onSoundToggle={handleSoundToggle}
              pushEnabled={pushEnabled}
              onPushToggle={handlePushToggle}
              isLocalMode={isLocalMode}
              isAdmin={isAdminUser}
            />

            <Separator />

            <SecuritySection
              appLock={appLock}
              onShowSetPin={() => setShowSetPin(true)}
            />

            <Separator />

            <DataSection
              isLocalMode={isLocalMode}
              onNavigateToSetup={() => { setOpen(false); navigate('/setup'); }}
              currencyCode={currency.code}
              onCurrencyChange={(code) => setCurrency(code)}
              onExportZip={handleExportZip}
              isExportingZip={isExportingZip}
              onShowImportDialog={() => setShowImportDialog(true)}
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

              <button
                onClick={() => { setOpen(false); setShowSupportDialog(true); }}
                className="w-full flex items-center justify-between p-3 bg-muted/30 rounded-xl hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Mail className="w-4 h-4 text-primary" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium">{t('settings.contactSupport', 'Kontakt podrška')}</p>
                    <p className="text-xs text-muted-foreground">{t('settings.contactSupportDesc', 'Odgovor unutar 24h • support@vmbalance.com')}</p>
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
                          const shareText = t('settings.shareText', 'Preuzmi Centar aplikaciju za jednostavno praćenje troškova!');
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
                              <button onClick={() => { window.open(`mailto:?subject=${encodeURIComponent('Centar')}&body=${encodeURIComponent(shareText + '\n\n' + referralUrl)}`, '_blank'); setShowShareDialog(false); }} className="flex flex-col items-center gap-2 p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors">
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

            <MyFeedbackSection />

            <Separator />

            <AdvancedSection
              onCheckForUpdates={handleCheckForUpdates}
              isCheckingUpdate={isCheckingUpdate}
              multiCurrencyEnabled={multiCurrencyEnabled}
              onMultiCurrencyChange={setMultiCurrencyEnabled}
              onExport={handleExport}
              isExporting={isExporting}
              isAdmin={isAdminUser}
            />

            <Separator />

            <DangerZoneSection
              onShowResetConfirm={() => setShowResetConfirm(true)}
              onShowDeleteConfirm={() => setShowDeleteConfirm1(true)}
              user={user}
              onNavigateToPrivacy={() => { setOpen(false); navigate('/privacy-policy'); }}
              onNavigateToTerms={() => { setOpen(false); navigate('/terms-of-service'); }}
              onNavigateToTrash={() => { setOpen(false); navigate('/trash'); }}
            />

          </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>




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
            <Button variant="outline" size="sm" className="w-full gap-2 rounded-lg" onClick={() => handleExport('save')} disabled={isExporting}>
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
      <ContactSupportDialog
        open={showSupportDialog}
        onOpenChange={setShowSupportDialog}
        onOpenHelp={() => setShowHelpDialog(true)}
      />
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
                    <><Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" /><p className="font-medium mb-2">{t('settings.selectFile', 'Odaberi JSON datoteku')}</p><p className="text-sm text-muted-foreground">{t('settings.fileHint', 'Datoteka mora biti prethodno izvezena iz Centar')}</p></>
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
