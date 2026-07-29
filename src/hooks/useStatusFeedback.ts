import { useState, useEffect } from 'react';
import {
  CENTAR_NOTE_ENABLED,
  CENTAR_NOTE_ERROR_DURATION_MS,
  CENTAR_NOTE_WARNING_DURATION_MS,
  CENTAR_NOTE_DEDUP_WINDOW_MS,
  STICKY_ERROR_MODULES,
} from '@/lib/notifyFlags';
import { resolveNoteModule, type NoteModule } from '@/lib/notifyModule';

type FeedbackType = 'success' | 'warning' | 'error';
export type FeedbackSeverity = 'info' | 'warning' | 'error';

export interface FeedbackAction {
  label: string;
  onClick: () => void;
}

export interface FeedbackOptions {
  /** Eksplicitni modul; ako izostane, rezolvira se iz konteksta rute. */
  module?: NoteModule;
  /** Opcionalni CTA gumb. */
  action?: FeedbackAction;
  /** Naslov iznad poruke (opcionalno). */
  title?: string;
}

interface FeedbackState {
  visible: boolean;
  type: FeedbackType;
  message?: string;
  severity: FeedbackSeverity;
  module: NoteModule;
  action?: FeedbackAction;
  title?: string;
  duration: number;
}

const listeners: Array<(state: FeedbackState) => void> = [];
let memoryState: FeedbackState = {
  visible: false,
  type: 'success',
  severity: 'info',
  module: 'centar',
  duration: 0,
};
let hideTimeout: ReturnType<typeof setTimeout> | null = null;
let lastKey: string | null = null;
let lastShownAt = 0;

/** Testna pomoćna funkcija — resetira dedup prozor. */
export function __resetFeedbackDedup() {
  lastKey = null;
  lastShownAt = 0;
}

function dispatch(state: FeedbackState) {
  memoryState = state;
  listeners.forEach((l) => l(memoryState));
}

function computeDuration(type: FeedbackType, message?: string): number {
  const base = type === 'error' ? 2500 : 2000;
  const min = type === 'error' ? 3000 : 2500;
  const max = type === 'error' ? 6000 : 4500;
  const len = message?.length ?? 0;
  const extra = Math.max(0, len - 20) * 40;
  const raw = base + extra;
  return Math.min(max, Math.max(min, raw));
}

export { computeDuration };

function severityOf(type: FeedbackType): FeedbackSeverity {
  if (type === 'error') return 'error';
  if (type === 'warning') return 'warning';
  return 'info';
}

function resolveDuration(severity: FeedbackSeverity, module: NoteModule, message?: string): number {
  if (!CENTAR_NOTE_ENABLED) return computeDuration(severity === 'info' ? 'success' : 'error', message);
  if (severity === 'error') {
    return STICKY_ERROR_MODULES.includes(module) ? 0 : CENTAR_NOTE_ERROR_DURATION_MS;
  }
  if (severity === 'warning') return CENTAR_NOTE_WARNING_DURATION_MS;
  return computeDuration('success', message);
}

function show(type: FeedbackType, message?: string, options?: FeedbackOptions) {
  const severity = severityOf(type);
  const module = resolveNoteModule({ explicit: options?.module, message });
  const duration = resolveDuration(severity, module, message);

  // DEDUP: ista poruka + ozbiljnost unutar prozora se ne prikazuje ponovno.
  const key = `${severity}|${message ?? ''}`;
  const now = Date.now();
  if (lastKey === key && now - lastShownAt < CENTAR_NOTE_DEDUP_WINDOW_MS && memoryState.visible) {
    if (duration > 0) {
      if (hideTimeout) clearTimeout(hideTimeout);
      hideTimeout = setTimeout(() => {
        dispatch({ ...memoryState, visible: false });
        hideTimeout = null;
      }, duration);
    }
    return;
  }
  lastKey = key;
  lastShownAt = now;

  if (hideTimeout) clearTimeout(hideTimeout);

  dispatch({
    visible: true,
    type,
    message,
    severity,
    module,
    action: options?.action,
    title: options?.title,
    duration,
  });

  if (duration > 0) {
    hideTimeout = setTimeout(() => {
      dispatch({ ...memoryState, visible: false });
      hideTimeout = null;
    }, duration);
  }
}

/** Ručno gašenje obavijesti (sticky greške). */
export function dismissFeedback() {
  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }
  lastKey = null;
  lastShownAt = 0;
  dispatch({ ...memoryState, visible: false });
}

export function showSuccess(message?: string, options?: FeedbackOptions) {
  show('success', message, options);
}

export function showWarning(message?: string, options?: FeedbackOptions) {
  show('warning', message, options);
}

export function showError(message?: string, options?: FeedbackOptions) {
  show('error', message, options);
}

export function useStatusFeedback() {
  const [state, setState] = useState<FeedbackState>(memoryState);

  useEffect(() => {
    listeners.push(setState);
    return () => {
      const i = listeners.indexOf(setState);
      if (i > -1) listeners.splice(i, 1);
    };
  }, []);

  return state;
}
