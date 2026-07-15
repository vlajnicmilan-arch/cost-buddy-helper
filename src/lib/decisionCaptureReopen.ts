/**
 * Short-lived, one-shot marker used by the Project Decisions camera flow.
 *
 * Android can remount the project screen after a native camera roundtrip. In
 * the narrow case where the still-mounted picker already consumed
 * pendingCapture and stored the photo in the draft before that remount, there
 * is no pendingCapture left to trigger the existing dialog reopener. This
 * marker survives that remount and lets the Decisions tab reopen the exact
 * form once.
 */

const KEY = 'vmb.decisionCaptureReopen';
const TTL_MS = 2 * 60 * 1000;

export interface DecisionCaptureReopenNote {
  key: string;
  savedAt: number;
}

const safeSession = (): Storage | null => {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null;
  }
};

const read = (): DecisionCaptureReopenNote | null => {
  const ss = safeSession();
  if (!ss) return null;
  let raw: string | null = null;
  try { raw = ss.getItem(KEY); } catch { return null; }
  if (!raw) return null;

  let parsed: DecisionCaptureReopenNote | null = null;
  try {
    parsed = JSON.parse(raw) as DecisionCaptureReopenNote;
  } catch {
    try { ss.removeItem(KEY); } catch { /* noop */ }
    return null;
  }

  if (!parsed || typeof parsed.key !== 'string' || !parsed.key || typeof parsed.savedAt !== 'number') {
    try { ss.removeItem(KEY); } catch { /* noop */ }
    return null;
  }

  if (Date.now() - parsed.savedAt > TTL_MS) {
    try { ss.removeItem(KEY); } catch { /* noop */ }
    return null;
  }

  return parsed;
};

export const decisionCaptureReopen = {
  set(key: string): void {
    const ss = safeSession();
    if (!ss || !key) return;
    const value: DecisionCaptureReopenNote = { key, savedAt: Date.now() };
    try { ss.setItem(KEY, JSON.stringify(value)); } catch { /* quota */ }
  },

  get(): DecisionCaptureReopenNote | null {
    return read();
  },

  clear(key?: string): void {
    const ss = safeSession();
    if (!ss) return;
    if (key) {
      const note = read();
      if (!note || note.key !== key) return;
    }
    try { ss.removeItem(KEY); } catch { /* noop */ }
  },

  consumeFor(key: string): DecisionCaptureReopenNote | null {
    const note = read();
    if (!note || note.key !== key) return null;
    decisionCaptureReopen.clear(key);
    return note;
  },

  consumeMatching(pattern: RegExp): DecisionCaptureReopenNote | null {
    const note = read();
    if (!note || !pattern.test(note.key)) return null;
    decisionCaptureReopen.clear(note.key);
    return note;
  },
};
