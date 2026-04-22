import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onstart: (() => void) | null;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

const isIOS = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
};

const isAndroidApp = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // Android WebView: typically contains "; wv)" or our Capacitor scheme
  return /Android/.test(ua) && (/; wv\)/.test(ua) || /Capacitor/i.test(ua) || (window as any).Capacitor != null);
};

/**
 * Best-effort check if mic permission is actually denied at the OS/browser layer.
 * Returns:
 *  - 'granted' | 'denied' | 'prompt' when known
 *  - 'unknown' when Permissions API doesn't expose microphone (e.g. Android WebView)
 */
const queryMicPermission = async (): Promise<'granted' | 'denied' | 'prompt' | 'unknown'> => {
  try {
    const perms: any = (navigator as any).permissions;
    if (!perms?.query) return 'unknown';
    const status = await perms.query({ name: 'microphone' as PermissionName });
    return (status?.state as 'granted' | 'denied' | 'prompt') || 'unknown';
  } catch {
    return 'unknown';
  }
};

const getWebRecognition = (lang: string): SpeechRecognitionLike | null => {
  if (typeof window === 'undefined') return null;
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SR) return null;
  const r: SpeechRecognitionLike = new SR();
  r.lang = lang;
  r.interimResults = true;
  r.continuous = true;
  return r;
};

const langForLocale = (lang: string): string => {
  if (lang.startsWith('en')) return 'en-US';
  if (lang.startsWith('de')) return 'de-DE';
  return 'hr-HR';
};

/** Maximum total recording session length (ms) before auto-stop. */
const MAX_SESSION_MS = 30_000;
/** If silence (no speech result) lasts longer than this (ms), treat as user paused. */
const SILENCE_HINT_MS = 2_000;

/** Distinct error categories surfaced to the UI so we never lie to the user about mic permissions. */
export type VoiceErrorKind =
  | null
  | 'permission-denied'   // user/system actually blocked mic access
  | 'service-unavailable' // engine failed to start (network, Google service, WebView)
  | 'unsupported'         // no engine available in this build/runtime
  | 'unknown';            // anything else

interface UseVoiceDictationOptions {
  /** Called whenever a transcript update arrives. Should typically append the transcript to existing field value. */
  onTranscript: (transcript: string, isFinal: boolean) => void;
}

export interface UseVoiceDictationResult {
  recording: boolean;
  start: () => Promise<void>;
  stop: () => void;
  /** True if voice input is supported on this platform/browser. */
  supported: boolean;
  showPermissionHelp: boolean;
  setShowPermissionHelp: (open: boolean) => void;
  /** Detailed last error category (drives which dialog/text the UI shows). */
  errorKind: VoiceErrorKind;
  setErrorKind: (kind: VoiceErrorKind) => void;
  /** Elapsed seconds of current recording session. */
  elapsedSec: number;
  /** True when recognizer paused listening but we are auto-restarting (user can keep speaking). */
  continuing: boolean;
}

/**
 * Voice dictation hook using the Web Speech API (`webkitSpeechRecognition`).
 *
 * Works in browsers (Chrome/Edge/Android Chrome) and inside Android WebView
 * shells that proxy `getUserMedia` to the system mic. iOS Safari is not
 * supported by Apple. We do NOT use `@capacitor-community/speech-recognition`
 * here because the currently installed APK does not include that native plugin.
 *
 * Robustness features:
 * - Auto-restart on `onend` to keep the session alive across short pauses.
 * - Cross-cycle accumulator so text is never lost across restarts.
 * - Distinct error categories — never falsely claim the mic is blocked
 *   when the real failure is engine/service related.
 */
