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
  classicDashboard: boolean;
  onClassicDashboardChange: (v: boolean) => void;
  isLocalMode: boolean;
}

export const NotificationsSection = ({
  soundEnabled, onSoundToggle,
  pushEnabled, onPushToggle,
  aiAssistantEnabled, onAiAssistantChange,
  simpleModeEnabled, onSimpleModeChange,
  classicDashboard, onClassicDashboardChange,
  isLocalMode,
}: NotificationsSectionProps) => {
  const { t } = useTranslation();
  const { hasAccess } = useFeatureAccess();
  const navigate = useNavigate();
  const isNative = Capacitor.isNativePlatform();
  const { prefs, setCategory, setWeekendEnabled, setFlag, setDigestHour } = useNotificationPreferences();
  const { user } = useAuth();
  const [showCategories, setShowCategories] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [sendingDigestTest, setSendingDigestTest] = useState(false);

  const sendDailySummaryTest = async () => {
    if (!user || sendingTest) return;
    setSendingTest(true);
    try {
      const { error } = await supabase.functions.invoke('send-daily-summary', {
        body: { test: true, userId: user.id },
      });
      if (error) throw error;
      showSuccess(t('settings.dailySummaryTestSent', 'Testna obavijest poslana'));
    } catch (e) {
      console.error('[daily-summary] test failed:', e);
      showError(t('settings.dailySummaryTestFailed', 'Slanje nije uspjelo'));
    } finally {
      setSendingTest(false);
    }
  };

  const sendDigestTest = async () => {
    if (!user || sendingDigestTest) return;
    setSendingDigestTest(true);
    try {
      const { data, error } = await supabase.functions.invoke('flush-participant-digest', {
        body: { test: true },
      });
      if (error) throw error;
      const sent = (data as { sent?: number } | null)?.sent ?? 0;
      if (sent > 0) {
        showSuccess(t('settings.digestTestSent', 'Testni sažetak poslan'));
      } else {
        showError(t('settings.digestTestNoProject', 'Nemaš projekt — testni sažetak nije poslan'));
      }
    } catch (e) {
      console.error('[participant-digest] test failed:', e);
      showError(t('settings.digestTestFailed', 'Slanje sažetka nije uspjelo'));
    } finally {
      setSendingDigestTest(false);
    }
  };

  const categoryItems: Array<{
    key: PushCategory;
    icon: typeof MessageSquare;
    labelKey: string;
    labelDefault: string;
    descKey: string;
    descDefault: string;
    enabled: boolean;
  }> = [
    { key: 'chat', icon: MessageSquare, labelKey: 'settings.notifChat', labelDefault: 'Bilješke i komentari', descKey: 'settings.notifChatDesc', descDefault: 'Bilješke na transakcijama i komentari', enabled: prefs.chat_enabled },
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

      {/* Dnevni sažetak */}
      <div className="space-y-1">
        <div className="flex items-center justify-between p-3 bg-muted/30 rounded-xl">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Sunrise className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <Label htmlFor="daily-summary" className="text-sm font-medium cursor-pointer">
                {t('settings.dailySummary', 'Dnevni sažetak')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('settings.dailySummaryDesc', 'Svaki dan u 21:00 ako si imao transakcija.')}
              </p>
            </div>
          </div>
          <Switch
            id="daily-summary"
            checked={prefs.daily_summary_enabled}
            onCheckedChange={(v) => setCategory('daily_summary', v)}
          />
        </div>

        {prefs.daily_summary_enabled && (
          <>
            <div className="flex items-center justify-between p-2.5 ml-12 mr-1 bg-muted/20 rounded-lg">
              <Label htmlFor="daily-summary-weekend" className="text-xs font-medium cursor-pointer">
                {t('settings.dailySummaryWeekend', 'Šalji i vikendom')}
              </Label>
              <Switch
                id="daily-summary-weekend"
                checked={prefs.daily_summary_weekend_enabled}
                onCheckedChange={setWeekendEnabled}
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-xs h-8 px-3"
              onClick={sendDailySummaryTest}
              disabled={sendingTest || !user}
            >
              <Send className="w-3.5 h-3.5 mr-2" />
              {sendingTest
                ? t('settings.dailySummaryTestSending', 'Šaljem…')
                : t('settings.dailySummaryTestButton', 'Pošalji testnu obavijest')}
            </Button>
          </>
        )}
      </div>

      {!isLocalMode && hasAccess('projects') && (
        <div className="space-y-2">
          <div className="flex items-center justify-between p-3 bg-muted/30 rounded-xl">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <FolderKanban className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0">
                <Label htmlFor="participant-digest" className="text-sm font-medium cursor-pointer">
                  {t('settings.participantDigest', 'Sažetak aktivnosti suradnika')}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t('settings.participantDigestDesc', 'Jedan dnevni sažetak po projektu umjesto svake izmjene zasebno.')}
                </p>
              </div>
            </div>
            <Switch
              id="participant-digest"
              checked={prefs.participant_digest_enabled}
              onCheckedChange={(v) => setFlag('participant_digest_enabled', v)}
            />
          </div>

          {prefs.participant_digest_enabled && (
            <>
              <div className="flex items-center justify-between p-2.5 ml-12 mr-1 bg-muted/20 rounded-lg gap-3">
                <Label htmlFor="participant-digest-hour" className="text-xs font-medium">
                  {t('settings.participantDigestHour', 'Vrijeme slanja')}
                </Label>
                <select
                  id="participant-digest-hour"
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  value={prefs.participant_digest_hour}
                  onChange={(e) => setDigestHour(parseInt(e.target.value, 10))}
                >
                  {[17, 18, 19, 20].map((h) => (
                    <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                  ))}
                </select>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-xs h-8 px-3"
                onClick={sendDigestTest}
                disabled={sendingDigestTest || !user}
              >
                <FolderKanban className="w-3.5 h-3.5 mr-2" />
                {sendingDigestTest
                  ? t('settings.digestTestSending', 'Šaljem sažetak…')
                  : t('settings.digestTestButton', 'Pošalji testni sažetak projekta')}
              </Button>
            </>
          )}
        </div>
      )}






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

      <div className="flex items-center justify-between p-3 bg-muted/30 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <div>
            <Label htmlFor="classic-dashboard" className="text-sm font-medium cursor-pointer">
              {t('settings.classicDashboard', 'Klasični prikaz početne')}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t('settings.classicDashboardDesc', 'Vrati stari raspored s Cashflow, Ciljevima i prečacima na ploči')}
            </p>
          </div>
        </div>
        <Switch
          id="classic-dashboard"
          checked={classicDashboard}
          onCheckedChange={(checked) => {
            onClassicDashboardChange(checked);
            showSuccess(checked
              ? t('settings.classicDashboardEnabled', 'Klasični prikaz uključen')
              : t('settings.classicDashboardDisabled', 'Novi fokusirani prikaz vraćen'));
          }}
        />
      </div>

    </div>
  );
};
