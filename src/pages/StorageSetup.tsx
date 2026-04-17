import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Cloud,
  HardDrive,
  Loader2,
  Lock,
  Smartphone,
  type LucideIcon,
} from 'lucide-react';
import { useStorage } from '@/contexts/StorageContext';
import { STORAGE_OPTIONS, StorageMode } from '@/lib/storage/types';
import { cn } from '@/lib/utils';
import { initLocalDB } from '@/lib/storage/indexedDB';
import logo from '@/assets/logo.webp';
import { useTranslation } from 'react-i18next';
import { logDiagnostic } from '@/lib/diagnosticLogger';

const storageOptionIcons: Record<StorageMode, LucideIcon> = {
  local: Smartphone,
  cloud: Cloud,
  'google-drive': HardDrive,
  icloud: Cloud,
};

const storageOptionCopy: Record<
  StorageMode,
  {
    titleKey: string;
    descriptionKey: string;
  }
> = {
  local: {
    titleKey: 'storage.localTitle',
    descriptionKey: 'storage.localDescription',
  },
  cloud: {
    titleKey: 'storage.cloudTitle',
    descriptionKey: 'storage.cloudDescription',
  },
  'google-drive': {
    titleKey: 'storage.googleDriveTitle',
    descriptionKey: 'storage.googleDriveDescription',
  },
  icloud: {
    titleKey: 'storage.icloudTitle',
    descriptionKey: 'storage.icloudDescription',
  },
};

const StorageSetup = () => {
  const navigate = useNavigate();
  const { storageMode: currentMode, setStorageMode } = useStorage();
  const { t } = useTranslation();
  const [loadingMode, setLoadingMode] = useState<StorageMode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isChangingMode = !!currentMode;

  // Diagnostic instrumentation: confirm the screen mounted and capture
  // every pointer/touch event reaching the React layer. If we never see
  // pointer events here on the APK, something native is intercepting them.
  useEffect(() => {
    logDiagnostic('storage_setup_mounted', { isChangingMode });

    const onPointer = (e: PointerEvent) => {
      logDiagnostic('pointer_received', {
        type: e.type,
        x: Math.round(e.clientX),
        y: Math.round(e.clientY),
        target: (e.target as HTMLElement)?.tagName,
        pointerType: e.pointerType,
      });
    };
    const onTouch = (e: TouchEvent) => {
      logDiagnostic('touch_received', {
        type: e.type,
        touches: e.touches.length,
      });
    };

    window.addEventListener('pointerdown', onPointer, { passive: true });
    window.addEventListener('touchstart', onTouch, { passive: true });

    return () => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('touchstart', onTouch);
      logDiagnostic('storage_setup_unmounted');
    };
  }, [isChangingMode]);

  const handleGoBack = () => {
    if (isChangingMode) {
      navigate('/home');
    } else {
      navigate(-1);
    }
  };

  const handleModeSelection = async (mode: StorageMode, available: boolean) => {
    logDiagnostic('storage_option_clicked', {
      mode,
      available,
      currentlyLoading: loadingMode,
      currentMode,
    });

    if (!available || loadingMode || currentMode === mode) {
      logDiagnostic('storage_option_blocked', {
        mode,
        reason: !available ? 'not_available' : loadingMode ? 'already_loading' : 'same_mode',
      });
      return;
    }

    setError(null);
    setLoadingMode(mode);

    try {
      if (mode === 'local') {
        logDiagnostic('storage_init_start', { mode });
        await initLocalDB();
        logDiagnostic('storage_init_success', { mode });
        setStorageMode('local');
        navigate('/app');
        return;
      }

      if (mode === 'cloud') {
        logDiagnostic('storage_init_start', { mode });
        setStorageMode('cloud');
        logDiagnostic('storage_init_success', { mode });
        navigate('/auth');
        return;
      }

      setStorageMode(mode);
      navigate('/app');
    } catch (caughtError) {
      console.error('[StorageSetup] Error setting up storage:', caughtError);
      logDiagnostic('storage_init_error', {
        mode,
        message: (caughtError as Error)?.message,
      });
      setError(t('storage.localInitError'));
    } finally {
      setLoadingMode(null);
    }
  };

  return (
    <div className="min-h-dvh bg-background safe-area-top safe-area-bottom">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-10 pt-6">
          {isChangingMode && (
            <button
              type="button"
              onClick={handleGoBack}
              className="mb-4 flex h-11 items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="text-sm">{t('storage.back', 'Natrag')}</span>
            </button>
          )}

          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 w-16 h-16">
              <img src={logo} alt="V&M Balance" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">V&M Balance</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {isChangingMode
                ? t('storage.changeMode', 'Promijeni način pohrane podataka')
                : t('storage.whereToStore', 'Gdje želiš spremati svoje podatke?')}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {t('storage.tapOption')}
            </p>
          </div>

          <div className="space-y-3">
            {STORAGE_OPTIONS.map((option) => (
              (() => {
                const Icon = storageOptionIcons[option.id];
                const copy = storageOptionCopy[option.id];
                const isCurrent = currentMode === option.id;
                const isLoading = loadingMode === option.id;
                const isDisabled = Boolean(loadingMode) || !option.available || isCurrent;

                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => void handleModeSelection(option.id, option.available)}
                    disabled={isDisabled}
                    aria-label={t(copy.titleKey)}
                    className={cn(
                      'w-full rounded-3xl border p-4 text-left transition-all',
                      option.available
                        ? 'border-border bg-card hover:border-primary/40 hover:bg-muted/40'
                        : 'border-border/60 bg-muted/20 opacity-60',
                      isCurrent && 'border-primary/50 bg-primary/5',
                      isDisabled && !isCurrent && option.available && 'opacity-70'
                    )}
                  >
                    <div className="flex items-start gap-4">
                      <div
                        className={cn(
                          'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border bg-background',
                          isCurrent ? 'border-primary/40 text-primary' : 'border-border text-muted-foreground'
                        )}
                      >
                        <Icon className="h-5 w-5" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">
                            {t(copy.titleKey)}
                          </span>

                          {isCurrent && (
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                              {t('storage.current')}
                            </span>
                          )}

                          {!option.available && option.comingSoon && (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                              {t('storage.comingSoon', 'Uskoro')}
                            </span>
                          )}
                        </div>

                        <p className="mt-1 text-xs leading-snug text-muted-foreground">
                          {t(copy.descriptionKey)}
                        </p>
                      </div>

                      <div className="flex h-10 w-10 shrink-0 items-center justify-center">
                        {isLoading ? (
                          <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        ) : isCurrent ? (
                          <CheckCircle2 className="h-5 w-5 text-primary" />
                        ) : option.available ? (
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })()
            ))}
          </div>

          <div className="mt-4 flex items-start gap-2.5 rounded-2xl bg-muted/30 p-3">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-[11px] text-muted-foreground leading-snug">
              {t('storage.privacyNotice', 'Tvoji financijski podaci su privatni. Lokalna pohrana nikad ne napušta tvoj uređaj. Cloud opcije koriste enkripciju za zaštitu podataka.')}
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="mt-4 rounded-2xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive"
            >
              {error}
            </div>
          )}

          {isChangingMode && (
            <button
              type="button"
              onClick={handleGoBack}
              className="mt-4 h-11 w-full rounded-xl border border-border bg-background text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              {t('common.cancel', 'Odustani')}
            </button>
          )}
      </div>
    </div>
  );
};

export default StorageSetup;
