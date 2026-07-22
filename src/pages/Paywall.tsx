import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useAuth } from '@/hooks/useAuth';
import { usePaddlePrices, type PaywallPlan, type BillingCycle } from '@/hooks/usePaddlePrices';
import { openPaddleCheckout } from '@/lib/paddleClient';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Loader2, Compass, Users, Briefcase, Sparkles, Building2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { showError } from '@/hooks/useStatusFeedback';
import { tr } from '@/lib/errorMessages';
import logo from '@/assets/logo.webp';

type PlanCardConfig = {
  plan: PaywallPlan;
  icon: React.ComponentType<{ className?: string }>;
  monthly: number;
  yearly: number;
  featured?: boolean;
};

// Sticker prices (display only). Real price_id is looked up from paddle_price_map.
const PLAN_PRICES: PlanCardConfig[] = [
  { plan: 'smjer', icon: Compass, monthly: 5.99, yearly: 59.9 },
  { plan: 'krug', icon: Users, monthly: 9.99, yearly: 99.9 },
  { plan: 'projekti', icon: Briefcase, monthly: 21.99, yearly: 219.9 },
  { plan: 'komplet', icon: Sparkles, monthly: 25.99, yearly: 259.9, featured: true },
];

const Paywall: React.FC = () => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { subscribed, loading: subLoading, entitlements, checkSubscription } = useSubscription();
  const { prices, loading: pricesLoading, error: pricesError } = usePaddlePrices();
  const [params] = useSearchParams();
  const checkoutStatus = params.get('checkout');

  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [loadingPlan, setLoadingPlan] = useState<PaywallPlan | null>(null);

  const hasAnyEntitlement =
    !!entitlements.smjer?.active ||
    !!entitlements.krug?.active ||
    !!entitlements.projekti?.active ||
    !!entitlements.biznis?.active;

  // Exit paywall whenever the user is already entitled — subscribed flag OR
  // any active module. Prevents a paid user with a lingering trial row (which
  // used to poison paddleActive server-side) from being trapped here.
  useEffect(() => {
    if (subLoading) return;
    if (subscribed || hasAnyEntitlement) {
      navigate('/home', { replace: true });
    }
  }, [subscribed, hasAnyEntitlement, subLoading, navigate]);

  // Poll for entitlement activation after returning from Paddle checkout.
  useEffect(() => {
    if (checkoutStatus !== 'success') return;
    toast.success(t('paywall.checkoutSuccess', 'Hvala — pretplata se aktivira'));
    // Immediate refetch, then short poll (webhook can trail the redirect
    // by a few seconds). The exit effect above will navigate as soon as
    // any entitlement flips active.
    checkSubscription();
    let attempts = 0;
    const id = window.setInterval(() => {
      attempts += 1;
      checkSubscription();
      if (attempts >= 20) window.clearInterval(id);
    }, 3000);
    return () => window.clearInterval(id);
  }, [checkoutStatus, checkSubscription, t]);


  const locale = useMemo<'hr' | 'en' | 'de'>(() => {
    const lang = (i18n.language || 'hr').slice(0, 2).toLowerCase();
    return lang === 'en' || lang === 'de' ? (lang as 'en' | 'de') : 'hr';
  }, [i18n.language]);

  const handleCheckout = async (plan: PaywallPlan) => {
    if (!user?.id) {
      showError(t('paywall.notSignedIn', 'Prijava potrebna'));
      return;
    }
    const priceId = prices[plan]?.[cycle];
    if (!priceId) {
      showError(tr('errors.checkout.startFailed', 'Greška pri pokretanju naplate'));
      return;
    }
    setLoadingPlan(plan);
    try {
      const ok = await openPaddleCheckout({
        priceId,
        userId: user.id,
        email: user.email ?? undefined,
        locale,
        successUrl: `${window.location.origin}/paywall?checkout=success`,
      });
      if (!ok) throw new Error('Paddle not initialized');
    } catch (err) {
      console.error('[Paywall] checkout error:', err);
      showError(tr('errors.checkout.startFailed', 'Greška pri pokretanju naplate'));
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <div className="min-h-dvh bg-gradient-to-b from-background via-background to-muted/30 flex flex-col items-center px-4 py-8 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
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

      {/* Cycle toggle */}
      <div className="flex items-center bg-muted/60 rounded-full p-1 mb-6">
        <button
          onClick={() => setCycle('monthly')}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
            cycle === 'monthly' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
          }`}
        >
          {t('paywall.interval.monthly')}
        </button>
        <button
          onClick={() => setCycle('yearly')}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-1.5 ${
            cycle === 'yearly' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
          }`}
        >
          {t('paywall.interval.yearly')}
          <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
            {t('paywall.yearlyBadgeV2', '2 mj. gratis')}
          </span>
        </button>
      </div>

      <div className="w-full max-w-md space-y-3">
        <AnimatePresence mode="wait">
          {PLAN_PRICES.map((cfg) => {
            const Icon = cfg.icon;
            const price = cycle === 'monthly' ? cfg.monthly : cfg.yearly;
            const priceId = prices[cfg.plan]?.[cycle];
            const disabled =
              pricesLoading || !priceId || loadingPlan !== null || !user?.id;
            const features = (t(`paywall.modules.${cfg.plan}.features`, {
              returnObjects: true,
              defaultValue: [],
            }) as string[]) || [];
            return (
              <motion.div
                key={cfg.plan}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className={`rounded-2xl p-5 relative bg-card ${
                  cfg.featured
                    ? 'border-2 border-primary shadow-lg shadow-primary/5'
                    : 'border border-border/60'
                }`}
              >
                {cfg.featured && (
                  <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-semibold px-3 py-0.5 bg-primary text-primary-foreground">
                    {t('paywall.modules.komplet.badge', 'Najbolja vrijednost')}
                  </Badge>
                )}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="font-semibold text-base truncate">
                        {t(`paywall.modules.${cfg.plan}.name`)}
                      </h2>
                      <p className="text-xs text-muted-foreground truncate">
                        {t(`paywall.modules.${cfg.plan}.tagline`)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <span className="text-xl font-bold">{price.toFixed(2)}€</span>
                    <span className="text-[11px] text-muted-foreground block">
                      {cycle === 'monthly' ? t('paywall.period.monthly') : t('paywall.period.yearly')}
                    </span>
                  </div>
                </div>

                {cycle === 'yearly' && (
                  <p className="text-xs text-primary mb-3 font-medium">
                    {t('paywall.yearlyExplain', 'Platiš deset mjeseci, dobiješ dvanaest')}
                  </p>
                )}

                {features.length > 0 && (
                  <div className="space-y-1.5 mb-4">
                    {features.map((text) => (
                      <div key={text} className="flex items-center gap-2">
                        <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span className="text-xs text-foreground">{text}</span>
                      </div>
                    ))}
                  </div>
                )}

                <Button
                  className={`w-full rounded-xl h-10 text-sm ${
                    cfg.featured ? 'bg-primary hover:bg-primary/90' : ''
                  }`}
                  variant={cfg.featured ? 'default' : 'outline'}
                  onClick={() => handleCheckout(cfg.plan)}
                  disabled={disabled}
                  aria-label={t(`paywall.modules.${cfg.plan}.cta`, {
                    defaultValue: 'Odaberi',
                  })}
                >
                  {loadingPlan === cfg.plan && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  {t(`paywall.modules.${cfg.plan}.cta`, 'Odaberi')}
                </Button>
              </motion.div>
            );
          })}

          {/* Biznis — coming soon, no price / no CTA */}
          <motion.div
            key="biznis-soon"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="rounded-2xl border border-dashed border-border/60 bg-muted/30 p-4 flex items-center gap-3"
          >
            <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
              <Building2 className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">
                {t('paywall.modules.biznis.name', 'Biznis')}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('paywall.modules.biznis.comingSoon', 'Uskoro')}
              </p>
            </div>
            <Badge variant="secondary" className="text-[10px]">
              {t('paywall.modules.biznis.badge', 'Uskoro')}
            </Badge>
          </motion.div>
        </AnimatePresence>

        {pricesError && (
          <p className="text-xs text-destructive text-center">
            {t('paywall.pricesError', 'Greška pri učitavanju cijena')}
          </p>
        )}

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="text-center pb-4 pt-2 space-y-2"
        >
          <p className="text-xs text-muted-foreground">
            {t('paywall.footer.securePaddle', 'Sigurno plaćanje putem Paddle. Otkazivanje u bilo kojem trenutku.')}
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
