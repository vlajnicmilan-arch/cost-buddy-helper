import { useSubscription } from '@/contexts/SubscriptionContext';
import { SubscriptionTier } from '@/lib/subscriptionTiers';

export type Feature =
  | 'unlimited_transactions'
  | 'unlimited_payment_sources'
  | 'unlimited_budgets'
  | 'csv_import'
  | 'pdf_import'
  | 'reports'
  | 'ai_assistant'
  | 'family_groups'
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

// Which tier is required for each feature
const FEATURE_TIERS: Record<Feature, SubscriptionTier> = {
  unlimited_transactions: 'pro',
  unlimited_payment_sources: 'pro',
  unlimited_budgets: 'pro',
  csv_import: 'pro',
  pdf_import: 'pro',
  reports: 'pro',
  ai_assistant: 'pro',
  family_groups: 'pro',
  sharing: 'pro',
  recurring_transactions: 'pro',
  savings_goals: 'pro',
  projects: 'pro',
  business_module: 'pro',
  installments: 'pro',
  custom_categories: 'pro',
  // Business-tier features
  team_access: 'business',
  collaborators: 'business',
  advanced_projects: 'business',
  workforce: 'business',
};

// Free tier limits
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
  const { tier, trialActive, subscribed } = useSubscription();

  // During trial, all features are unlocked
  const effectiveTier: SubscriptionTier = trialActive ? 'business' : tier;

  const hasAccess = (feature: Feature): boolean => {
    const requiredTier = FEATURE_TIERS[feature];
    return TIER_RANK[effectiveTier] >= TIER_RANK[requiredTier];
  };

  const getRequiredTier = (feature: Feature): SubscriptionTier => {
    return FEATURE_TIERS[feature];
  };

  const isFreeTier = effectiveTier === 'free';
  const isProTier = effectiveTier === 'pro' || effectiveTier === 'business';
  const isBusinessTier = effectiveTier === 'business';

  return {
    tier: effectiveTier,
    hasAccess,
    getRequiredTier,
    isFreeTier,
    isProTier,
    isBusinessTier,
    trialActive,
  };
}
