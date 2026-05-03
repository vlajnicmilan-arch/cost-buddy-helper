import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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

interface PlanFeature {
  text: string;
  included: boolean;
}

const FREE_FEATURES: PlanFeature[] = [
  { text: 'Do 30 transakcija/mj', included: true },
  { text: '1 izvor plaćanja', included: true },
  { text: '1 budžet', included: true },
  { text: 'AI skeniranje računa', included: true },
  { text: 'Projekti i budžeti', included: false },
  { text: 'AI asistent', included: false },
  { text: 'Poslovno praćenje', included: false },
  { text: 'Timski pristup', included: false },
];

const PRO_FEATURES: PlanFeature[] = [
  { text: 'Neograničene transakcije', included: true },
  { text: 'Neograničeni projekti i budžeti', included: true },
  { text: 'Više novčanika i kartica', included: true },
  { text: 'AI financijski asistent', included: true },
  { text: 'CSV/PDF uvoz i izvoz', included: true },
  { text: 'Detaljni izvještaji', included: true },
  { text: 'Dijeljenje i obiteljske grupe', included: true },
  { text: 'Osobno + poslovno praćenje', included: true },
];

const BUSINESS_FEATURES: PlanFeature[] = [
  { text: 'Sve iz Pro plana', included: true },
  { text: 'Radnici i satnice', included: true },
  { text: 'Timski pristup', included: true },
  { text: 'Suradnici na projektima', included: true },
  { text: 'Napredni projekti', included: true },
  { text: 'Višekorisnički pristup', included: true },
];

const LIFETIME_FEATURES: PlanFeature[] = [
  { text: 'Sve iz Pro plana — zauvijek', included: true },
  { text: 'Bez ikakvih mjesečnih troškova', included: true },
  { text: 'Sve buduće Pro značajke', included: true },
  { text: 'Founding Member status', included: true },
  { text: 'Prioritetna podrška', included: true },
  { text: 'Limitirano na 200 korisnika', included: true },
];