export const useVoiceDictation = ({ onTranscript }: UseVoiceDictationOptions): UseVoiceDictationResult => {
  const { i18n } = useTranslation();
  const [recording, setRecording] = useState(false);
  const [showPermissionHelp, setShowPermissionHelp] = useState(false);
  const [errorKind, setErrorKind] = useState<VoiceErrorKind>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [continuing, setContinuing] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const manualStopRef = useRef(false);
  const onTranscriptRef = useRef(onTranscript);

  // Cross-cycle accumulator: holds all final text recognized in this session.
  const accumulatedFinalRef = useRef('');
  // Last interim transcript from current recognizer cycle.
  const lastInterimRef = useRef('');

  // Session timing
  const sessionStartRef = useRef<number>(0);
  const lastResultAtRef = useRef<number>(0);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxSessionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep latest callback without re-creating start/stop
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  const supported =
    !isIOS() &&
    typeof window !== 'undefined' &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  const clearTimers = useCallback(() => {
    if (elapsedTimerRef.current) { clearInterval(elapsedTimerRef.current); elapsedTimerRef.current = null; }
    if (silenceTimerRef.current) { clearInterval(silenceTimerRef.current); silenceTimerRef.current = null; }
    if (maxSessionTimerRef.current) { clearTimeout(maxSessionTimerRef.current); maxSessionTimerRef.current = null; }
  }, []);

  /** Build merged transcript from accumulated final + current interim, and emit. */
  const emitMerged = useCallback((interim: string) => {
    const merged = [accumulatedFinalRef.current.trim(), interim.trim()]
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ');
    onTranscriptRef.current(merged, false);
  }, []);

  /** Promote any pending interim text into the final accumulator (used before restart). */
  const flushInterimToFinal = useCallback(() => {
    if (lastInterimRef.current.trim()) {
      accumulatedFinalRef.current = (accumulatedFinalRef.current + ' ' + lastInterimRef.current)
        .replace(/\s+/g, ' ')
        .trim();
      lastInterimRef.current = '';
      onTranscriptRef.current(accumulatedFinalRef.current, true);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      manualStopRef.current = true;
      clearTimers();
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch { /* noop */ }
      }
    };
  }, [clearTimers]);

  const stop = useCallback(() => {
    manualStopRef.current = true;
    clearTimers();
    flushInterimToFinal();
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* noop */ }
    }
    setRecording(false);
    setContinuing(false);
  }, [clearTimers, flushInterimToFinal]);

  const startUITimers = useCallback(() => {
    clearTimers();
    sessionStartRef.current = Date.now();
    lastResultAtRef.current = Date.now();
    setElapsedSec(0);
    setContinuing(false);
    elapsedTimerRef.current = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - sessionStartRef.current) / 1000));
    }, 250);
    silenceTimerRef.current = setInterval(() => {
      const sinceLast = Date.now() - lastResultAtRef.current;
      setContinuing(sinceLast > SILENCE_HINT_MS);
    }, 300);
    maxSessionTimerRef.current = setTimeout(() => { stop(); }, MAX_SESSION_MS);
  }, [clearTimers, stop]);

  const start = useCallback(async () => {
    if (!supported) {
      setErrorKind('unsupported');
      setShowPermissionHelp(true);
      return;
    }

    const lang = langForLocale(i18n.language || 'hr');
    const r = getWebRecognition(lang);
    if (!r) {
      setErrorKind('unsupported');
      setShowPermissionHelp(true);
      return;
    }

    accumulatedFinalRef.current = '';
    lastInterimRef.current = '';
    manualStopRef.current = false;
    setErrorKind(null);
    startUITimers();

    r.onstart = () => setRecording(true);
    r.onresult = (e: any) => {
      lastResultAtRef.current = Date.now();
      setContinuing(false);
      let interimThisEvent = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const s = e.results[i];
        const transcript = s[0]?.transcript || '';
        if (!transcript) continue;
        if (s.isFinal) {
          accumulatedFinalRef.current = (accumulatedFinalRef.current + ' ' + transcript)
            .replace(/\s+/g, ' ')
            .trim();
        } else {
          interimThisEvent = (interimThisEvent + ' ' + transcript).replace(/\s+/g, ' ').trim();
        }
      }
      lastInterimRef.current = interimThisEvent;
      if (interimThisEvent) {
        emitMerged(interimThisEvent);
      } else {
        onTranscriptRef.current(accumulatedFinalRef.current, true);
      }
    };
    r.onerror = (e: any) => {
      const errType = e?.error || 'unknown';
      if (errType === 'no-speech' || errType === 'aborted') return;
      manualStopRef.current = true;
      clearTimers();
      setRecording(false);
      setContinuing(false);
      // Only treat 'not-allowed' as a real permission denial.
      // 'service-not-allowed' / 'network' / 'audio-capture' = engine/service problem,
      // not a user permission issue — show different message.
      if (errType === 'not-allowed') {
        setErrorKind('permission-denied');
      } else if (
        errType === 'service-not-allowed' ||
        errType === 'network' ||
        errType === 'audio-capture'
      ) {
        setErrorKind('service-unavailable');
      } else {
        setErrorKind('unknown');
      }
      setShowPermissionHelp(true);
    };
    r.onend = () => {
      if (!manualStopRef.current) {
        flushInterimToFinal();
        if (Date.now() - sessionStartRef.current >= MAX_SESSION_MS) {
          clearTimers();
          setRecording(false);
          setContinuing(false);
          return;
        }
        try { r.start(); return; } catch { /* fall through */ }
      }
      clearTimers();
      setRecording(false);
      setContinuing(false);
    };

    try {
      r.start();
      recognitionRef.current = r;
    } catch {
      clearTimers();
      setRecording(false);
      setErrorKind('service-unavailable');
      setShowPermissionHelp(true);
    }
  }, [supported, i18n.language, clearTimers, emitMerged, flushInterimToFinal, startUITimers]);

  return {
    recording,
    start,
    stop,
    supported,
    showPermissionHelp,
    setShowPermissionHelp,
    errorKind,
    setErrorKind,
    elapsedSec,
    continuing,
  };
};
