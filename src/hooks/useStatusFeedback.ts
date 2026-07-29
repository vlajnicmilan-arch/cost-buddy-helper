import { useState, useEffect } from 'react';
import { CENTAR_NOTE_ENABLED, CENTAR_NOTE_ERROR_DURATION_MS } from '@/lib/notifyFlags';
import { resolveNoteModule, type NoteModule } from '@/lib/notifyModule';

type FeedbackType = 'success' | 'error';
export type FeedbackSeverity = 'info' | 'error';

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

function show(type: FeedbackType, message?: string, options?: FeedbackOptions) {
  if (hideTimeout) clearTimeout(hideTimeout);
  const severity: FeedbackSeverity = type === 'error' ? 'error' : 'info';
  const module = resolveNoteModule({ explicit: options?.module, message });
  const duration =
    CENTAR_NOTE_ENABLED && severity === 'error'
      ? CENTAR_NOTE_ERROR_DURATION_MS
      : computeDuration(type, message);

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

  hideTimeout = setTimeout(() => {
    dispatch({ ...memoryState, visible: false });
    hideTimeout = null;
  }, duration);
}

export function showSuccess(message?: string, options?: FeedbackOptions) {
  show('success', message, options);
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
