import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Settings, Zap, RefreshCw, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { 
  getAutoUpdatePreference, 
  setAutoUpdatePreference,
  checkForUpdates 
} from '@/components/PWAUpdatePrompt';

export const SettingsDialog = () => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [autoUpdate, setAutoUpdate] = useState(false);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);

  useEffect(() => {
    if (open) {
      setAutoUpdate(getAutoUpdatePreference());
    }
  }, [open]);

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

  return (
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

        <div className="space-y-6 py-4">
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

          {/* App Info */}
          <div className="text-center text-xs text-muted-foreground space-y-1">
            <p>V&M Balance</p>
            <p>Verzija 1.0.0</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
