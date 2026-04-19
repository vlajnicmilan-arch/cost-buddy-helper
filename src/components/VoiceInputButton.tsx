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
  // Buffer holds the value at start-of-recording so partial results can be
  // appended on top without losing typed text.
  const baseValueRef = useRef('');
  // Final-segment text accumulated within current recording session
  const finalChunksRef = useRef('');

  const handleTranscript = useCallback((transcript: string, isFinal: boolean) => {
    if (isFinal) {
      finalChunksRef.current = (finalChunksRef.current + ' ' + transcript).replace(/\s+/g, ' ').trim();
      const merged = [baseValueRef.current.trim(), finalChunksRef.current].filter(Boolean).join(' ');
      onChange(merged);
    } else {
      // partial / interim: replace from base + final + interim
      const merged = [baseValueRef.current.trim(), finalChunksRef.current, transcript]
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ');
      onChange(merged);
    }
  }, [onChange]);

  const { recording, start, stop, supported, showPermissionHelp, setShowPermissionHelp } =
    useVoiceDictation({ onTranscript: handleTranscript });

  if (!supported) return null;

  const handleClick = () => {
    if (recording) {
      stop();
      return;
    }
    baseValueRef.current = value || '';
    finalChunksRef.current = '';
    void start();
  };

  const sizeClasses = size === 'md' ? 'h-11 w-11' : 'h-8 w-8';

  return (
    <>
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
          recording && 'shadow-lg shadow-destructive/30',
          className
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

      <AlertDialog open={showPermissionHelp} onOpenChange={setShowPermissionHelp}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('voice.permissionTitle', 'Dopustite pristup mikrofonu')}
            </AlertDialogTitle>
            <AlertDialogDescription>
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
