import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useStorage } from '@/contexts/StorageContext';
import { useFeatureAccess, type Feature } from '@/hooks/useFeatureAccess';
import { cn } from '@/lib/utils';

interface TrialFeatureChipProps {
  /**
   * Feature this chip relates to. Chip shows only when:
   *  - cloud storage mode
   *  - user is in active trial and not yet subscribed
   *  - the feature requires a paid tier (so user would lose it after trial)
   */
  feature: Feature;
  className?: string;
}

/**
 * Small inline chip indicating a paid feature is currently accessible
 * thanks to the trial period. Click navigates to /paywall.
 */
export const TrialFeatureChip: React.FC<TrialFeatureChipProps> = ({ feature, className }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { storageMode } = useStorage();
  const { trialActive, trialDaysRemaining, subscribed } = useSubscription();
  const { getRequiredTier } = useFeatureAccess();

  if (storageMode !== 'cloud') return null;
  if (subscribed || !trialActive) return null;
  if (getRequiredTier(feature) === 'free') return null;

  const urgency = trialDaysRemaining <= 2;
  const daysText =
    trialDaysRemaining === 0
      ? t('trial.featureChip.lastDay', 'zadnji dan')
      : trialDaysRemaining === 1
        ? t('trial.featureChip.oneDay', '1 dan')
        : t('trial.featureChip.daysLeft', '{{count}} dana', { count: trialDaysRemaining });

  const aria = t(
    'trial.featureChip.aria',
    'Klikni za otključavanje',
  );

  return (
    <button
      type="button"
      onClick={() => navigate('/paywall')}
      aria-label={aria}
      title={aria}
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-[11px] font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        urgency
          ? 'bg-destructive/10 border-destructive/30 text-destructive hover:bg-destructive/15'
          : 'bg-primary/10 border-primary/20 text-primary hover:bg-primary/15',
        className,
      )}
    >
      <Sparkles className="w-3 h-3 shrink-0" />
      <span>
        {t('trial.featureChip.label', 'Probni period')} · {daysText}
      </span>
    </button>
  );
};