const Paywall: React.FC = () => {
  const navigate = useNavigate();
  const { tier: currentTier, subscribed, loading: subLoading, checkSubscription } = useSubscription();

  useEffect(() => {
    if (!subLoading && subscribed) {
      navigate('/home', { replace: true });
    }
  }, [subscribed, subLoading, navigate]);

  const [interval, setInterval] = useState<BillingInterval>('monthly');
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [lifetimeAvail, setLifetimeAvail] = useState<{ remaining: number; total: number; sold: number } | null>(null);

  // Fetch lifetime availability
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
        // business — only monthly/yearly
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
  const periodLabel = interval === 'monthly' ? '/mj' : interval === 'yearly' ? '/god' : 'jednokratno';

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
          <img src={logo} alt="V&M Balance" className="w-full h-full scale-[1.8] object-cover" />
        </div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">
          Vaš 14-dnevni probni period je istekao
        </h1>
        <p className="text-muted-foreground text-sm mt-1.5 max-w-xs mx-auto">
          Odaberite plan za nastavak korištenja V&M Balance
        </p>
      </motion.div>

      {/* Billing interval toggle — 3 opcije */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        className="flex items-center bg-muted/60 rounded-full p-1 mb-6 flex-wrap justify-center gap-1"
      >
        <button
          onClick={() => setInterval('monthly')}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
            interval === 'monthly'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Mjesečno
        </button>
        <button
          onClick={() => setInterval('yearly')}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 flex items-center gap-1.5 ${
            interval === 'yearly'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Godišnje
          <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
            -25%
          </span>
        </button>
        <button
          onClick={() => setInterval('lifetime')}
          disabled={lifetimeSoldOut}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed ${
            interval === 'lifetime'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Crown className="w-3.5 h-3.5" />
          Lifetime
          {lifetimeAvail && lifetimeAvail.remaining > 0 && (
            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-full">
              -75%
            </span>
          )}
        </button>
      </motion.div>

      <div className="w-full max-w-md space-y-4">
        <AnimatePresence mode="wait">
          {isLifetime ? (
            // ============ LIFETIME VIEW ============
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
                Founding Member · Limitirano
              </Badge>

              <div className="flex items-center justify-between mb-3 mt-1">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-md">
                    <Crown className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-base">Pro Lifetime</h2>
                    <p className="text-xs text-muted-foreground">Plati jednom — koristi zauvijek</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-bold">{proLifetime.toFixed(0)}€</span>
                  <span className="text-xs text-muted-foreground block">jednokratno</span>
                </div>
              </div>

              {/* Counter / progress bar */}
              {lifetimeAvail && (
                <div className="mb-4 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-medium text-foreground">
                      {lifetimeSoldOut ? (
                        'Rasprodano'
                      ) : (
                        <>
                          Ostalo <span className="text-amber-600 dark:text-amber-400 font-bold">{lifetimeAvail.remaining}</span> od {lifetimeAvail.total}
                        </>
                      )}
                    </span>
                    <span className="text-muted-foreground">{lifetimeAvail.sold} prodano</span>
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
                💡 Ekvivalent ~16 mjeseci Pro pretplate. Otplati se za godinu i pol.
              </p>

              <div className="space-y-1.5 mb-4">
                {LIFETIME_FEATURES.map((f) => (
                  <div key={f.text} className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span className="text-sm text-foreground">{f.text}</span>
                  </div>
                ))}
              </div>

              <Button
                className="w-full rounded-xl h-11 text-sm bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white border-0 shadow-md disabled:opacity-50"
                onClick={() => handleCheckout('lifetime')}
                disabled={loadingTier !== null || lifetimeSoldOut}
              >
                {loadingTier === 'lifetime' && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                {lifetimeSoldOut ? 'Rasprodano' : `Postani Founding Member · ${proLifetime.toFixed(0)}€`}
              </Button>

              <button
                onClick={() => setInterval('monthly')}
                className="w-full text-xs text-muted-foreground hover:text-foreground mt-3 underline-offset-2 hover:underline"
              >
                Vrati se na mjesečne planove
              </button>
            </motion.div>
          ) : (
            // ============ MONTHLY / YEARLY VIEW ============
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
                      <h2 className="font-semibold text-base">Free</h2>
                      <p className="text-xs text-muted-foreground">Za početak</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-bold">0€</span>
                    <span className="text-xs text-muted-foreground block">zauvijek</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mb-4">
                  {FREE_FEATURES.map((f) => (
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
                    toast.info('Free plan dolazi uskoro');
                  }}
                >
                  Nastavi besplatno
                </Button>
              </div>

              {/* Pro Plan — Najpopularniji */}
              <div className="rounded-2xl border-2 border-primary bg-card p-5 relative shadow-lg shadow-primary/5">
                <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-semibold px-3 py-0.5 bg-primary text-primary-foreground">
                  Najpopularniji
                </Badge>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Zap className="w-4.5 h-4.5 text-primary" />
                    </div>
                    <div>
                      <h2 className="font-semibold text-base">Pro</h2>
                      <p className="text-xs text-muted-foreground">Za većinu ljudi</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-bold">{proPrice.toFixed(2)}€</span>
                    <span className="text-xs text-muted-foreground block">{periodLabel}</span>
                  </div>
                </div>
                {interval === 'yearly' && (
                  <p className="text-xs text-primary mb-3 font-medium">
                    Ušteda {((proMonthly * 12) - proYearly).toFixed(2)}€ godišnje (~25%)
                  </p>
                )}
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mb-4">
                  {PRO_FEATURES.map((f) => (
                    <div key={f.text} className="flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="text-xs text-foreground">{f.text}</span>
                    </div>
                  ))}
                </div>
                <Button
                  className="w-full rounded-xl h-10 text-sm bg-primary hover:bg-primary/90"
                  onClick={() => handleCheckout('pro')}
                  disabled={loadingTier !== null}
                >
                  {loadingTier === 'pro' && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  Odaberi Pro
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
                      <h2 className="font-semibold text-base">Business</h2>
                      <p className="text-xs text-muted-foreground">Za ozbiljne korisnike</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-bold">{bizPrice.toFixed(2)}€</span>
                    <span className="text-xs text-muted-foreground block">{periodLabel}</span>
                  </div>
                </div>
                {interval === 'yearly' && (
                  <p className="text-xs text-primary mb-3 font-medium">
                    Ušteda {((bizMonthly * 12) - bizYearly).toFixed(2)}€ godišnje (~25%)
                  </p>
                )}
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mb-4">
                  {BUSINESS_FEATURES.map((f) => (
                    <div key={f.text} className="flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="text-xs text-foreground">{f.text}</span>
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
                  Odaberi Business
                </Button>
              </div>

              {/* Teaser za Lifetime */}
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
                        Pro Lifetime · {proLifetime.toFixed(0)}€
                        <Sparkles className="w-3 h-3 text-amber-500" />
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Plati jednom · Još {lifetimeAvail.remaining} mjesta
                      </p>
                    </div>
                    <span className="text-xs text-amber-600 dark:text-amber-400 font-medium group-hover:underline">
                      Pogledaj →
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
            Sigurno plaćanje putem Stripe. Otkazivanje u bilo kojem trenutku.
          </p>
          <button
            onClick={() => navigate('/auth')}
            className="text-xs text-primary hover:underline"
          >
            Prijavite se s drugim računom
          </button>
        </motion.div>
      </div>
    </div>
  );
};

export default Paywall;
