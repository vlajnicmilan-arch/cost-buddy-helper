import { useSubscription } from '@/contexts/SubscriptionContext';
import { SubscriptionTier } from '@/lib/subscriptionTiers';
import { useMyActiveModuleGrants } from '@/hooks/useMyActiveModuleGrants';
import { FEATURE_MODULE_MAP, EntitlementModule } from '@/lib/featureModuleMap';


export type Feature =
  | 'unlimited_transactions'
  | 'unlimited_payment_sources'
  | 'unlimited_budgets'
  | 'csv_import'
  | 'pdf_import'
  | 'reports'
  | 'ai_assistant'
  | 'krug'
  | 'sharing'
  | 'recurring_transactions'
  | 'savings_goals'
  | 'projects'
  | 'business_module'
  | 'installments'
  | 'custom_categories'
  | 'team_access'
  | 'collaborators'
  | 'advanced_projects'
  | 'workforce';

// Legacy tier gate (koristi se u 'legacy' modu i u 'dual' modu kao fallback OR).
const FEATURE_TIERS: Record<Feature, SubscriptionTier> = {
  unlimited_transactions: 'pro',
  unlimited_payment_sources: 'pro',
  unlimited_budgets: 'pro',
  csv_import: 'pro',
  pdf_import: 'pro',
  reports: 'pro',
  ai_assistant: 'pro',
  krug: 'pro',
  sharing: 'pro',
  recurring_transactions: 'pro',
  savings_goals: 'pro',
  projects: 'pro',
  business_module: 'pro',
  installments: 'pro',
  custom_categories: 'pro',
  workforce: 'pro',
  team_access: 'business',
  collaborators: 'business',
  advanced_projects: 'business',
};

export const FREE_LIMITS = {
  transactions_per_month: 30,
  payment_sources: 1,
  budgets: 1,
} as const;

const TIER_RANK: Record<SubscriptionTier, number> = {
  free: 0,
  pro: 1,
  business: 2,
};

export function useFeatureAccess() {
  const { tier, trialActive, subscribed, entitlements, entitlementsMode } = useSubscription();
  const { hasActiveGrant } = useMyActiveModuleGrants();

  const effectiveTier: SubscriptionTier = trialActive ? 'business' : tier;

  const hasModuleAccess = (module: EntitlementModule): boolean => {
    if (entitlements[module]?.active) return true;
    if (module === 'projekti' && hasActiveGrant('projects')) return true;
    if (module === 'biznis' && hasActiveGrant('business')) return true;
    return false;
  };

  const hasEntitlement = (feature: Feature): boolean => {
    const module: EntitlementModule = FEATURE_MODULE_MAP[feature];
    return hasModuleAccess(module);
  };

  const hasTierAccess = (feature: Feature): boolean => {
    const requiredTier = FEATURE_TIERS[feature];
    if (TIER_RANK[effectiveTier] >= TIER_RANK[requiredTier]) return true;
    if (feature === 'projects' && hasActiveGrant('projects')) return true;
    if (feature === 'business_module' && hasActiveGrant('business')) return true;
    return false;
  };

  const hasAccess = (feature: Feature): boolean => {
    // FAZA 5 kill-switch:
    //   entitlements → jedini izvor entitlements
    //   dual         → entitlement OR legacy tier (7-dnevni prijelaz)
    //   legacy       → samo stari tier gate (rollback)
    if (entitlementsMode === 'entitlements') return hasEntitlement(feature);
    if (entitlementsMode === 'legacy') return hasTierAccess(feature);
    return hasEntitlement(feature) || hasTierAccess(feature);
  };

  const getRequiredTier = (feature: Feature): SubscriptionTier => FEATURE_TIERS[feature];

  const isFreeTier = effectiveTier === 'free';
  const isProTier = effectiveTier === 'pro' || effectiveTier === 'business';
  const isBusinessTier = effectiveTier === 'business';

  return {
    tier: effectiveTier,
    hasAccess,
    /** Strogi write gate: pravo iz entitlementa/admin granta, bez legacy tier fallbacka. */
    hasModuleAccess,
    getRequiredTier,
    isFreeTier,
    isProTier,
    isBusinessTier,
    trialActive,
  };
}
