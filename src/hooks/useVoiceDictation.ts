import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Capacitor } from '@capacitor/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import type { PluginListenerHandle } from '@capacitor/core';

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

const isNative = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

const isAndroidApp = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /Android/.test(ua) && (/; wv\)/.test(ua) || /Capacitor/i.test(ua) || (window as any).Capacitor != null);
};

/**
 * Best-effort check if mic permission is actually denied at the OS/browser layer.
 * Web only — native handles its own permission state through SpeechRecognition.
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

export type VoiceErrorKind =
  | null
  | 'permission-denied'
  | 'service-unavailable'
  | 'unsupported'
  | 'unknown';

interface UseVoiceDictationOptions {
  onTranscript: (transcript: string, isFinal: boolean) => void;
}

export interface UseVoiceDictationResult {
  recording: boolean;
  start: () => Promise<void>;
  stop: () => void;
  supported: boolean;
  showPermissionHelp: boolean;
  setShowPermissionHelp: (open: boolean) => void;
  errorKind: VoiceErrorKind;
  setErrorKind: (kind: VoiceErrorKind) => void;
  diagnosticCode: string | null;
  diagnosticMessage: string | null;
  permissionState: 'granted' | 'denied' | 'prompt' | 'unknown';
  isAndroidRuntime: boolean;
  elapsedSec: number;
  continuing: boolean;
}

/**
 * Voice dictation hook with two engines:
 * - Native (Capacitor): @capacitor-community/speech-recognition on Android & iOS
 * - Web: webkitSpeechRecognition on Chrome/Edge/Android Chrome (iOS Safari unsupported)
 *
 * Both branches share the same accumulator/timing/error contract so the UI does
 * not need to know which engine is active.
 */
