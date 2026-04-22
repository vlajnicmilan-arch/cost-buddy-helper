import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Capacitor } from '@capacitor/core';

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
  /** Which engine will (or did) handle this session — 'native' on Android app, 'web' in browser. */
  engine: 'native' | 'web' | 'none';
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
 * Voice dictation hook with TWO engines:
 *
 * - **Native (Android Capacitor app)** — uses `@capacitor-community/speech-recognition`,
 *   which talks to the Android system speech service directly (not via WebView mic).
 *   Avoids the WebView's notorious auto-rejection of `getUserMedia()`.
 * - **Web (browsers)** — uses Web Speech API (`webkitSpeechRecognition`).
 *
 * Error model deliberately distinguishes between *real* permission failures and
 * engine/service failures so the UI never falsely claims the mic is blocked.
 *
 * Note: web engine requires an internet connection (audio streams to Google).
 */
export const useVoiceDictation = ({ onTranscript }: UseVoiceDictationOptions): UseVoiceDictationResult => {
  const { i18n } = useTranslation();
  const [recording, setRecording] = useState(false);
  const [showPermissionHelp, setShowPermissionHelp] = useState(false);
  const [errorKind, setErrorKind] = useState<VoiceErrorKind>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [continuing, setContinuing] = useState(false);
  const [nativePluginAvailable, setNativePluginAvailable] = useState<boolean | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const manualStopRef = useRef(false);
  const onTranscriptRef = useRef(onTranscript);
  const nativeListenerRef = useRef<{ remove: () => void } | null>(null);

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

  const isNativeAndroid =
    typeof Capacitor !== 'undefined' &&
    Capacitor.isNativePlatform?.() &&
    Capacitor.getPlatform?.() === 'android';

  // Probe native plugin availability once.
  useEffect(() => {
    let cancelled = false;
    if (!isNativeAndroid) {
      setNativePluginAvailable(false);
      return () => { cancelled = true; };
    }
    (async () => {
      try {
        const mod = await import('@capacitor-community/speech-recognition');
        const SpeechRecognition = (mod as any).SpeechRecognition;
        if (!SpeechRecognition) throw new Error('plugin-missing');
        const avail = await SpeechRecognition.available?.();
        if (cancelled) return;
        setNativePluginAvailable(!!(avail?.available ?? true));
      } catch {
        if (!cancelled) setNativePluginAvailable(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isNativeAndroid]);

  const hasWebEngine =
    !isIOS() &&
    typeof window !== 'undefined' &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  // Native engine (when available) wins on Android app; else fall back to web in browsers.
  const engine: 'native' | 'web' | 'none' =
    isNativeAndroid && nativePluginAvailable
      ? 'native'
      : hasWebEngine
      ? 'web'
      : 'none';

  // While probing the native plugin we still consider native a candidate so the button isn't hidden.
  const supported =
    (isNativeAndroid && nativePluginAvailable !== false) || hasWebEngine;

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

  const removeNativeListener = useCallback(() => {
    if (nativeListenerRef.current) {
      try { nativeListenerRef.current.remove(); } catch { /* noop */ }
      nativeListenerRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      manualStopRef.current = true;
      clearTimers();
      removeNativeListener();
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch { /* noop */ }
      }
      // Best-effort native stop
      if (isNativeAndroid) {
        import('@capacitor-community/speech-recognition')
          .then((mod) => (mod as any).SpeechRecognition?.stop?.())
          .catch(() => { /* noop */ });
      }
    };
  }, [clearTimers, removeNativeListener, isNativeAndroid]);

  const stopWeb = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* noop */ }
    }
  }, []);

  const stopNative = useCallback(async () => {
    try {
      const mod = await import('@capacitor-community/speech-recognition');
      await (mod as any).SpeechRecognition?.stop?.();
    } catch { /* noop */ }
    removeNativeListener();
  }, [removeNativeListener]);

  const stop = useCallback(() => {
    manualStopRef.current = true;
    clearTimers();
    flushInterimToFinal();
    if (engine === 'native') {
      void stopNative();
    } else {
      stopWeb();
    }
    setRecording(false);
    setContinuing(false);
  }, [clearTimers, flushInterimToFinal, engine, stopNative, stopWeb]);

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

  const startNative = useCallback(async (lang: string) => {
    const mod = await import('@capacitor-community/speech-recognition');
    const SpeechRecognition: any = (mod as any).SpeechRecognition;
    if (!SpeechRecognition) throw new Error('plugin-missing');

    // Permission flow — only here do we treat denial as a real permission issue.
    try {
      const perm = await SpeechRecognition.checkPermissions?.();
      const granted =
        perm?.speechRecognition === 'granted' || perm?.permission === 'granted';
      if (!granted) {
        const req = await SpeechRecognition.requestPermissions?.();
        const ok =
          req?.speechRecognition === 'granted' || req?.permission === 'granted';
        if (!ok) {
          setErrorKind('permission-denied');
          setShowPermissionHelp(true);
          return;
        }
      }
    } catch {
      // permission API may not exist on older plugin versions — proceed and let start() fail clearly
    }

    accumulatedFinalRef.current = '';
    lastInterimRef.current = '';
    manualStopRef.current = false;

    removeNativeListener();
    try {
      const handle = await SpeechRecognition.addListener?.(
        'partialResults',
        (data: any) => {
          const matches: string[] = data?.matches || [];
          const text = matches[0] || '';
          if (!text) return;
          lastResultAtRef.current = Date.now();
          setContinuing(false);
          // Native plugin emits cumulative partials per session — treat as interim.
          lastInterimRef.current = text;
          emitMerged(text);
        }
      );
      if (handle) nativeListenerRef.current = handle;
    } catch { /* noop */ }

    try {
      startUITimers();
      setRecording(true);
      setErrorKind(null);
      await SpeechRecognition.start({
        language: lang,
        maxResults: 1,
        prompt: '',
        partialResults: true,
        popup: false,
      });
      // start() resolves when session ends in some implementations.
      flushInterimToFinal();
      removeNativeListener();
      clearTimers();
      setRecording(false);
      setContinuing(false);
    } catch (err: any) {
      removeNativeListener();
      clearTimers();
      setRecording(false);
      setContinuing(false);
      const msg = String(err?.message || err || '').toLowerCase();
      if (msg.includes('permission') || msg.includes('denied')) {
        setErrorKind('permission-denied');
        setShowPermissionHelp(true);
      } else {
        setErrorKind('service-unavailable');
        setShowPermissionHelp(true);
      }
    }
  }, [clearTimers, emitMerged, flushInterimToFinal, removeNativeListener, startUITimers]);

  const startWeb = useCallback((lang: string) => {
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
  }, [clearTimers, emitMerged, flushInterimToFinal, startUITimers]);

  const start = useCallback(async () => {
    const lang = langForLocale(i18n.language || 'hr');

    if (engine === 'native') {
      await startNative(lang);
      return;
    }
    if (engine === 'web') {
      startWeb(lang);
      return;
    }
    // No engine at all — never claim it's a permission problem.
    setErrorKind('unsupported');
    setShowPermissionHelp(true);
  }, [i18n.language, engine, startNative, startWeb]);

  return {
    recording,
    start,
    stop,
    supported,
    engine,
    showPermissionHelp,
    setShowPermissionHelp,
    errorKind,
    setErrorKind,
    elapsedSec,
    continuing,
  };
};
