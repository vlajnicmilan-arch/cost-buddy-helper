import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { TIERS, LIFETIME_CONFIG } from '@/lib/subscriptionTiers';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Loader2, Shield, Zap, Building2, X, Crown, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { showError } from '@/hooks/useStatusFeedback';
import { tr } from '@/lib/errorMessages';
import { motion, AnimatePresence } from 'framer-motion';
import logo from '@/assets/logo.webp';

type BillingInterval = 'monthly' | 'yearly' | 'lifetime';

const Paywall: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { subscribed, loading: subLoading, checkSubscription } = useSubscription();

  useEffect(() => {
    if (!subLoading && subscribed) {
      navigate('/home', { replace: true });
    }
  }, [subscribed, subLoading, navigate]);

  const [interval, setInterval] = useState<BillingInterval>('monthly');
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [lifetimeAvail, setLifetimeAvail] = useState<{ remaining: number; total: number; sold: number } | null>(null);

  // Free features: first 4 included, rest excluded
  const freeFeatures = useMemo(() => {
    const list = (t('paywall.features.free', { returnObjects: true }) as string[]) || [];
    return list.map((text, idx) => ({ text, included: idx < 4 }));
  }, [t]);
  const proFeatures = useMemo(() => (t('paywall.features.pro', { returnObjects: true }) as string[]) || [], [t]);
  const businessFeatures = useMemo(() => (t('paywall.features.business', { returnObjects: true }) as string[]) || [], [t]);
  const lifetimeFeatures = useMemo(() => (t('paywall.features.lifetime', { returnObjects: true }) as string[]) || [], [t]);

  useEffect(() => {
    const fetchAvail = async () => {
      try {
        const { data } = await supabase.functions.invoke('get-lifetime-availability');
        if (data && typeof data.remaining === 'number') {
          setLifetimeAvail({
            remaining: data.remaining,
            total: data.max ?? data.total ?? LIFETIME_CONFIG.maxFoundingMembers,
            sold: data.sold ?? 0,
          });
        }
      } catch (err) {
        console.warn('Lifetime availability fetch failed:', err);
      }
    };
    fetchAvail();
  }, []);

  useEffect(() => {
    if (loadingTier) return;
    const handle = window.setInterval(() => {
      checkSubscription();
    }, 5000);
    return () => window.clearInterval(handle);
  }, [loadingTier, checkSubscription]);

  const handleCheckout = async (tier: 'pro' | 'business' | 'lifetime') => {
    setLoadingTier(tier);
    try {
      let priceId: string;
      let mode: 'subscription' | 'payment' = 'subscription';

      if (tier === 'lifetime') {
        priceId = TIERS.pro.prices.lifetime.id;
        mode = 'payment';
      } else if (tier === 'pro') {
        priceId = TIERS.pro.prices[interval === 'lifetime' ? 'monthly' : interval].id;
      } else {
        const billingInterval = interval === 'lifetime' ? 'monthly' : interval;
        priceId = TIERS.business.prices[billingInterval].id;
      }

      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { priceId, mode },
      });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, '_blank');
      }
    } catch (err) {
      console.error('Checkout error:', err);
      showError(tr('errors.checkout.startFailed', 'Greška pri pokretanju naplate'));
    } finally {
      setLoadingTier(null);
    }
  };

  const proMonthly = TIERS.pro.prices.monthly.amount;
  const proYearly = TIERS.pro.prices.yearly.amount;
  const proLifetime = TIERS.pro.prices.lifetime.amount;
  const bizMonthly = TIERS.business.prices.monthly.amount;
  const bizYearly = TIERS.business.prices.yearly.amount;

  const isLifetime = interval === 'lifetime';
  const proPrice = interval === 'monthly' ? proMonthly : interval === 'yearly' ? proYearly : proLifetime;
  const bizPrice = interval === 'monthly' ? bizMonthly : bizYearly;
  const periodLabel =
    interval === 'monthly'
      ? t('paywall.period.monthly')
      : interval === 'yearly'
      ? t('paywall.period.yearly')
      : t('paywall.period.oneTime');

  const lifetimeSoldOut = lifetimeAvail?.remaining === 0;

  return (
    <div className="min-h-dvh bg-gradient-to-b from-background via-background to-muted/30 flex flex-col items-center px-4 py-8 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="text-center mb-6"
      >
        <div className="w-16 h-16 rounded-2xl overflow-hidden mx-auto mb-4 shadow-lg shadow-primary/10">
          <img src={logo} alt="Centar" className="w-full h-full scale-[1.8] object-cover" />
        </div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">
          {t('paywall.trialExpiredTitle')}
        </h1>
        <p className="text-muted-foreground text-sm mt-1.5 max-w-xs mx-auto">
          {t('paywall.chooseToContinue')}
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        className="flex items-center bg-muted/60 rounded-full p-1 mb-6 flex-wrap justify-center gap-1"
      >
        <button
          onClick={() => setInterval('monthly')}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
            interval === 'monthly' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {t('paywall.interval.monthly')}
        </button>
        <button
          onClick={() => setInterval('yearly')}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 flex items-center gap-1.5 ${
            interval === 'yearly' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {t('paywall.interval.yearly')}
          <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
            {t('paywall.yearlyBadge')}
          </span>
        </button>
        <button
          onClick={() => setInterval('lifetime')}
          disabled={lifetimeSoldOut}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed ${
            interval === 'lifetime' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Crown className="w-3.5 h-3.5" />
          {t('paywall.interval.lifetime')}
          {lifetimeAvail && lifetimeAvail.remaining > 0 && (
            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-full">
              {t('paywall.lifetimeBadge')}
            </span>
          )}
        </button>
      </motion.div>

      <div className="w-full max-w-md space-y-4">
        <AnimatePresence mode="wait">
          {isLifetime ? (
            <motion.div
              key="lifetime-view"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-2xl border-2 border-amber-500/60 bg-gradient-to-br from-amber-50/50 to-card dark:from-amber-950/20 dark:to-card p-5 relative shadow-xl shadow-amber-500/10"
            >
              <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-semibold px-3 py-0.5 bg-gradient-to-r from-amber-500 to-amber-600 text-white border-0 flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5" />
                {t('paywall.lifetime.badge')}
              </Badge>

              <div className="flex items-center justify-between mb-3 mt-1">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-md">
                    <Crown className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-base">{t('paywall.lifetime.name')}</h2>
                    <p className="text-xs text-muted-foreground">{t('paywall.lifetime.tagline')}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-bold">{proLifetime.toFixed(0)}€</span>
                  <span className="text-xs text-muted-foreground block">{t('paywall.lifetime.oneTime')}</span>
                </div>
              </div>

              {lifetimeAvail && (
                <div className="mb-4 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-medium text-foreground">
                      {lifetimeSoldOut ? (
                        t('paywall.lifetime.soldOut')
                      ) : (
                        <>
                          {t('paywall.lifetime.remainingLabel')}{' '}
                          <span className="text-amber-600 dark:text-amber-400 font-bold">{lifetimeAvail.remaining}</span>{' '}
                          {t('paywall.lifetime.ofTotal')} {lifetimeAvail.total}
                        </>
                      )}
                    </span>
                    <span className="text-muted-foreground">{lifetimeAvail.sold} {t('paywall.lifetime.soldSuffix')}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-amber-500/10 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-amber-400 to-amber-600 transition-all duration-500"
                      style={{ width: `${Math.min(100, (lifetimeAvail.sold / lifetimeAvail.total) * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              <p className="text-xs text-amber-700 dark:text-amber-400 mb-3 font-medium">
                {t('paywall.lifetime.equivalent')}
              </p>

              <div className="space-y-1.5 mb-4">
                {lifetimeFeatures.map((text) => (
                  <div key={text} className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span className="text-sm text-foreground">{text}</span>
                  </div>
                ))}
              </div>

              <Button
                className="w-full rounded-xl h-11 text-sm bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white border-0 shadow-md disabled:opacity-50"
                onClick={() => handleCheckout('lifetime')}
                disabled={loadingTier !== null || lifetimeSoldOut}
              >
                {loadingTier === 'lifetime' && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                {lifetimeSoldOut
                  ? t('paywall.lifetime.soldOut')
                  : t('paywall.lifetime.ctaBecome', { price: proLifetime.toFixed(0) })}
              </Button>

              <button
                onClick={() => setInterval('monthly')}
                className="w-full text-xs text-muted-foreground hover:text-foreground mt-3 underline-offset-2 hover:underline"
              >
                {t('paywall.lifetime.backToMonthly')}
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="standard-view"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-4"
            >
              {/* Free Plan */}
              <div className="rounded-2xl border border-border/60 bg-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-muted/80 flex items-center justify-center">
                      <Shield className="w-4.5 h-4.5 text-muted-foreground" />
                    </div>
                    <div>
                      <h2 className="font-semibold text-base">{t('paywall.free.name')}</h2>
                      <p className="text-xs text-muted-foreground">{t('paywall.free.tagline')}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-bold">0€</span>
                    <span className="text-xs text-muted-foreground block">{t('paywall.free.priceSuffix')}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mb-4">
                  {freeFeatures.map((f) => (
                    <div key={f.text} className="flex items-center gap-1.5">
                      {f.included ? (
                        <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                      ) : (
                        <X className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                      )}
                      <span className={`text-xs ${f.included ? 'text-foreground' : 'text-muted-foreground line-through opacity-70'}`}>
                        {f.text}
                      </span>
                    </div>
                  ))}
                </div>
                <Button
                  variant="outline"
                  className="w-full rounded-xl h-10 text-sm"
                  onClick={() => {
                    toast.info(t('paywall.free.comingSoon'));
                  }}
                >
                  {t('paywall.free.cta')}
                </Button>
              </div>

              {/* Pro Plan */}
              <div className="rounded-2xl border-2 border-primary bg-card p-5 relative shadow-lg shadow-primary/5">
                <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-semibold px-3 py-0.5 bg-primary text-primary-foreground">
                  {t('paywall.popular')}
                </Badge>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Zap className="w-4.5 h-4.5 text-primary" />
                    </div>
                    <div>
                      <h2 className="font-semibold text-base">{t('paywall.pro.name')}</h2>
                      <p className="text-xs text-muted-foreground">{t('paywall.pro.tagline')}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-bold">{proPrice.toFixed(2)}€</span>
                    <span className="text-xs text-muted-foreground block">{periodLabel}</span>
                  </div>
                </div>
                {interval === 'yearly' && (
                  <p className="text-xs text-primary mb-3 font-medium">
                    {t('paywall.pro.yearlySavings', { amount: ((proMonthly * 12) - proYearly).toFixed(2) })}
                  </p>
                )}
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mb-4">
                  {proFeatures.map((text) => (
                    <div key={text} className="flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="text-xs text-foreground">{text}</span>
                    </div>
                  ))}
                </div>
                <Button
                  className="w-full rounded-xl h-10 text-sm bg-primary hover:bg-primary/90"
                  onClick={() => handleCheckout('pro')}
                  disabled={loadingTier !== null}
                >
                  {loadingTier === 'pro' && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  {t('paywall.pro.cta')}
                </Button>
              </div>

              {/* Business Plan */}
              <div className="rounded-2xl border-2 border-primary/30 bg-card p-5 relative">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Building2 className="w-4.5 h-4.5 text-primary" />
                    </div>
                    <div>
                      <h2 className="font-semibold text-base">{t('paywall.business.name')}</h2>
                      <p className="text-xs text-muted-foreground">{t('paywall.business.tagline')}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-bold">{bizPrice.toFixed(2)}€</span>
                    <span className="text-xs text-muted-foreground block">{periodLabel}</span>
                  </div>
                </div>
                {interval === 'yearly' && (
                  <p className="text-xs text-primary mb-3 font-medium">
                    {t('paywall.business.yearlySavings', { amount: ((bizMonthly * 12) - bizYearly).toFixed(2) })}
                  </p>
                )}
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mb-4">
                  {businessFeatures.map((text) => (
                    <div key={text} className="flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="text-xs text-foreground">{text}</span>
                    </div>
                  ))}
                </div>
                <Button
                  className="w-full rounded-xl h-10 text-sm"
                  variant="outline"
                  onClick={() => handleCheckout('business')}
                  disabled={loadingTier !== null}
                >
                  {loadingTier === 'business' && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  {t('paywall.business.cta')}
                </Button>
              </div>

              {/* Lifetime teaser */}
              {lifetimeAvail && lifetimeAvail.remaining > 0 && (
                <button
                  onClick={() => setInterval('lifetime')}
                  className="w-full rounded-2xl border border-amber-500/40 bg-gradient-to-r from-amber-50/50 to-transparent dark:from-amber-950/20 p-4 text-left hover:border-amber-500/70 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shrink-0">
                      <Crown className="w-4.5 h-4.5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                        {t('paywall.lifetime.name')} · {proLifetime.toFixed(0)}€
                        <Sparkles className="w-3 h-3 text-amber-500" />
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t('paywall.lifetime.teaserSubtitle', { n: lifetimeAvail.remaining })}
                      </p>
                    </div>
                    <span className="text-xs text-amber-600 dark:text-amber-400 font-medium group-hover:underline">
                      {t('paywall.lifetime.teaserView')}
                    </span>
                  </div>
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.5 }}
          className="text-center pb-4 pt-2 space-y-2"
        >
          <p className="text-xs text-muted-foreground">
            {t('paywall.footer.secure')}
          </p>
          <button
            onClick={() => navigate('/auth')}
            className="text-xs text-primary hover:underline"
          >
            {t('paywall.footer.signInOther')}
          </button>
        </motion.div>
      </div>
    </div>
  );
};

export default Paywall;
