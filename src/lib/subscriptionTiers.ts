export type SubscriptionTier = 'free' | 'pro' | 'business';

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
