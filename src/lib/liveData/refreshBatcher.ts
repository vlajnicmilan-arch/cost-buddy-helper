/**
 * Coalesces "data is dirty" signals into as few server refreshes as possible.
 *
 * - The first signal opens a window of `windowMs` (trailing: each new signal
 *   restarts it), but a flush never happens later than `maxWaitMs` after the
 *   first signal of the window.
 * - While a refresh runs, new signals never start a parallel refresh; they
 *   schedule exactly one follow-up refresh right after the current one ends.
 */
export const LIVE_BATCH_WINDOW_MS = 400;
export const LIVE_BATCH_MAX_WAIT_MS = 1500;

export interface RefreshBatcher {
  mark: () => void;
  dispose: () => void;
}

interface Options {
  run: () => Promise<unknown> | unknown;
  windowMs?: number;
  maxWaitMs?: number;
}

export function createRefreshBatcher({
  run,
  windowMs = LIVE_BATCH_WINDOW_MS,
  maxWaitMs = LIVE_BATCH_MAX_WAIT_MS,
}: Options): RefreshBatcher {
  let firstAt: number | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let pendingAfterRun = false;
  let disposed = false;

  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const execute = async (): Promise<void> => {
    if (disposed) return;
    running = true;
    try {
      await run();
    } catch {
      // Refresh failures are handled by the refreshers themselves.
    } finally {
      running = false;
    }
    if (pendingAfterRun && !disposed) {
      pendingAfterRun = false;
      await execute();
    }
  };

  const flush = () => {
    clearTimer();
    firstAt = null;
    void execute();
  };

  const mark = () => {
    if (disposed) return;
    if (running) {
      pendingAfterRun = true;
      return;
    }
    const now = Date.now();
    if (firstAt === null) firstAt = now;
    const remainingCap = maxWaitMs - (now - firstAt);
    clearTimer();
    timer = setTimeout(flush, Math.max(0, Math.min(windowMs, remainingCap)));
  };

  const dispose = () => {
    disposed = true;
    clearTimer();
    firstAt = null;
    pendingAfterRun = false;
  };

  return { mark, dispose };
}
