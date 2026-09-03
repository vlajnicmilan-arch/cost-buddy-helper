import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Building2, Bot } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppState } from '@/contexts/AppStateContext';
import { useBusinessFeature } from '@/hooks/useBusinessFeature';
import { showSuccess } from '@/hooks/useStatusFeedback';

interface ModulesSectionProps {
  /** Otvara BusinessProfileDialog (Tvrtke) iz parenta. */
  onShowBusinessProfile: () => void;
  /** Lokalni način nema cloud-vezane module — kompletno se sakriva. */
  isLocalMode: boolean;
}

/**
 * Settings → Asistent
 *
 * Prekidači modula su ukinuti: svi moduli su uvijek vidljivi u navigaciji, a
 * pristup određuje isključivo pretplata/probno razdoblje (prodajni dijalog).
 * Ovdje ostaje samo AI asistent (nije modul, nema pretplatu) i ulaz u Tvrtke
 * za korisnike koji stvarno imaju pravo na poslovni modul.
 */
export const ModulesSection = ({
  onShowBusinessProfile,
  isLocalMode,
}: ModulesSectionProps) => {
  const { t } = useTranslation();
  const { aiAssistantEnabled, setAiAssistantEnabled } = useAppState();
  const businessFeatureEnabled = useBusinessFeature();

  if (isLocalMode) return null;

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          {t('settings.modules.assistantTitle', 'Asistent')}
        </h3>
        <p className="text-xs text-muted-foreground">
          {t(
            'settings.modules.assistantSubtitle',
            'Uključi ili isključi AI asistenta. Ne utječe na pretplatu.'
          )}
        </p>
      </div>

      <div className="flex items-start justify-between gap-3 p-3 bg-muted/30 rounded-xl">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Bot className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <Label htmlFor="module-ai" className="text-sm font-medium cursor-pointer">
              {t('settings.aiAssistant', 'AI Asistent')}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t('settings.aiAssistantDesc', 'Prikaži AI savjete i asistenta')}
            </p>
          </div>
        </div>
        <Switch
          id="module-ai"
          checked={aiAssistantEnabled}
          onCheckedChange={(checked) => {
            setAiAssistantEnabled(checked);
            showSuccess(
              checked
                ? t('settings.aiEnabled', 'AI asistent uključen')
                : t('settings.aiDisabled', 'AI asistent isključen')
            );
          }}
        />
      </div>

      {/* Tvrtke — samo za korisnike s pravom na poslovni modul. */}
      {businessFeatureEnabled && (
        <div className="flex items-start justify-between gap-3 p-3 bg-muted/30 rounded-xl">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Building2 className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <Label className="text-sm font-medium">
                {t('business.companies', 'Tvrtke')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('settings.modules.business.description', 'Poslovna terminologija i profili tvrtki')}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 w-full"
                onClick={onShowBusinessProfile}
              >
                <Building2 className="w-4 h-4 mr-2" />
                {t('business.companies', 'Tvrtke')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
