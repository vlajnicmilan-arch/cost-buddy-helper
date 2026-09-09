// =============================================================
// Čiste funkcije za razrješavanje pretplate. Bez Deno/Supabase ovisnosti
// kako bi ih vitest (src/test/subscriptionAdminProjection.test.ts) mogao
// uvesti izravno i držati regresijsku stražu.
// =============================================================

export const MODULES = ['smjer', 'krug', 'projekti', 'biznis'] as const;
export type Module = typeof MODULES[number];

export interface ModuleStatus {
  active: boolean;
  source: string | null;
  period_end: string | null;
}

export type EntitlementMap = Record<Module, ModuleStatus>;

export interface AdminSubscription {
  tier: string | null | undefined;
  expires_at: string | null | undefined;
}

/**
 * Admin-dodijeljena pretplata je važeća kada tier nije 'free' i nema isteka
 * (ili istek još nije prošao). Zaostali trial redovi na to NE utječu.
 */
export function isAdminSubscriptionActive(
  sub: AdminSubscription | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!sub) return false;
  if (!sub.tier || sub.tier === 'free') return false;
  if (!sub.expires_at) return true;
  return new Date(sub.expires_at) > now;
}

/** Moduli koje admin tier otključava (referenca; više se NE projicira). */
export function modulesForTier(tier: string): readonly Module[] {
  if (tier === 'business') return MODULES;
  if (tier === 'pro') return ['smjer', 'krug', 'projekti'];
  return [];
}

/**
 * ODLUKA 9.9.2026: admin tier (`user_subscriptions`) se više NE projicira u
 * entitlemente. Klijent dobiva točno ono što `has_entitlement` vraća, isto
 * što vidi RLS. Prava se dodjeljuju upisom u `user_entitlements`
 * (source='admin_grant') kroz admin sučelje.
 */
export function resolveEntitlements(entitlements: EntitlementMap): EntitlementMap {
  return entitlements;
}
