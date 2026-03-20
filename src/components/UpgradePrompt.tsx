import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Lock, Zap, Building2 } from 'lucide-react';
import { SubscriptionTier } from '@/lib/subscriptionTiers';
import { motion } from 'framer-motion';

interface UpgradePromptProps {
  feature: string;
  requiredTier: SubscriptionTier;
  compact?: boolean;
  className?: string;
}

const TIER_CONFIG = {
  pro: {
    label: 'Pro',
    icon: Zap,
    color: 'text-primary',
    bgColor: 'bg-primary/10',
  },
  business: {
    label: 'Business',
    icon: Building2,
    color: 'text-primary',
    bgColor: 'bg-primary/10',
  },
} as const;

export const UpgradePrompt: React.FC<UpgradePromptProps> = ({
  feature,
  requiredTier,
  compact = false,
  className = '',
}) => {
  const navigate = useNavigate();
  const config = TIER_CONFIG[requiredTier === 'free' ? 'pro' : requiredTier];
  const Icon = config.icon;

  if (compact) {
    return (
      <button
        onClick={() => navigate('/paywall')}
        className={`inline-flex items-center gap-1.5 text-xs text-primary hover:underline ${className}`}
      >
        <Lock className="w-3 h-3" />
        <span>{config.label} značajka</span>
      </button>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={`flex flex-col items-center justify-center p-6 text-center ${className}`}
    >
      <div className={`w-12 h-12 rounded-2xl ${config.bgColor} flex items-center justify-center mb-3`}>
        <Lock className={`w-5 h-5 ${config.color}`} />
      </div>
      <h3 className="font-semibold text-base text-foreground mb-1">
        {feature}
      </h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-[260px]">
        Ova značajka dostupna je u <span className="font-medium text-foreground">{config.label}</span> planu
      </p>
      <Button
        onClick={() => navigate('/paywall')}
        size="sm"
        className="rounded-xl gap-2"
      >
        <Icon className="w-4 h-4" />
        Nadogradi na {config.label}
      </Button>
    </motion.div>
  );
};

interface FeatureGateProps {
  feature: string;
  requiredTier: SubscriptionTier;
  hasAccess: boolean;
  children: React.ReactNode;
  fallback?: 'prompt' | 'hidden' | 'disabled';
  compact?: boolean;
  className?: string;
}

export const FeatureGate: React.FC<FeatureGateProps> = ({
  feature,
  requiredTier,
  hasAccess,
  children,
  fallback = 'prompt',
  compact = false,
  className = '',
}) => {
  if (hasAccess) return <>{children}</>;

  if (fallback === 'hidden') return null;

  if (fallback === 'disabled') {
    return (
      <div className={`relative opacity-50 pointer-events-none ${className}`}>
        {children}
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 rounded-xl">
          <UpgradePrompt feature={feature} requiredTier={requiredTier} compact />
        </div>
      </div>
    );
  }

  return <UpgradePrompt feature={feature} requiredTier={requiredTier} compact={compact} className={className} />;
};
