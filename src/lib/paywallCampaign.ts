/**
 * Founding-link campaign helper.
 *
 * Parses `?code=` and `?cycle=` from the paywall URL, persists them in
 * sessionStorage so they survive a `/paywall` → `/auth` → `/paywall`
 * redirect for unauthenticated users, and derives the effective billing
 * cycle (kod → yearly by default, since the founding kod vrijedi samo
 * za godišnji Komplet — Paddle server-side odbija ostalo).
 */

export type BillingCycle = 'monthly' | 'yearly';

export interface CampaignParams {
  /** Trimmed Paddle discount code, or null. Empty string → null. */
  code: string | null;
  /** Explicit billing cycle from URL, or null when unspecified. */
  cycle: BillingCycle | null;
}

export const CAMPAIGN_SS_KEY = 'centar.paywallCampaign.v1';

const asCycle = (raw: string | null | undefined): BillingCycle | null => {
  if (raw === 'monthly' || raw === 'yearly') return raw;
  return null;
};

/** Parse `?code=` and `?cycle=` from a URLSearchParams-like object. */
export const readCampaignFromParams = (
  params: URLSearchParams | { get(name: string): string | null },
): CampaignParams => {
  const rawCode = params.get('code');
  const trimmed = typeof rawCode === 'string' ? rawCode.trim() : '';
  return {
    code: trimmed ? trimmed : null,
    cycle: asCycle(params.get('cycle')),
  };
};

/** Save a campaign into sessionStorage. No-op on the server / when empty. */
export const saveCampaign = (
  campaign: CampaignParams,
  storage: Storage | null = safeSessionStorage(),
): void => {
  if (!storage) return;
  if (!campaign.code && !campaign.cycle) return;
  try {
    storage.setItem(CAMPAIGN_SS_KEY, JSON.stringify(campaign));
  } catch {
    /* quota / disabled — safe to ignore */
  }
};

/** Load a previously persisted campaign. Returns empty when nothing stored. */
export const loadCampaign = (
  storage: Storage | null = safeSessionStorage(),
): CampaignParams => {
  if (!storage) return { code: null, cycle: null };
  try {
    const raw = storage.getItem(CAMPAIGN_SS_KEY);
    if (!raw) return { code: null, cycle: null };
    const parsed = JSON.parse(raw) as Partial<CampaignParams>;
    return {
      code: typeof parsed.code === 'string' && parsed.code.trim() ? parsed.code.trim() : null,
      cycle: asCycle(parsed.cycle ?? null),
    };
  } catch {
    return { code: null, cycle: null };
  }
};

export const clearCampaign = (
  storage: Storage | null = safeSessionStorage(),
): void => {
  if (!storage) return;
  try {
    storage.removeItem(CAMPAIGN_SS_KEY);
  } catch {
    /* ignore */
  }
};

/**
 * Merge URL params with a stored campaign. URL wins over stored values,
 * so a fresh link never gets shadowed by leftovers from a previous visit.
 */
export const mergeCampaign = (
  fromUrl: CampaignParams,
  fromStorage: CampaignParams,
): CampaignParams => ({
  code: fromUrl.code ?? fromStorage.code,
  cycle: fromUrl.cycle ?? fromStorage.cycle,
});

/**
 * Resolve the initial billing-cycle toggle.
 *   - explicit ?cycle wins,
 *   - otherwise ?code present → yearly (founding kod vrijedi godišnje),
 *   - otherwise monthly (existing default).
 */
export const resolveInitialCycle = (
  campaign: CampaignParams,
  fallback: BillingCycle = 'monthly',
): BillingCycle => {
  if (campaign.cycle) return campaign.cycle;
  if (campaign.code) return 'yearly';
  return fallback;
};

const safeSessionStorage = (): Storage | null => {
  try {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
};
