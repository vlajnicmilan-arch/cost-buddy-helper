import { useSubscription } from '@/contexts/SubscriptionContext';
import { useStorage } from '@/contexts/StorageContext';
import { useNavigate } from 'react-router-dom';
import { Clock, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';

export const TrialBanner = () => {
  const { t } = useTranslation();
  const { trialActive, trialDaysRemaining, subscribed } = useSubscription();
  const { storageMode } = useStorage();
  const navigate = useNavigate();

  // Only show for cloud users in trial who aren't subscribed
  if (storageMode !== 'cloud' || !trialActive || subscribed) return null;

  const urgency = trialDaysRemaining <= 2;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className={`mb-4 p-3 rounded-xl flex items-center justify-between gap-3 ${
        urgency
          ? 'bg-destructive/10 border border-destructive/20'
          : 'bg-primary/5 border border-primary/10'
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
          urgency ? 'bg-destructive/15' : 'bg-primary/10'
        }`}>
          <Clock className={`w-4 h-4 ${urgency ? 'text-destructive' : 'text-primary'}`} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground leading-tight">
            {trialDaysRemaining === 0
              ? t('trial.lastDay', 'Zadnji dan probnog perioda!')
              : trialDaysRemaining === 1
                ? t('trial.oneDay', 'Još 1 dan probnog perioda')
                : t('trial.daysLeft', `Još ${trialDaysRemaining} dana probnog perioda`)}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('trial.allFeaturesUnlocked', 'Sve značajke su otključane')}
          </p>
        </div>
      </div>
      <Button
        size="sm"
        variant={urgency ? 'destructive' : 'default'}
        className="shrink-0 rounded-lg gap-1.5 text-xs"
        onClick={() => navigate('/paywall')}
      >
        <Zap className="w-3.5 h-3.5" />
        {t('trial.upgrade', 'Nadogradi')}
      </Button>
    </motion.div>
  );
};
