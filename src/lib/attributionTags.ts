/**
 * Pure helpers for reading acquisition tags (UTM + ad click ids) out of a URL
 * query string. No side effects, no storage, no PII — only what stands in the
 * address bar, truncated.
 */

export const ATTRIBUTION_FIELD_MAX = 200;
export const LANDING_QUERY_MAX = 300;

export const UTM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
] as const;

export const CLICK_ID_KEYS = ['fbclid', 'gclid'] as const;

export type AttributionTags = Partial<
  Record<(typeof UTM_KEYS)[number] | (typeof CLICK_ID_KEYS)[number], string>
> & { landing_query?: string };

const clip = (v: string, max: number) => v.slice(0, max);

/**
 * Extract acquisition tags from a query string (with or without leading `?`).
 * Missing tags are simply absent. Values are truncated to 200 chars,
 * `landing_query` to 300. Never throws.
 */
export const extractAttributionTags = (search: string | null | undefined): AttributionTags => {
  const out: AttributionTags = {};
  try {
    const raw = (search || '').replace(/^\?/, '');
    if (!raw) return out;
    out.landing_query = clip(raw, LANDING_QUERY_MAX);
    const params = new URLSearchParams(raw);
    [...UTM_KEYS, ...CLICK_ID_KEYS].forEach((k) => {
      const v = params.get(k);
      if (v) out[k] = clip(v, ATTRIBUTION_FIELD_MAX);
    });
    return out;
  } catch {
    return out;
  }
};

/** True when the tags carry at least one source marker (query itself doesn't count). */
export const hasAttributionMarkers = (tags: AttributionTags): boolean =>
  [...UTM_KEYS, ...CLICK_ID_KEYS].some((k) => Boolean(tags[k]));

/* ---------- first-touch storage (shared with funnelTracking) ---------- */

export const FIRST_TOUCH_KEY = 'funnel_utm';
export const FIRST_TOUCH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type FirstTouchAttribution = AttributionTags & {
  referrer?: string;
  landing_path?: string;
  captured_at?: number;
};

/**
 * Read the first-touch attribution stored on this device by `funnelTracking`.
 * Single source of truth — no parallel mechanism. Expired entries are dropped.
 * Never throws.
 */
export const readFirstTouchAttribution = (): FirstTouchAttribution => {
  try {
    const raw = localStorage.getItem(FIRST_TOUCH_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as FirstTouchAttribution;
    if (parsed.captured_at && Date.now() - parsed.captured_at > FIRST_TOUCH_TTL_MS) {
      localStorage.removeItem(FIRST_TOUCH_KEY);
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
};
