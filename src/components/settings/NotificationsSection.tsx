import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Volume2, Bell, Bot, Sparkles, Users, Building2, Lock, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';

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
