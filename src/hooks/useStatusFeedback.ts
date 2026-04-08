import { useState, useEffect } from 'react';

type FeedbackType = 'success' | 'error';

interface FeedbackState {
  visible: boolean;
  type: FeedbackType;
  message?: string;
}

const listeners: Array<(state: FeedbackState) => void> = [];
let memoryState: FeedbackState = { visible: false, type: 'success' };
let hideTimeout: ReturnType<typeof setTimeout> | null = null;

function dispatch(state: FeedbackState) {
  memoryState = state;
  listeners.forEach((l) => l(memoryState));
}

function show(type: FeedbackType, message?: string) {
  if (hideTimeout) clearTimeout(hideTimeout);
  dispatch({ visible: true, type, message });
  hideTimeout = setTimeout(() => {
    dispatch({ visible: false, type, message });
    hideTimeout = null;
  }, 1200);
}

export function showSuccess(message?: string) {
  show('success', message);
}

export function showError(message?: string) {
  show('error', message);
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
