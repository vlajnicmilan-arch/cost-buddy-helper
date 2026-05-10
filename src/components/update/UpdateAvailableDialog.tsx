import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useTranslation } from 'react-i18next';
import { Download, Loader2, ShieldCheck, AlertTriangle } from 'lucide-react';
import { downloadAndInstallApk } from './apkInstaller';
import { logUpdateEvent } from '@/lib/updateTelemetry';
import { showError } from '@/hooks/useStatusFeedback';
import { tr } from '@/lib/errorMessages';

interface UpdateAvailableDialogProps {
  open: boolean;
  remoteVersion: string;
  currentVersion: string;
  apkUrl: string | null;
  sha256: string | null;
  forced: boolean;
  isNative: boolean;
  onDismiss: () => void;
}

export const UpdateAvailableDialog = ({
  open,
  remoteVersion,
  currentVersion,
  apkUrl,
  sha256,
  forced,
  isNative,
  onDismiss,
}: UpdateAvailableDialogProps) => {
  const { t } = useTranslation();
  const [progress, setProgress] = useState<number | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (open) {
      logUpdateEvent('update_dialog_shown', {
        remoteVersion,
        currentVersion,
        forced,
        isNative,
      });
    }
  }, [open, remoteVersion, currentVersion, forced, isNative]);

  const handleAccept = async () => {
    logUpdateEvent('update_user_accepted', { remoteVersion, forced });

    if (!isNative) {
      // Web/PWA: hard reload picks up the new bundle
      window.location.reload();
      return;
    }

    if (!apkUrl) {
      showError(tr('errors.appUpdate.noApkUrl', 'URL APK datoteke nije dostupan.'));
      return;
    }

    setInstalling(true);
    setProgress(0);

    const result = await downloadAndInstallApk(apkUrl, sha256, (pct) => setProgress(pct));

    setInstalling(false);

    if (!result.success) {
      setProgress(null);
      const msg = tr(result.errorKey ?? 'errors.appUpdate.downloadFailed', 'Ažuriranje nije uspjelo.');
      showError(result.errorDetail ? `${msg} (${result.errorDetail})` : msg);
    }
    // On success the Android installer takes over — dialog stays open
    // until the user comes back; closing it now would be confusing.
  };

  const handleLater = () => {
    logUpdateEvent('update_user_declined', { remoteVersion });
    onDismiss();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // In forced mode, ignore close attempts
        if (forced) return;
        if (!next && !installing) onDismiss();
      }}
    >
      <DialogContent
        className="z-[60] max-w-md"
        onEscapeKeyDown={(e) => {
          if (forced || installing) e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          if (forced || installing) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {forced ? (
              <AlertTriangle className="w-5 h-5 text-destructive" />
            ) : (
              <Download className="w-5 h-5 text-primary" />
            )}
            {forced ? t('update.forcedTitle') : t('update.available')}
          </DialogTitle>
          <DialogDescription className="space-y-2 pt-2">
            <span className="block">
              {t('update.versionLine', { remote: remoteVersion, current: currentVersion })}
            </span>
            <span className="block text-xs text-muted-foreground">
              {forced ? t('update.forcedDescription') : t('update.description')}
            </span>
            {sha256 && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
                <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                {t('update.checksumProtected')}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {progress !== null && (
          <div className="space-y-2 py-2">
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-muted-foreground text-center">
              {installing
                ? t('update.downloading', { pct: progress })
                : t('update.downloadComplete')}
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2 flex-col sm:flex-row">
          {!forced && (
            <Button
              variant="ghost"
              onClick={handleLater}
              disabled={installing}
              className="min-h-[44px]"
            >
              {t('update.later')}
            </Button>
          )}
          <Button
            onClick={handleAccept}
            disabled={installing}
            className="min-h-[44px]"
          >
            {installing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t('update.installing')}
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                {t('update.updateNow')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
