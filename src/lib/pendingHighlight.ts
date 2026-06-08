/**
 * sessionStorage + memory fallback za prijenos highlight namjere kroz navigaciju.
 *
 * Cold start native push: sessionStorage može biti prazan dok WebView ne završi
 * boot. Zato držimo i in-memory kopiju koju listener može postaviti odmah pri
 * primitku tapa, prije nego što navigiramo na route.
 *
 * TTL: 30s za project-bound tipove (cold start + projekti fetch može biti spor),
 * 10s za sve ostalo.
 */
import type { HighlightType, NormalizedHighlight } from './notificationPayload';

const KEY = 'pendingHighlight';
const LONG_TTL_MS = 30_000;
const SHORT_TTL_MS = 10_000;

const LONG_TTL_TYPES = new Set<HighlightType>([
  'project',
  'milestone',
  'invoice',
  'expense',
]);

export interface PendingHighlight {
  type: HighlightType;
  id: string;
  /** Tab to open inside the destination surface (e.g. ProjectFullScreenView). */
  tab: string | null;
  route: string | null;
  expiresAt: number;
}

let memory: PendingHighlight | null = null;

function now() {
  return Date.now();
}

function ttlFor(type: HighlightType): number {
  return LONG_TTL_TYPES.has(type) ? LONG_TTL_MS : SHORT_TTL_MS;
}

export function setPendingHighlight(
  highlight: NormalizedHighlight,
  route: string | null,
) {
  const value: PendingHighlight = {
    type: highlight.type,
    id: highlight.id,
    tab: highlight.tab ?? null,
    route,
    expiresAt: now() + ttlFor(highlight.type),
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
