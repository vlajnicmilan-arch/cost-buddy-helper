/**
 * Pure helperi za admin Access UX (bez legacy Free/Pro/Business UI jezika).
 *
 * Model:
 *   - DB tier ostaje 'free' | 'pro' | 'business' (internal SoT).
 *   - UI prevodi:
 *       'free'     → 'admin.billing.planLabel.coreOnly'
 *       'pro'      → 'admin.billing.planLabel.projects'
 *       'business' → 'admin.billing.planLabel.business'
 *   - Efektivni pristup = Billing ∪ Admin override (aditivno).
 *   - Brojači u overview-u su NAMJERNO nedisjunktni (billing i override
 *     mogu pokrivati istog korisnika); presjek je eksplicitno odvojen.
 */

export type GrantModule = 'projects' | 'business';
export type BillingTier = 'free' | 'pro' | 'business';
export type AccessSource = 'billing' | 'override';

export interface ActiveGrantLike {
  user_id: string;
  module: GrantModule;
  revoked_at?: string | null;
  expires_at?: string | null;
}

export interface ModuleAccess {
  has: boolean;
  sources: AccessSource[];
}

export interface EffectiveAccess {
  core: true;
  projects: ModuleAccess;
  business: ModuleAccess;
}

export interface ModuleAccessSummary {
  total: number;        // jedinstveni korisnici s pristupom (UNION)
  billing: number;      // jedinstveni kroz billing
  override: number;     // jedinstveni kroz override
  intersection: number; // presjek (broje se u oba)
}

export interface OverviewSummary {
  coreTotal: number;
  projects: ModuleAccessSummary;
  business: ModuleAccessSummary;
}

export interface GrantSortRow {
  id: string;
  granted_at: string;
  revoked_at?: string | null;
}

/** UI label key za billing plan, BEZ riječi "Pro". */
export function formatBillingPlanLabel(
  tier: BillingTier | string | null | undefined
): string {
  switch (tier) {
    case 'pro':
      return 'admin.billing.planLabel.projects';
    case 'business':
      return 'admin.billing.planLabel.business';
    case 'free':
    case null:
    case undefined:
    case '':
      return 'admin.billing.planLabel.coreOnly';
    default:
      return 'admin.billing.planLabel.coreOnly';
  }
}

/**
 * Aktivan = revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now()).
 * Identično has_active_module_grant() semantici u DB-u.
 */
export function isGrantActive(
  g: Pick<ActiveGrantLike, 'revoked_at' | 'expires_at'>,
  now: Date = new Date()
): boolean {
  if (g.revoked_at) return false;
  if (g.expires_at && new Date(g.expires_at).getTime() <= now.getTime()) return false;
  return true;
}

/**
 * Efektivni pristup za jednog korisnika: spaja billing tier i aktivne override grantove.
 * Aditivan model — billing i override su nezavisni izvori, oba mogu vrijediti.
 */
export function deriveEffectiveAccess(
  userId: string,
  subscriptionTier: string | null | undefined,
  grants: ActiveGrantLike[],
  now: Date = new Date()
): EffectiveAccess {
  const tier = (subscriptionTier ?? 'free') as BillingTier | string;
  const userGrants = grants.filter(
    (g) => g.user_id === userId && isGrantActive(g, now)
  );

  const projects: ModuleAccess = { has: false, sources: [] };
  if (tier === 'pro' || tier === 'business') {
    projects.has = true;
    projects.sources.push('billing');
  }
  if (userGrants.some((g) => g.module === 'projects')) {
    projects.has = true;
    if (!projects.sources.includes('override')) projects.sources.push('override');
  }

  const business: ModuleAccess = { has: false, sources: [] };
  if (tier === 'business') {
    business.has = true;
    business.sources.push('billing');
  }
  if (userGrants.some((g) => g.module === 'business')) {
    business.has = true;
    if (!business.sources.includes('override')) business.sources.push('override');
  }

  return { core: true, projects, business };
}

/**
 * Brojanje za "Stanje pristupa po modulima" karticu.
 * Brojevi billing + override su NEDISJUNKTNI, presjek je eksplicitno odvojen,
 * `total` = |billing ∪ override| (svaki user broji jednom).
 */
export function summarizeModuleAccess(
  userIds: string[],
  subscriptions: Record<string, string>,
  grants: ActiveGrantLike[],
  now: Date = new Date()
): OverviewSummary {
  const grantUsersByModule: Record<GrantModule, Set<string>> = {
    projects: new Set(),
    business: new Set(),
  };
  for (const g of grants) {
    if (!isGrantActive(g, now)) continue;
    grantUsersByModule[g.module]?.add(g.user_id);
  }

  const userIdSet = new Set(userIds);

  const calc = (module: GrantModule): ModuleAccessSummary => {
    const billing = new Set<string>();
    for (const uid of userIds) {
      const tier = subscriptions[uid] ?? 'free';
      if (module === 'projects' && (tier === 'pro' || tier === 'business')) {
        billing.add(uid);
      }
      if (module === 'business' && tier === 'business') {
        billing.add(uid);
      }
    }
    // Override skup ograničimo na poznate korisnike u listi
    const override = new Set<string>();
    for (const uid of grantUsersByModule[module]) {
      if (userIdSet.size === 0 || userIdSet.has(uid)) override.add(uid);
    }
    const total = new Set<string>([...billing, ...override]);
    let intersection = 0;
    for (const uid of override) if (billing.has(uid)) intersection++;
    return {
      total: total.size,
      billing: billing.size,
      override: override.size,
      intersection,
    };
  };

  return {
    coreTotal: userIds.length,
    projects: calc('projects'),
    business: calc('business'),
  };
}

/**
 * Sortiranje po stvarnom vremenu događaja:
 *   ORDER BY GREATEST(granted_at, COALESCE(revoked_at, granted_at)) DESC, id DESC
 * Tie-breaker po id-u (deterministički).
 */
export function sortGrantsByLatestEvent<T extends GrantSortRow>(rows: T[]): T[] {
  const eventTime = (r: GrantSortRow): number => {
    const g = new Date(r.granted_at).getTime();
    const rv = r.revoked_at ? new Date(r.revoked_at).getTime() : g;
    return Math.max(g, rv);
  };
  return [...rows].sort((a, b) => {
    const diff = eventTime(b) - eventTime(a);
    if (diff !== 0) return diff;
    return b.id.localeCompare(a.id);
  });
}
