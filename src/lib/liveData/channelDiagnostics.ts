import { logDiagnostic } from '@/lib/diagnosticLogger';
import { getBuildStamp } from '@/lib/buildStamp';

export const REALTIME_DIAG_THROTTLE_MS = 60_000;
const STORAGE_KEY = 'vmb-realtime-channel-state-log';

export type ChannelDiagState = 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED' | 'RECONNECTED';

const readMap = (): Record<string, number> => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Record<string, number>;
  } catch {
    return {};
  }
};

const writeMap = (map: Record<string, number>) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* storage unavailable — throttling falls back to this session only */
  }
};

/**
 * Logs `realtime_channel_state` at most once per state per 60 s per device.
 * Returns whether a row was queued.
 */
export function logChannelState(input: {
  state: ChannelDiagState;
  channel: string;
  errorCode?: string | null;
  outageMs?: number | null;
}): boolean {
  const now = Date.now();
  const map = readMap();
  const last = map[input.state] ?? 0;
  if (now - last < REALTIME_DIAG_THROTTLE_MS) return false;
  map[input.state] = now;
  writeMap(map);
  logDiagnostic({
    event: 'realtime_channel_state',
    severity: input.state === 'RECONNECTED' ? 'info' : 'warning',
    details: {
      status: input.state,
      channel: input.channel,
      error_code: input.errorCode ?? null,
      outage_ms: input.outageMs ?? null,
      build_stamp: getBuildStamp(),
    },
  });
  return true;
}

export const __resetChannelDiagThrottleForTests = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
};
