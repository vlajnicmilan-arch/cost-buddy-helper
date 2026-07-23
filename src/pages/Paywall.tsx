import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useAuth } from '@/hooks/useAuth';
import { usePaddlePrices, type PaywallPlan, type BillingCycle } from '@/hooks/usePaddlePrices';
import { openPaddleCheckout } from '@/lib/paddleClient';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Check, Loader2, Compass, Users, Briefcase, Sparkles, Building2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { showError } from '@/hooks/useStatusFeedback';
import { tr } from '@/lib/errorMessages';
import {
  shouldForceRedirectAway,
  shouldExitOnCheckoutSuccess,
  needsKompletOverlapConfirm,
  overlappingPaddleModules,
  isPlanAlreadyActive,
  type EntitlementMap,
  type PaywallModule,
} from '@/lib/paywallGate';
import {
  clearCampaign,
  loadCampaign,
  mergeCampaign,
  readCampaignFromParams,
  resolveInitialCycle,
} from '@/lib/paywallCampaign';
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
  const { loading: subLoading, entitlements, checkSubscription } = useSubscription();
  const { prices, loading: pricesLoading, error: pricesError } = usePaddlePrices();
  const [params] = useSearchParams();
  const checkoutStatus = params.get('checkout');
  const planParam = params.get('plan');
  const shopParam = params.get('shop') === '1';

  // Founding campaign: merge URL (?code=, ?cycle=) with any stored campaign
  // that survived an /auth redirect. URL wins; consumed storage is cleared.
  const [campaign] = useState(() => {
    const fromUrl = readCampaignFromParams(params);
    const fromStorage = loadCampaign();
    const merged = mergeCampaign(fromUrl, fromStorage);
    clearCampaign();
    return merged;
  });
  const discountCode = campaign.code;

  const [cycle, setCycle] = useState<BillingCycle>(() => resolveInitialCycle(campaign));
  const [loadingPlan, setLoadingPlan] = useState<PaywallPlan | null>(null);
  const [overlapPlan, setOverlapPlan] = useState<PaywallPlan | null>(null);

  const ents = entitlements as EntitlementMap;

  // Snapshot entitlements at mount so checkout=success can detect a NEW module.
  const initialEntsRef = useRef<EntitlementMap | null>(null);
  useEffect(() => {
    if (subLoading) return;
    if (initialEntsRef.current) return;
    initialEntsRef.current = ents;
  }, [subLoading, ents]);

  const intent = useMemo(
    () => ({ plan: planParam, shop: shopParam, checkoutSuccess: checkoutStatus === 'success' }),
    [planParam, shopParam, checkoutStatus],
  );

  // Exit guard: only auto-redirect a paid user who has NO reason to be here.
  // A ?plan= (from ModuleUpgradeDialog "Otključaj") or ?shop=1 (Settings →
  // Cjenik) or an in-flight ?checkout=success poll keeps them on the paywall.
  useEffect(() => {
    if (subLoading) return;
    if (shouldForceRedirectAway(intent, ents)) {
      navigate('/home', { replace: true });
    }
  }, [subLoading, intent, ents, navigate]);

  // Poll for entitlement activation after returning from Paddle checkout.
  // Exit only when a module that was NOT active at mount becomes active —
  // prevents kicking a returning shopper out to the wrong screen when the
  // webhook trails but they already had other entitlements.
  useEffect(() => {
    if (checkoutStatus !== 'success') return;
    toast.success(t('paywall.checkoutSuccess', 'Hvala — pretplata se aktivira'));
    checkSubscription();
    let attempts = 0;
    const id = window.setInterval(() => {
      attempts += 1;
      checkSubscription();
      if (attempts >= 20) window.clearInterval(id);
    }, 3000);
    return () => window.clearInterval(id);
  }, [checkoutStatus, checkSubscription, t]);

  useEffect(() => {
    if (checkoutStatus !== 'success') return;
    if (subLoading) return;
    const snapshot = initialEntsRef.current;
    if (!snapshot) return;
    if (shouldExitOnCheckoutSuccess(snapshot, ents)) {
      navigate('/home', { replace: true });
    }
  }, [checkoutStatus, subLoading, ents, navigate]);

  // Preselect billing cycle + scroll & highlight the plan from ?plan=.
  const highlightedPlan = planParam as PaywallPlan | null;
  useEffect(() => {
    if (!highlightedPlan) return;
    const el = document.getElementById(`paywall-plan-${highlightedPlan}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightedPlan, pricesLoading]);

  const locale = useMemo<'hr' | 'en' | 'de'>(() => {
    const lang = (i18n.language || 'hr').slice(0, 2).toLowerCase();
    return lang === 'en' || lang === 'de' ? (lang as 'en' | 'de') : 'hr';
  }, [i18n.language]);

  const runCheckout = async (plan: PaywallPlan) => {
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
        discountCode,
      });
      if (!ok) throw new Error('Paddle not initialized');
    } catch (err) {
      console.error('[Paywall] checkout error:', err);
      showError(tr('errors.checkout.startFailed', 'Greška pri pokretanju naplate'));
    } finally {
      setLoadingPlan(null);
    }
  };

  const handleCheckout = (plan: PaywallPlan) => {
    // Ako klik na Komplet, a korisnik već ima aktivnu paddle pretplatu na
    // pojedinačni modul → prvo confirm dijalog (dvostruko plaćanje warning).
    if (needsKompletOverlapConfirm(plan, ents)) {
      setOverlapPlan(plan);
      return;
    }
    runCheckout(plan);
  };

  const overlapModules = overlappingPaddleModules(ents);
  const overlapModulesLabel = overlapModules
    .map((m) => t(`subscription.module.${m}`, m))
    .join(', ');

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

      {discountCode && (
        <p className="text-[11px] text-muted-foreground mb-3 -mt-2">
          {t('paywall.discount.cycleHint', 'Kod popusta može vrijediti samo za godišnju opciju')}
        </p>
      )}

      <div className="w-full max-w-md space-y-3">
        {discountCode && (
          <div
            role="status"
            className="rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground"
          >
            {t('paywall.discount.infoBar', {
              defaultValue: 'Kod popusta {{code}} će se primijeniti pri plaćanju',
              code: discountCode,
            })}
          </div>
        )}
        <AnimatePresence mode="wait">
          {PLAN_PRICES.map((cfg) => {
            const Icon = cfg.icon;
            const price = cycle === 'monthly' ? cfg.monthly : cfg.yearly;
            const priceId = prices[cfg.plan]?.[cycle];
            const alreadyActive = isPlanAlreadyActive(cfg.plan, ents);
            const disabled =
              alreadyActive ||
              pricesLoading || !priceId || loadingPlan !== null || !user?.id;
            const isHighlighted = highlightedPlan === cfg.plan;
            const features = (t(`paywall.modules.${cfg.plan}.features`, {
              returnObjects: true,
              defaultValue: [],
            }) as string[]) || [];
            return (
              <motion.div
                id={`paywall-plan-${cfg.plan}`}
                key={cfg.plan}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className={`rounded-2xl p-5 relative bg-card transition-shadow ${
                  cfg.featured
                    ? 'border-2 border-primary shadow-lg shadow-primary/5'
                    : 'border border-border/60'
                } ${isHighlighted ? 'ring-2 ring-primary/60 ring-offset-2 ring-offset-background' : ''}`}
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
                      <h2 className="font-semibold text-base truncate flex items-center gap-1.5">
                        {t(`paywall.modules.${cfg.plan}.name`)}
                        {alreadyActive && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-1">
                            <Check className="w-2.5 h-2.5" />
                            {t('paywall.activeBadge', 'Aktivno')}
                          </Badge>
                        )}
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
                  aria-label={
                    alreadyActive
                      ? t('paywall.activeBadge', 'Aktivno')
                      : t(`paywall.modules.${cfg.plan}.cta`, { defaultValue: 'Odaberi' })
                  }
                >
                  {loadingPlan === cfg.plan && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  {alreadyActive ? (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      {t('paywall.activeCta', 'Aktivno')}
                    </>
                  ) : (
                    t(`paywall.modules.${cfg.plan}.cta`, 'Odaberi')
                  )}
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
          className="text-center pb-4 pt-2 space-y-1.5"
        >
          <p className="text-xs text-muted-foreground">
            {t('moduleUpgrade.trialMicrocopy', 'Probaj 30 dana besplatno · jednokratno po modulu · bez kartice')}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('paywall.footer.securePaddle', 'Sigurno plaćanje putem Paddle. Otkazivanje u bilo kojem trenutku.')}
          </p>
          <p className="text-[11px] text-muted-foreground/80">
            {t('moduleUpgrade.paddleMor', 'Račun izdaje Paddle.com Market Ltd.')}
          </p>
          <button
            onClick={() => navigate('/auth')}
            className="text-xs text-primary hover:underline"
          >
            {t('paywall.footer.signInOther')}
          </button>
        </motion.div>
      </div>

      <AlertDialog open={!!overlapPlan} onOpenChange={(o) => { if (!o) setOverlapPlan(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('paywall.overlap.title', 'Već imaš aktivnu pretplatu')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('paywall.overlap.body', {
                defaultValue:
                  'Već imaš aktivnu pretplatu: {{modules}}. Komplet je ZASEBNA pretplata — nakon aktivacije Kompleta otkaži pojedinačnu kroz "Upravljaj pretplatom" da ne plaćaš dvostruko.',
                modules: overlapModulesLabel,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('paywall.overlap.cancel', 'Odustani')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const plan = overlapPlan;
                setOverlapPlan(null);
                if (plan) runCheckout(plan);
              }}
            >
              {t('paywall.overlap.continue', 'Nastavi na Komplet')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Paywall;
