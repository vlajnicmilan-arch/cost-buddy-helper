/**
 * sessionStorage + memory fallback za prijenos highlight namjere kroz navigaciju.
 *
 * Cold start native push: sessionStorage može biti prazan dok WebView ne završi
 * boot. Zato držimo i in-memory kopiju koju listener može postaviti odmah pri
 * primitku tapa, prije nego što navigiramo na route.
 */
import type { NormalizedPayload } from './notificationPayload';

const KEY = 'pendingHighlight';
const TTL_MS = 10_000;

export interface PendingHighlight {
  type: NormalizedPayload['highlight'] extends infer H
    ? H extends { type: infer T } ? T : never
    : never;
  id: string;
  route: string | null;
  expiresAt: number;
}

let memory: PendingHighlight | null = null;

function now() {
  return Date.now();
}

export function setPendingHighlight(
  highlight: NonNullable<NormalizedPayload['highlight']>,
  route: string | null,
) {
  const value: PendingHighlight = {
    type: highlight.type as PendingHighlight['type'],
    id: highlight.id,
    route,
    expiresAt: now() + TTL_MS,
  };
  memory = value;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* memory fallback only */
  }
}

export function peekPendingHighlight(): PendingHighlight | null {
  let value: PendingHighlight | null = null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) value = JSON.parse(raw) as PendingHighlight;
  } catch {
    /* ignore */
  }
  if (!value) value = memory;
  if (!value) return null;
  if (value.expiresAt < now()) {
    clearPendingHighlight();
    return null;
  }
  return value;
}

export function consumePendingHighlight(
  matcher?: (h: PendingHighlight) => boolean,
): PendingHighlight | null {
  const v = peekPendingHighlight();
  if (!v) return null;
  if (matcher && !matcher(v)) return null;
  clearPendingHighlight();
  return v;
}

export function clearPendingHighlight() {
  memory = null;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
