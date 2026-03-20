import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { TIERS, SubscriptionTier } from '@/lib/subscriptionTiers';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check, Crown, Building2, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

type BillingInterval = 'monthly' | 'yearly';

const Paywall: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { subscribed, loading } = useSubscription();

  // Redirect to home if subscription becomes active
  useEffect(() => {
    if (!loading && subscribed) {
      navigate('/', { replace: true });
    }
  }, [subscribed, loading, navigate]);
  const { tier: currentTier, subscribed } = useSubscription();
  const [interval, setInterval] = useState<BillingInterval>('monthly');
  const [loadingTier, setLoadingTier] = useState<string | null>(null);

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
      toast.error('Greška pri pokretanju naplate');
    } finally {
      setLoadingTier(null);
    }
  };

  const handleManageSubscription = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('customer-portal');
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, '_blank');
      }
    } catch (err) {
      console.error('Portal error:', err);
      toast.error('Greška pri otvaranju portala');
    }
  };

  const proFeatures = [
    'Neograničen broj transakcija',
    'Neograničeni budžeti',
    'Neograničene ponavljajuće transakcije',
    'CSV/PDF uvoz i izvoz',
    'Detaljni izvještaji i grafovi',
    'AI financijski asistent',
    'Dijeljenje budžeta i izvora',
    'Obiteljske grupe',
  ];

  const businessFeatures = [
    'Sve iz Pro plana',
    'Poslovni profili',
    'Fakturiranje i klijenti',
    'PDV evidencija',
    'Upravljanje zalihama',
    'Radnici i evidencija rada',
    'Poslovni projekti',
    'Putni nalozi',
  ];

  return (
    <div className="min-h-dvh bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-foreground">
            Vaš probni period je istekao
          </h1>
          <p className="text-muted-foreground text-sm">
            Odaberite plan koji vam najbolje odgovara za nastavak korištenja V&M Balance
          </p>
        </div>

        {/* Billing toggle */}
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setInterval('monthly')}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              interval === 'monthly'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            Mjesečno
          </button>
          <button
            onClick={() => setInterval('yearly')}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              interval === 'yearly'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            Godišnje
            <Badge variant="secondary" className="ml-1.5 text-[10px]">-17%</Badge>
          </button>
        </div>

        {/* Pro Plan */}
        <Card className="p-5 border-2 border-primary/20 relative">
          <div className="flex items-center gap-2 mb-3">
            <Crown className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-lg">Pro</h2>
            {currentTier === 'pro' && subscribed && (
              <Badge variant="default" className="text-xs">Vaš plan</Badge>
            )}
          </div>
          <div className="mb-4">
            <span className="text-3xl font-bold">
              {TIERS.pro.prices[interval].amount.toFixed(2)}€
            </span>
            <span className="text-muted-foreground text-sm">
              /{interval === 'monthly' ? 'mj' : 'god'}
            </span>
          </div>
          <ul className="space-y-2 mb-5">
            {proFeatures.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm">
                <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
          {currentTier === 'pro' && subscribed ? (
            <Button variant="outline" className="w-full" onClick={handleManageSubscription}>
              Upravljaj pretplatom
            </Button>
          ) : (
            <Button
              className="w-full"
              onClick={() => handleCheckout('pro')}
              disabled={loadingTier !== null}
            >
              {loadingTier === 'pro' ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Odaberi Pro
            </Button>
          )}
        </Card>

        {/* Business Plan */}
        <Card className="p-5 border-2 border-primary relative">
          <Badge className="absolute -top-2.5 right-4 text-xs">Najpopularniji</Badge>
          <div className="flex items-center gap-2 mb-3">
            <Building2 className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-lg">Business</h2>
            {currentTier === 'business' && subscribed && (
              <Badge variant="default" className="text-xs">Vaš plan</Badge>
            )}
          </div>
          <div className="mb-4">
            <span className="text-3xl font-bold">
              {TIERS.business.prices[interval].amount.toFixed(2)}€
            </span>
            <span className="text-muted-foreground text-sm">
              /{interval === 'monthly' ? 'mj' : 'god'}
            </span>
          </div>
          <ul className="space-y-2 mb-5">
            {businessFeatures.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm">
                <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
          {currentTier === 'business' && subscribed ? (
            <Button variant="outline" className="w-full" onClick={handleManageSubscription}>
              Upravljaj pretplatom
            </Button>
          ) : (
            <Button
              className="w-full"
              onClick={() => handleCheckout('business')}
              disabled={loadingTier !== null}
            >
              {loadingTier === 'business' ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Odaberi Business
            </Button>
          )}
        </Card>
      </div>
    </div>
  );
};

export default Paywall;
