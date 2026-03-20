export type SubscriptionTier = 'free' | 'pro' | 'business';

export const TIERS = {
  pro: {
    product_ids: ['prod_UBTAWWLxYO3scq', 'prod_UBTAc9290C7uQe'],
    prices: {
      monthly: { id: 'price_1TD6DlQgkJI9PR8R4jEk7Utl', amount: 4.99 },
      yearly: { id: 'price_1TD6EGQgkJI9PR8RjbeLZKYj', amount: 49.99 },
    },
  },
  business: {
    product_ids: ['prod_UBTAN8sFLVf1N2', 'prod_UBTBILcRURGUH9'],
    prices: {
      monthly: { id: 'price_1TD6EbQgkJI9PR8RmCd14trv', amount: 9.99 },
      yearly: { id: 'price_1TD6ExQgkJI9PR8R0JnN7Vwx', amount: 99.99 },
    },
  },
} as const;

export const TRIAL_DURATION_DAYS = 7;

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
