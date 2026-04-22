import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Capacitor } from '@capacitor/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';

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
  /** Elapsed seconds of current recording session. */
  elapsedSec: number;
  /** True when recognizer paused listening but we are auto-restarting (user can keep speaking). */
  continuing: boolean;
}

/**
 * Centralized voice dictation hook for both Capacitor native (Android) and web (Chrome/Edge).
 * iOS Safari falls back to unsupported because webkit shim is unreliable.
 *
 * Features:
 * - Accumulates final text across multiple recognizer cycles (auto-restart) so nothing is lost
 *   when the underlying engine pauses on silence.
 * - Promotes the last interim transcript to final before restart, so mid-sentence pauses
 *   (e.g. "...na katu i u [pause] prizemlju") survive the restart.
 * - Hard cap of 30s on a single session to prevent runaway recordings.
 */
export const useVoiceDictation = ({ onTranscript }: UseVoiceDictationOptions): UseVoiceDictationResult => {
  const { i18n } = useTranslation();
  const [recording, setRecording] = useState(false);
  const [showPermissionHelp, setShowPermissionHelp] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [continuing, setContinuing] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const manualStopRef = useRef(false);
  const onTranscriptRef = useRef(onTranscript);

  // Cross-cycle accumulator: holds all final text recognized in this session.
  const accumulatedFinalRef = useRef('');
  // Last interim transcript from current recognizer cycle (web).
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

  // Detect support (memoized once on mount)
  const supported = Capacitor.isNativePlatform()
    ? true
    : !isIOS() && typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

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
      // Emit so the textarea reflects the promoted text immediately.
      onTranscriptRef.current(accumulatedFinalRef.current, true);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      manualStopRef.current = true;
      clearTimers();
      if (Capacitor.isNativePlatform()) {
        SpeechRecognition.stop().catch(() => undefined);
        SpeechRecognition.removeAllListeners().catch(() => undefined);
      } else if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch { /* noop */ }
      }
    };
  }, [clearTimers]);

  const stop = useCallback(() => {
    manualStopRef.current = true;
    clearTimers();
    // Final flush so any in-flight interim text becomes permanent.
    flushInterimToFinal();
    if (Capacitor.isNativePlatform()) {
      SpeechRecognition.stop().catch(() => undefined);
      SpeechRecognition.removeAllListeners().catch(() => undefined);
      setRecording(false);
      setContinuing(false);
      return;
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* noop */ }
    }
    setRecording(false);
    setContinuing(false);
  }, [clearTimers, flushInterimToFinal]);

  const start = useCallback(async () => {
    const lang = langForLocale(i18n.language || 'hr');

    // Reset session state
    accumulatedFinalRef.current = '';
    lastInterimRef.current = '';
    sessionStartRef.current = Date.now();
    lastResultAtRef.current = Date.now();
    setElapsedSec(0);
    setContinuing(false);

    // Start UI timers
    clearTimers();
    elapsedTimerRef.current = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - sessionStartRef.current) / 1000));
    }, 250);
    silenceTimerRef.current = setInterval(() => {
      const sinceLast = Date.now() - lastResultAtRef.current;
      setContinuing(sinceLast > SILENCE_HINT_MS);
    }, 300);
    maxSessionTimerRef.current = setTimeout(() => {
      // Auto-stop after MAX_SESSION_MS
      stop();
    }, MAX_SESSION_MS);

    // === NATIVE PATH ===
    if (Capacitor.isNativePlatform()) {
      try {
        const available = await SpeechRecognition.available();
        if (!available.available) { clearTimers(); return; }

        const permStatus = await SpeechRecognition.checkPermissions();
        if (permStatus.speechRecognition !== 'granted') {
          const req = await SpeechRecognition.requestPermissions();
          if (req.speechRecognition !== 'granted') {
            setShowPermissionHelp(true);
            clearTimers();
            return;
          }
        }

        manualStopRef.current = false;

        await SpeechRecognition.removeAllListeners();
        await SpeechRecognition.addListener('partialResults', (data: { matches: string[] }) => {
          const transcript = data?.matches?.[0] || '';
          if (transcript) {
            lastResultAtRef.current = Date.now();
            setContinuing(false);
            // On Android partialResults the plugin emits the FULL utterance for this cycle.
            // We treat it as interim for the current cycle and merge with prior accumulated final.
            lastInterimRef.current = transcript;
            emitMerged(transcript);
          }
        });
        await SpeechRecognition.addListener('listeningState' as any, (data: any) => {
          if (data?.status === 'stopped' && !manualStopRef.current) {
            // Engine paused on silence — flush this cycle's interim into final, then restart.
            flushInterimToFinal();
            // Respect max session
            if (Date.now() - sessionStartRef.current >= MAX_SESSION_MS) return;
            SpeechRecognition.start({
              language: lang,
              partialResults: true,
              popup: false,
            }).catch(() => setRecording(false));
          }
        });

        await SpeechRecognition.start({
          language: lang,
          partialResults: true,
          popup: false,
        });
        setRecording(true);
      } catch (err: any) {
        const msg = String(err?.message || err);
        if (/permission|denied/i.test(msg)) {
          setShowPermissionHelp(true);
        }
        clearTimers();
        setRecording(false);
      }
      return;
    }

    // === WEB PATH ===
    const r = getWebRecognition(lang);
    if (!r) { clearTimers(); return; }

    // Prompt mic permission
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
      }
    } catch {
      setShowPermissionHelp(true);
      clearTimers();
      return;
    }

    manualStopRef.current = false;

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
        // Final-only update
        onTranscriptRef.current(accumulatedFinalRef.current, true);
      }
    };
    r.onerror = (e: any) => {
      const errType = e?.error || 'unknown';
      if (errType === 'no-speech' || errType === 'aborted') return;
      if (errType === 'not-allowed' || errType === 'service-not-allowed') {
        manualStopRef.current = true;
        clearTimers();
        setShowPermissionHelp(true);
        setRecording(false);
        setContinuing(false);
        return;
      }
      manualStopRef.current = true;
      clearTimers();
      setRecording(false);
      setContinuing(false);
    };
    r.onend = () => {
      if (!manualStopRef.current) {
        // Promote any pending interim into final BEFORE restarting so it survives.
        flushInterimToFinal();
        // Respect max session
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
    }
  }, [i18n.language, clearTimers, emitMerged, flushInterimToFinal, stop]);

  return {
    recording,
    start,
    stop,
    supported,
    showPermissionHelp,
    setShowPermissionHelp,
    elapsedSec,
    continuing,
  };
};
