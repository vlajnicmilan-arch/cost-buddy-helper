export type SubscriptionTier = 'free' | 'pro' | 'business';

// Legacy product IDs (old €4.99/€9.99 plans) — kept for migration & history lookup
export const LEGACY_PRODUCT_IDS = {
  pro: ['prod_UBTAWWLxYO3scq', 'prod_UBTAc9290C7uQe'],
  business: ['prod_UBTAN8sFLVf1N2', 'prod_UBTBILcRURGUH9'],
};

// Legacy price IDs (used by migration script to identify old subscriptions)
export const LEGACY_PRICE_IDS = {
  pro_monthly: 'price_1TD6DlQgkJI9PR8R4jEk7Utl',
  pro_yearly: 'price_1TD6EGQgkJI9PR8RjbeLZKYj',
  business_monthly: 'price_1TD6EbQgkJI9PR8RmCd14trv',
  business_yearly: 'price_1TD6ExQgkJI9PR8R0JnN7Vwx',
};

export const TIERS = {
  pro: {
    product_ids: [
      'prod_UQhwRIN3xrL1un', // Pro Monthly (new)
      'prod_UQhwBmBQxvlJRJ', // Pro Yearly (new)
      'prod_UQhx0n6py0qQzu', // Pro Lifetime
      ...LEGACY_PRODUCT_IDS.pro,
    ],
    prices: {
      monthly: { id: 'price_1TRqWGQgkJI9PR8RdCKznBRn', amount: 7.99 },
      yearly: { id: 'price_1TRqWtQgkJI9PR8RclGTn1J7', amount: 71.90 },
      lifetime: { id: 'price_1TRqXFQgkJI9PR8REDIWD7Wm', amount: 129.00 },
    },
  },
  business: {
    product_ids: [
      'prod_UQhx2p8DiOL5gl', // Business Monthly (new)
      'prod_UQhyXmdR9u8wS5', // Business Yearly (new)
      ...LEGACY_PRODUCT_IDS.business,
    ],
    prices: {
      monthly: { id: 'price_1TRqXyQgkJI9PR8Ruw1LnRKi', amount: 14.99 },
      yearly: { id: 'price_1TRqYOQgkJI9PR8RQbGqnA9I', amount: 134.90 },
    },
  },
} as const;

// Lifetime config — limit & launch tracking
export const LIFETIME_CONFIG = {
  maxFoundingMembers: 200,
  priceId: 'price_1TRqXFQgkJI9PR8REDIWD7Wm',
  amount: 129.00,
} as const;

export const TRIAL_DURATION_DAYS = 30;

export function isTrialExpired(createdAt: string): boolean {
  const created = new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays > TRIAL_DURATION_DAYS;
}

export function getTrialDaysRemaining(createdAt: string): number {
  const created = new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return Math.max(0, Math.ceil(TRIAL_DURATION_DAYS - diffDays));
}
