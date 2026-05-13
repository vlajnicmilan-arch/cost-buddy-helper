import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Volume2, Bell, Bot, Sparkles, Users, Building2, Lock, Info, ChevronDown, MessageSquare, ArrowLeftRight, Clock, FolderKanban, PiggyBank, CalendarClock, BadgePercent, Megaphone, Sunrise, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from 'react-i18next';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { useNotificationPreferences, type PushCategory } from '@/hooks/useNotificationPreferences';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { useState } from 'react';

interface NotificationsSectionProps {
  soundEnabled: boolean;
  onSoundToggle: (v: boolean) => void;
  pushEnabled: boolean;
  onPushToggle: (v: boolean) => void;
  aiAssistantEnabled: boolean;
  onAiAssistantChange: (v: boolean) => void;
  simpleModeEnabled: boolean;
  onSimpleModeChange: (v: boolean) => void;
  familyModeEnabled: boolean;
  onFamilyModeToggle: (checked: boolean) => void;
  businessModeEnabled: boolean;
  onBusinessModeChange: (v: boolean) => void;
  onShowBusinessProfile: () => void;
  isLocalMode: boolean;
}

export const NotificationsSection = ({
  soundEnabled, onSoundToggle,
  pushEnabled, onPushToggle,
  aiAssistantEnabled, onAiAssistantChange,
  simpleModeEnabled, onSimpleModeChange,
  familyModeEnabled, onFamilyModeToggle,
  businessModeEnabled, onBusinessModeChange,
  onShowBusinessProfile, isLocalMode
}: NotificationsSectionProps) => {
  const { t } = useTranslation();
  const { hasAccess } = useFeatureAccess();
  const navigate = useNavigate();
  const canUseBusiness = hasAccess('business_module');
  const isNative = Capacitor.isNativePlatform();
  const { prefs, setCategory } = useNotificationPreferences();
  const [showCategories, setShowCategories] = useState(false);

  const categoryItems: Array<{
    key: PushCategory;
    icon: typeof MessageSquare;
    labelKey: string;
    labelDefault: string;
    descKey: string;
    descDefault: string;
    enabled: boolean;
  }> = [
    { key: 'chat', icon: MessageSquare, labelKey: 'settings.notifChat', labelDefault: 'Poruke i komentari', descKey: 'settings.notifChatDesc', descDefault: 'Obiteljski chat i bilješke na transakcijama', enabled: prefs.chat_enabled },
    { key: 'transactions', icon: ArrowLeftRight, labelKey: 'settings.notifTransactions', labelDefault: 'Transakcije', descKey: 'settings.notifTransactionsDesc', descDefault: 'Dijeljeni računi i projektne transakcije', enabled: prefs.transactions_enabled },
    { key: 'pending', icon: Clock, labelKey: 'settings.notifPending', labelDefault: 'Odobrenja na čekanju', descKey: 'settings.notifPendingDesc', descDefault: 'Transakcije koje čekaju vašu potvrdu', enabled: prefs.pending_enabled },
    { key: 'projects', icon: FolderKanban, labelKey: 'settings.notifProjects', labelDefault: 'Projekti', descKey: 'settings.notifProjectsDesc', descDefault: 'Pozivnice i promjene članstva', enabled: prefs.projects_enabled },
    { key: 'budgets', icon: PiggyBank, labelKey: 'settings.notifBudgets', labelDefault: 'Budžeti', descKey: 'settings.notifBudgetsDesc', descDefault: 'Upozorenja o prekoračenju i pragovima', enabled: prefs.budgets_enabled },
    { key: 'reminders', icon: CalendarClock, labelKey: 'settings.notifReminders', labelDefault: 'Podsjetnici i rokovi', descKey: 'settings.notifRemindersDesc', descDefault: 'Kalendar i rokovi faza projekta', enabled: prefs.reminders_enabled },
    { key: 'trial', icon: BadgePercent, labelKey: 'settings.notifTrial', labelDefault: 'Pretplata', descKey: 'settings.notifTrialDesc', descDefault: 'Podsjetnici o probnom razdoblju i naplati', enabled: prefs.trial_enabled },
    { key: 'broadcast', icon: Megaphone, labelKey: 'settings.notifBroadcast', labelDefault: 'Sustavske obavijesti', descKey: 'settings.notifBroadcastDesc', descDefault: 'Važne najave i nadogradnje aplikacije', enabled: prefs.broadcast_enabled },
  ];

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        {t('settings.notifications', 'Obavijesti')}
      </h3>

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
        <Switch id="sound-notifications" checked={soundEnabled} onCheckedChange={onSoundToggle} />
      </div>

      <div className="space-y-1">
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
          <Switch id="push-notifications" checked={pushEnabled} onCheckedChange={onPushToggle} />
        </div>
        {!isNative && (
          <p className="text-[11px] text-muted-foreground flex items-start gap-1.5 px-3">
            <Info className="w-3 h-3 mt-0.5 shrink-0" />
            <span>
              {t(
                'settings.pushNotificationsWebHint',
                'Push obavijesti dostupne su u Android aplikaciji'
              )}
            </span>
          </p>
        )}

        {pushEnabled && (
          <Collapsible open={showCategories} onOpenChange={setShowCategories} className="mt-2">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between text-xs h-8 px-3">
                <span>{t('settings.notifCategories', 'Postavke po kategoriji')}</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showCategories ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-1.5 mt-2">
              {categoryItems.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.key} className="flex items-center justify-between p-2.5 bg-muted/20 rounded-lg">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                        <Icon className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <Label className="text-xs font-medium cursor-pointer block truncate">
                          {t(item.labelKey, item.labelDefault)}
                        </Label>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {t(item.descKey, item.descDefault)}
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={item.enabled}
                      onCheckedChange={(v) => setCategory(item.key, v)}
                    />
                  </div>
                );
              })}
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>

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
              onAiAssistantChange(checked);
              showSuccess(checked 
                ? t('settings.aiEnabled', 'AI asistent uključen') 
                : t('settings.aiDisabled', 'AI asistent isključen')
              );
            }}
          />
        </div>
      )}

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
            onSimpleModeChange(checked);
            showSuccess(checked 
              ? t('settings.simpleModeEnabled', 'Jednostavni način uključen') 
              : t('settings.simpleModeDisabled', 'Puni način vraćen')
            );
          }}
        />
      </div>

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
            onCheckedChange={onFamilyModeToggle}
          />
        </div>
      )}

      {!isLocalMode && (
        <div className="space-y-2">
          <div className="flex items-center justify-between p-3 bg-muted/30 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Building2 className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="business-mode" className="text-sm font-medium cursor-pointer">
                    {t('settings.businessMode', 'Poslovni način')}
                  </Label>
                  {!canUseBusiness && <Lock className="w-3 h-3 text-muted-foreground" />}
                </div>
                <p className="text-xs text-muted-foreground">
                  {canUseBusiness
                    ? t('settings.businessModeDesc', 'Poslovna terminologija i profil tvrtke')
                    : t('settings.businessModeLocked', 'Dostupno uz Business pretplatu')}
                </p>
              </div>
            </div>
            <Switch
              id="business-mode"
              checked={businessModeEnabled && canUseBusiness}
              onCheckedChange={(checked) => {
                if (!canUseBusiness) {
                  // Block toggle and route to paywall
                  showError(t('settings.businessModeLocked', 'Dostupno uz Business pretplatu'));
                  navigate('/paywall');
                  return;
                }
                onBusinessModeChange(checked);
                showSuccess(checked
                  ? t('settings.businessModeEnabled', 'Poslovni način uključen')
                  : t('settings.businessModeDisabled', 'Osobni način vraćen')
                );
              }}
            />
          </div>
          {businessModeEnabled && canUseBusiness && (
            <Button variant="outline" className="w-full" onClick={onShowBusinessProfile}>
              <Building2 className="w-4 h-4 mr-2" />
              {t('business.companies', 'Tvrtke')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
