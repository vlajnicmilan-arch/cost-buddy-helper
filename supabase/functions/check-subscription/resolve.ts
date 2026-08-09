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

/** Moduli koje admin tier otključava. */
export function modulesForTier(tier: string): readonly Module[] {
  if (tier === 'business') return MODULES;
  if (tier === 'pro') return ['smjer', 'krug', 'projekti'];
  return [];
}

/**
 * UZROK KVARA (kolovoz 2026): u `entitlements` modu klijent (useFeatureAccess)
 * gleda ISKLJUČIVO `entitlements`, a admin-dodijeljena pretplata živi samo u
 * `user_subscriptions`. Korisnik s tier='business' bez isteka je dobivao
 * subscribed=true, ali entitlements.biznis.active=false → write gate ga blokira.
 * Projekcija ispod je jedini izvor istine za tu premosnicu.
 */
export function projectAdminSubscription(
  entitlements: EntitlementMap,
  sub: AdminSubscription | null | undefined,
  now: Date = new Date(),
): EntitlementMap {
  if (!isAdminSubscriptionActive(sub, now)) return entitlements;
  const unlocked = modulesForTier(String(sub!.tier));
  const next = { ...entitlements } as EntitlementMap;
  for (const m of unlocked) {
    const current = next[m];
    if (current?.active) continue;
    next[m] = { active: true, source: 'admin', period_end: sub!.expires_at ?? null };
  }
  return next;
}
