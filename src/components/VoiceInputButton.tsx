import { useCallback, useRef } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useVoiceDictation } from '@/hooks/useVoiceDictation';

interface VoiceInputButtonProps {
  /** Current text value */
  value: string;
  /** Called with the new text after appending the dictated transcript */
  onChange: (next: string) => void;
  disabled?: boolean;
  className?: string;
  /** Optional size for the icon button. Default: small (32px). */
  size?: 'sm' | 'md';
}

const formatMMSS = (totalSec: number): string => {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

/**
 * Microphone button that dictates speech into a text field.
 * Hidden when voice input is unsupported (e.g. iOS Safari, Firefox).
 *
 * Typical usage — wrap parent in `relative` and place button absolutely:
 * ```tsx
 * <div className="relative">
 *   <Textarea value={x} onChange={...} className="pr-12" />
 *   <VoiceInputButton value={x} onChange={setX} className="absolute bottom-2 right-2" />
 * </div>
 * ```
 */
export const VoiceInputButton = ({
  value,
  onChange,
  disabled,
  className,
  size = 'sm',
}: VoiceInputButtonProps) => {
  const { t } = useTranslation();
  // Buffer holds the value that existed BEFORE recording started.
  // The hook gives us the full session transcript on every update,
  // which we append after this base text.
  const baseValueRef = useRef('');

  const handleTranscript = useCallback((transcript: string) => {
    const merged = [baseValueRef.current.trim(), transcript.trim()]
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ');
    onChange(merged);
  }, [onChange]);

  const {
    recording,
    start,
    stop,
    supported,
    showPermissionHelp,
    setShowPermissionHelp,
    elapsedSec,
    continuing,
    errorKind,
  } = useVoiceDictation({ onTranscript: handleTranscript });

  // Pick the right title/body based on what actually went wrong.
  const dialogTitleKey =
    errorKind === 'unsupported'
      ? 'voice.unsupportedTitle'
      : errorKind === 'service-unavailable'
      ? 'voice.serviceTitle'
      : 'voice.permissionTitle';
  const dialogTitleFallback =
    errorKind === 'unsupported'
      ? 'Glasovni unos nije dostupan'
      : errorKind === 'service-unavailable'
      ? 'Diktiranje trenutno nije dostupno'
      : 'Dopustite pristup mikrofonu';
  const dialogBodyKey =
    errorKind === 'unsupported'
      ? 'voice.unsupportedBody'
      : errorKind === 'service-unavailable'
      ? 'voice.serviceBody'
      : 'voice.permissionBody';
  const dialogBodyFallback =
    errorKind === 'unsupported'
      ? 'Vaša verzija aplikacije ili preglednika ne podržava glasovni unos. Molimo upišite tekst rukom.'
      : errorKind === 'service-unavailable'
      ? 'Servis za prepoznavanje govora se ne može pokrenuti. Provjerite internetsku vezu i pokušajte ponovno. Ako i dalje ne radi, otvorite aplikaciju u Chrome pregledniku.'
      : 'Za diktiranje teksta potreban je pristup mikrofonu. Otvorite postavke uređaja ili preglednika i dopustite pristup mikrofonu za ovu aplikaciju.';

  if (!supported) return null;

  const handleClick = () => {
    if (recording) {
      stop();
      return;
    }
    baseValueRef.current = value || '';
    void start();
  };

  const sizeClasses = size === 'md' ? 'h-11 w-11' : 'h-8 w-8';

  return (
    <>
      <div className={cn('flex flex-col items-end gap-1', className)}>
        <Button
          type="button"
          variant={recording ? 'destructive' : 'ghost'}
          size="icon"
          disabled={disabled}
          onClick={handleClick}
          aria-label={recording ? t('voice.stop', 'Zaustavi snimanje') : t('voice.start', 'Diktiraj')}
          title={recording ? t('voice.recording', 'Snimanje...') : t('voice.start', 'Diktiraj')}
          className={cn(
            sizeClasses,
            'rounded-full shrink-0 relative',
            recording && 'shadow-lg shadow-destructive/30'
          )}
        >
          {recording ? (
            <>
              <MicOff className="w-4 h-4" />
              <span
                className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-destructive border-2 border-background animate-pulse"
                aria-hidden
              />
            </>
          ) : (
            <Mic className="w-4 h-4" />
          )}
        </Button>

        {recording && (
          <div className="flex flex-col items-end gap-0.5 pointer-events-none">
            <span className="text-[10px] font-mono tabular-nums text-destructive font-semibold">
              {formatMMSS(elapsedSec)}
            </span>
            {continuing && (
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                {t('voice.continuing', 'Slušam... nastavi govoriti')}
              </span>
            )}
          </div>
        )}
      </div>

      <AlertDialog open={showPermissionHelp} onOpenChange={setShowPermissionHelp}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('voice.permissionTitle', 'Dopustite pristup mikrofonu')}
            </AlertDialogTitle>
            <AlertDialogDescription className="whitespace-pre-line">
              {t(
                'voice.permissionBody',
                'Za diktiranje teksta potreban je pristup mikrofonu. Otvorite postavke uređaja ili preglednika i dopustite pristup mikrofonu za ovu aplikaciju.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>{t('common.ok', 'U redu')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
