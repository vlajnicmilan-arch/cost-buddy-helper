import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { TIERS } from '@/lib/subscriptionTiers';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Loader2, Shield, Zap, Building2, X } from 'lucide-react';
import { toast } from 'sonner';
import { showError } from '@/hooks/useStatusFeedback';
import { motion } from 'framer-motion';
import logo from '@/assets/logo.png';

type BillingInterval = 'monthly' | 'yearly';

interface PlanFeature {
  text: string;
  included: boolean;
}

const FREE_FEATURES: PlanFeature[] = [
  { text: 'Do 30 transakcija/mj', included: true },
  { text: '1 izvor plaćanja', included: true },
  { text: '1 budžet', included: true },
  { text: 'Skeniranje računa (5/mj)', included: true },
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

  useEffect(() => {
    if (loadingTier) return;
    const handle = window.setInterval(() => {
      checkSubscription();
    }, 5000);
    return () => window.clearInterval(handle);
  }, [loadingTier, checkSubscription]);

  const handleCheckout = async (tier: 'pro' | 'business') => {
    setLoadingTier(tier);
    try {
      const priceId = TIERS[tier].prices[interval].id;
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { priceId },
      });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, '_blank');
      }
    } catch (err) {
      console.error('Checkout error:', err);
      showError('Greška pri pokretanju naplate');
    } finally {
      setLoadingTier(null);
    }
  };

  const proMonthly = TIERS.pro.prices.monthly.amount;
  const proYearly = TIERS.pro.prices.yearly.amount;
  const bizMonthly = TIERS.business.prices.monthly.amount;
  const bizYearly = TIERS.business.prices.yearly.amount;

  const proPrice = interval === 'monthly' ? proMonthly : proYearly;
  const bizPrice = interval === 'monthly' ? bizMonthly : bizYearly;
  const periodLabel = interval === 'monthly' ? '/mj' : '/god';

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
          Vaš probni period je istekao
        </h1>
        <p className="text-muted-foreground text-sm mt-1.5 max-w-xs mx-auto">
          Odaberite plan za nastavak korištenja V&M Balance
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        className="flex items-center bg-muted/60 rounded-full p-1 mb-6"
      >
        <button
          onClick={() => setInterval('monthly')}
          className={`px-5 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
            interval === 'monthly'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Mjesečno
        </button>
        <button
          onClick={() => setInterval('yearly')}
          className={`px-5 py-2 rounded-full text-sm font-medium transition-all duration-200 flex items-center gap-1.5 ${
            interval === 'yearly'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Godišnje
          <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
            -17%
          </span>
        </button>
      </motion.div>

      <div className="w-full max-w-md space-y-4">
        {/* Free Plan */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="rounded-2xl border border-border/60 bg-card p-5"
        >
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
                  <X className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
                )}
                <span className={`text-xs ${f.included ? 'text-foreground' : 'text-muted-foreground/50 line-through'}`}>
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
        </motion.div>

        {/* Pro Plan — Najpopularniji */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="rounded-2xl border-2 border-primary bg-card p-5 relative shadow-lg shadow-primary/5"
        >
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
            <p className="text-xs text-primary mb-3">
              Ušteda {((proMonthly * 12) - proYearly).toFixed(2)}€ godišnje
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
        </motion.div>

        {/* Business Plan */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="rounded-2xl border-2 border-primary/30 bg-card p-5 relative"
        >
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
            <p className="text-xs text-primary mb-3">
              Ušteda {((bizMonthly * 12) - bizYearly).toFixed(2)}€ godišnje
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
        </motion.div>

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
