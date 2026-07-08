import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Lock, RefreshCw, Fingerprint, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { showSuccess } from '@/hooks/useStatusFeedback';

interface SecuritySectionProps {
  appLock: {
    hasPinSet: boolean;
    isLockEnabled: boolean;
    enableLock: (v: boolean) => void;
    lockTimeout: number;
    setLockTimeout: (v: number) => void;
    biometricAvailable: boolean;
    biometricEnabled: boolean;
    setBiometricEnabled: (v: boolean) => void;
    biometricType: string;
    removePin: () => Promise<void>;
  };
  onShowSetPin: () => void;
}

export const SecuritySection = ({ appLock, onShowSetPin }: SecuritySectionProps) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        {t('settings.security')}
      </h3>
      
      <div className="flex items-center justify-between p-3 bg-muted/30 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Lock className="w-4 h-4 text-primary" />
          </div>
          <div>
            <Label className="text-sm font-medium">
              {t('lock.pinLock', 'PIN zaključavanje')}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t('lock.pinLockDesc', 'Zaključaj aplikaciju nakon neaktivnosti')}
            </p>
          </div>
        </div>
        {appLock.hasPinSet ? (
          <Switch
            checked={appLock.isLockEnabled}
            onCheckedChange={(checked) => appLock.enableLock(checked)}
          />
        ) : (
          <Button variant="outline" size="sm" className="rounded-xl text-xs" onClick={onShowSetPin}>
            {t('lock.setPin', 'Postavi PIN')}
          </Button>
        )}
      </div>

      {appLock.hasPinSet && (
        <>
          <div className="flex items-center justify-between p-3 bg-muted/30 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <RefreshCw className="w-4 h-4 text-primary" />
              </div>
              <div>
                <Label className="text-sm font-medium">
                  {t('lock.timeout', 'Zaključaj nakon')}
                </Label>
              </div>
            </div>
            <Select
              value={String(appLock.lockTimeout)}
              onValueChange={(v) => appLock.setLockTimeout(Number(v) as any)}
            >
              <SelectTrigger className="w-[110px] rounded-xl text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">{t('lock.immediately', 'Odmah')}</SelectItem>
                <SelectItem value="30">30 {t('lock.seconds', 'sek')}</SelectItem>
                <SelectItem value="60">1 min</SelectItem>
                <SelectItem value="120">2 min</SelectItem>
                <SelectItem value="300">5 min</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {appLock.biometricAvailable && (
            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Fingerprint className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <Label className="text-sm font-medium">
                    {appLock.biometricType === 'face'
                      ? t('lock.faceId', 'Prepoznavanje lica')
                      : t('lock.fingerprint')}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t('lock.biometricDesc', 'Otključaj biometrijom')}
                  </p>
                </div>
              </div>
              <Switch
                checked={appLock.biometricEnabled}
                onCheckedChange={(checked) => appLock.setBiometricEnabled(checked)}
              />
            </div>
          )}

          <Button variant="outline" className="w-full gap-2 rounded-xl" onClick={onShowSetPin}>
            <Lock className="w-4 h-4" />
            {t('lock.changePin', 'Promijeni PIN')}
          </Button>

          <Button
            variant="ghost"
            className="w-full gap-2 rounded-xl text-destructive hover:text-destructive"
            onClick={async () => {
              await appLock.removePin();
              showSuccess(t('lock.pinRemoved', 'PIN je uklonjen'));
            }}
          >
            <Trash2 className="w-4 h-4" />
            {t('lock.removePin', 'Ukloni PIN')}
          </Button>
        </>
      )}
    </div>
  );
};
