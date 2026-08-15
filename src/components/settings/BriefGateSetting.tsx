/**
 * Korisnikov trajni prekidač za Brief-vrata (lokalno na uređaju).
 */
import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { DoorOpen, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { isUserDisabled, setUserDisabled, resetBriefGateFrequency } from '@/lib/briefGate';
import { BRIEF_GATE_ENABLED } from '@/lib/featureFlags';
import { showSuccess } from '@/hooks/useStatusFeedback';

export const BriefGateSetting = () => {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(() => !isUserDisabled());

  if (!BRIEF_GATE_ENABLED) return null;

  const onChange = (next: boolean) => {
    setEnabled(next);
    setUserDisabled(!next);
  };

  const onShowAgain = () => {
    resetBriefGateFrequency();
    showSuccess(t('briefGate.settings.showAgainDone'));
  };

  return (
    <div className="p-3 bg-muted/30 rounded-xl space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <DoorOpen className="w-4 h-4 text-primary" />
          </div>
          <div>
            <Label htmlFor="brief-gate-toggle" className="text-sm font-medium cursor-pointer">
              {t('briefGate.settings.title')}
            </Label>
            <p className="text-xs text-muted-foreground">{t('briefGate.settings.description')}</p>
          </div>
        </div>
        <Switch id="brief-gate-toggle" checked={enabled} onCheckedChange={onChange} />
      </div>

      {enabled && (
        <button
          type="button"
          data-testid="brief-gate-show-again"
          onClick={onShowAgain}
          className="flex min-h-[44px] w-full items-center gap-2 rounded-lg px-2 text-left text-sm text-primary hover:bg-primary/5"
        >
          <RotateCcw className="w-4 h-4 shrink-0" />
          {t('briefGate.settings.showAgain')}
        </button>
      )}
    </div>
  );
};