export const useVoiceDictation = ({ onTranscript }: UseVoiceDictationOptions): UseVoiceDictationResult => {
  const { i18n } = useTranslation();
  const [recording, setRecording] = useState(false);
  const [showPermissionHelp, setShowPermissionHelp] = useState(false);
  const [errorKind, setErrorKind] = useState<VoiceErrorKind>(null);
  const [diagnosticCode, setDiagnosticCode] = useState<string | null>(null);
  const [diagnosticMessage, setDiagnosticMessage] = useState<string | null>(null);
  const [permissionState, setPermissionState] = useState<'granted' | 'denied' | 'prompt' | 'unknown'>('unknown');
  const [elapsedSec, setElapsedSec] = useState(0);
  const [continuing, setContinuing] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const manualStopRef = useRef(false);
  const onTranscriptRef = useRef(onTranscript);

  // Native plugin: partialResults listener handle
  const nativeListenerRef = useRef<PluginListenerHandle | null>(null);
  const nativeActiveRef = useRef(false);

  const accumulatedFinalRef = useRef('');
  const lastInterimRef = useRef('');

  const sessionStartRef = useRef<number>(0);
  const lastResultAtRef = useRef<number>(0);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxSessionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  // Capability check — native is always supported on Capacitor; web requires SR API.
  const supported =
    isNative() ||
    (!isIOS() &&
      typeof window !== 'undefined' &&
      !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition));

  const clearTimers = useCallback(() => {
    if (elapsedTimerRef.current) { clearInterval(elapsedTimerRef.current); elapsedTimerRef.current = null; }
    if (silenceTimerRef.current) { clearInterval(silenceTimerRef.current); silenceTimerRef.current = null; }
    if (maxSessionTimerRef.current) { clearTimeout(maxSessionTimerRef.current); maxSessionTimerRef.current = null; }
  }, []);

  const emitMerged = useCallback((interim: string) => {
    const merged = [accumulatedFinalRef.current.trim(), interim.trim()]
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ');
    onTranscriptRef.current(merged, false);
  }, []);

  const flushInterimToFinal = useCallback(() => {
    if (lastInterimRef.current.trim()) {
      accumulatedFinalRef.current = (accumulatedFinalRef.current + ' ' + lastInterimRef.current)
        .replace(/\s+/g, ' ')
        .trim();
      lastInterimRef.current = '';
      onTranscriptRef.current(accumulatedFinalRef.current, true);
    }
  }, []);

  const stopNative = useCallback(async () => {
    nativeActiveRef.current = false;
    try {
      if (nativeListenerRef.current) {
        await nativeListenerRef.current.remove();
        nativeListenerRef.current = null;
      }
    } catch { /* noop */ }
    try { await SpeechRecognition.stop(); } catch { /* noop */ }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      manualStopRef.current = true;
      clearTimers();
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch { /* noop */ }
      }
      if (nativeActiveRef.current) {
        void stopNative();
      }
    };
  }, [clearTimers, stopNative]);

  const stop = useCallback(() => {
    manualStopRef.current = true;
    clearTimers();
    flushInterimToFinal();
    if (nativeActiveRef.current) {
      void stopNative();
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* noop */ }
    }
    setRecording(false);
    setContinuing(false);
  }, [clearTimers, flushInterimToFinal, stopNative]);

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

  /** Native (Capacitor) start path. Returns true on success, false to fall through to web. */
  const startNative = useCallback(async (lang: string): Promise<boolean> => {
    try {
      const avail = await SpeechRecognition.available();
      if (!avail?.available) {
        setDiagnosticCode('native-unavailable');
        setErrorKind('unsupported');
        setShowPermissionHelp(true);
        return true;
      }

      // Permission gate
      let perm = await SpeechRecognition.checkPermissions();
      if (perm.speechRecognition !== 'granted') {
        const req = await SpeechRecognition.requestPermissions();
        perm = req;
      }
      const permGranted = perm.speechRecognition === 'granted';
      setPermissionState(permGranted ? 'granted' : 'denied');

      if (!permGranted) {
        setDiagnosticCode('native-permission-denied');
        setErrorKind('permission-denied');
        setShowPermissionHelp(true);
        return true;
      }

      // Subscribe to partial results before starting
      const listener = await SpeechRecognition.addListener('partialResults', (data: any) => {
        const matches: string[] = data?.matches || data?.value || [];
        const text = (matches[0] || '').trim();
        if (!text) return;
        lastResultAtRef.current = Date.now();
        setContinuing(false);
        // Native plugin returns the full utterance each event. Treat it as
        // the current interim segment so emitMerged combines with prior
        // accumulated finals across restarts.
        lastInterimRef.current = text;
        emitMerged(text);
      });
      nativeListenerRef.current = listener;
      nativeActiveRef.current = true;

      await SpeechRecognition.start({
        language: lang,
        partialResults: true,
        popup: false,
        maxResults: 1,
      });

      setRecording(true);
      return true;
    } catch (err: any) {
      const msg = err?.message || String(err);
      // eslint-disable-next-line no-console
      console.warn('[voice] native start failed', msg);
      setDiagnosticCode('native-start-failed');
      setDiagnosticMessage(msg);
      // Clean up partially attached listener
      try {
        if (nativeListenerRef.current) {
          await nativeListenerRef.current.remove();
          nativeListenerRef.current = null;
        }
      } catch { /* noop */ }
      nativeActiveRef.current = false;
      setErrorKind('service-unavailable');
      setShowPermissionHelp(true);
      return true;
    }
  }, [emitMerged]);

  const start = useCallback(async () => {
    let permState: 'granted' | 'denied' | 'prompt' | 'unknown' = 'unknown';
    try {
      permState = await queryMicPermission();
      setPermissionState(permState);
      setDiagnosticCode(null);
      setDiagnosticMessage(null);
      // eslint-disable-next-line no-console
      console.info('[voice] start()', {
        supported,
        native: isNative(),
        androidApp: isAndroidApp(),
        permState,
        hasSR: typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition),
      });
    } catch { /* noop */ }

    if (!supported) {
      setDiagnosticCode('unsupported');
      setErrorKind('unsupported');
      setShowPermissionHelp(true);
      return;
    }

    const lang = langForLocale(i18n.language || 'hr');

    accumulatedFinalRef.current = '';
    lastInterimRef.current = '';
    manualStopRef.current = false;
    setErrorKind(null);
    startUITimers();

    // Native path takes priority on Capacitor
    if (isNative()) {
      const handled = await startNative(lang);
      if (handled) {
        // If startNative surfaced an error it already cleaned UI state via dialog;
        // ensure timers don't keep ticking if recording never started.
        if (!nativeActiveRef.current) {
          clearTimers();
          setRecording(false);
        }
        return;
      }
      // fallthrough to web is intentional — should never happen since startNative always handles.
    }

    // Web Speech API path
    const r = getWebRecognition(lang);
    if (!r) {
      clearTimers();
      setDiagnosticCode('missing-recognition-constructor');
      setErrorKind('unsupported');
      setShowPermissionHelp(true);
      return;
    }

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
    r.onerror = async (e: any) => {
      const errType = e?.error || 'unknown';
      const errMessage = e?.message || null;
      try {
        // eslint-disable-next-line no-console
        console.warn('[voice] onerror', {
          errType,
          message: errMessage,
          androidApp: isAndroidApp(),
          ua: typeof navigator !== 'undefined' ? navigator.userAgent : 'n/a',
        });
      } catch { /* noop */ }
      if (errType === 'no-speech' || errType === 'aborted') return;
      manualStopRef.current = true;
      clearTimers();
      setRecording(false);
      setContinuing(false);
      setDiagnosticCode(errType);
      setDiagnosticMessage(errMessage);

      if (errType === 'not-allowed') {
        const nextPermState = await queryMicPermission();
        setPermissionState(nextPermState);
        if (nextPermState === 'denied') {
          setErrorKind('permission-denied');
        } else {
          setErrorKind('service-unavailable');
        }
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
      setDiagnosticCode('start-failed');
      setErrorKind('service-unavailable');
      setShowPermissionHelp(true);
    }
  }, [supported, i18n.language, clearTimers, emitMerged, flushInterimToFinal, startUITimers, startNative]);

  return {
    recording,
    start,
    stop,
    supported,
    showPermissionHelp,
    setShowPermissionHelp,
    errorKind,
    setErrorKind,
    diagnosticCode,
    diagnosticMessage,
    permissionState,
    isAndroidRuntime: isAndroidApp(),
    elapsedSec,
    continuing,
  };
};
