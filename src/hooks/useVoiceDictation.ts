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
}

/**
 * Centralized voice dictation hook for both Capacitor native (Android) and web (Chrome/Edge).
 * iOS Safari falls back to unsupported because webkit shim is unreliable.
 */
export const useVoiceDictation = ({ onTranscript }: UseVoiceDictationOptions): UseVoiceDictationResult => {
  const { i18n } = useTranslation();
  const [recording, setRecording] = useState(false);
  const [showPermissionHelp, setShowPermissionHelp] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const manualStopRef = useRef(false);
  const onTranscriptRef = useRef(onTranscript);

  // Keep latest callback without re-creating start/stop
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  // Detect support (memoized once on mount)
  const supported = Capacitor.isNativePlatform()
    ? true
    : !isIOS() && typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      manualStopRef.current = true;
      if (Capacitor.isNativePlatform()) {
        SpeechRecognition.stop().catch(() => undefined);
        SpeechRecognition.removeAllListeners().catch(() => undefined);
      } else if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch { /* noop */ }
      }
    };
  }, []);

  const start = useCallback(async () => {
    const lang = langForLocale(i18n.language || 'hr');

    // === NATIVE PATH ===
    if (Capacitor.isNativePlatform()) {
      try {
        const available = await SpeechRecognition.available();
        if (!available.available) return;

        const permStatus = await SpeechRecognition.checkPermissions();
        if (permStatus.speechRecognition !== 'granted') {
          const req = await SpeechRecognition.requestPermissions();
          if (req.speechRecognition !== 'granted') {
            setShowPermissionHelp(true);
            return;
          }
        }

        manualStopRef.current = false;

        await SpeechRecognition.removeAllListeners();
        await SpeechRecognition.addListener('partialResults', (data: { matches: string[] }) => {
          const transcript = data?.matches?.[0] || '';
          if (transcript) onTranscriptRef.current(transcript, false);
        });
        await SpeechRecognition.addListener('listeningState' as any, (data: any) => {
          if (data?.status === 'stopped' && !manualStopRef.current) {
            // Auto-restart after silence
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
        setRecording(false);
      }
      return;
    }

    // === WEB PATH ===
    const r = getWebRecognition(lang);
    if (!r) return;

    // Prompt mic permission
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
      }
    } catch {
      setShowPermissionHelp(true);
      return;
    }

    manualStopRef.current = false;

    r.onstart = () => setRecording(true);
    r.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const s = e.results[i];
        const transcript = s[0]?.transcript || '';
        if (transcript) onTranscriptRef.current(transcript, !!s.isFinal);
      }
    };
    r.onerror = (e: any) => {
      const errType = e?.error || 'unknown';
      if (errType === 'no-speech' || errType === 'aborted') return;
      if (errType === 'not-allowed' || errType === 'service-not-allowed') {
        manualStopRef.current = true;
        setShowPermissionHelp(true);
        setRecording(false);
        return;
      }
      manualStopRef.current = true;
      setRecording(false);
    };
    r.onend = () => {
      if (!manualStopRef.current) {
        try { r.start(); return; } catch { /* fall through */ }
      }
      setRecording(false);
    };

    try {
      r.start();
      recognitionRef.current = r;
    } catch {
      setRecording(false);
    }
  }, [i18n.language]);

  const stop = useCallback(() => {
    manualStopRef.current = true;
    if (Capacitor.isNativePlatform()) {
      SpeechRecognition.stop().catch(() => undefined);
      SpeechRecognition.removeAllListeners().catch(() => undefined);
      setRecording(false);
      return;
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* noop */ }
    }
    setRecording(false);
  }, []);

  return { recording, start, stop, supported, showPermissionHelp, setShowPermissionHelp };
};
