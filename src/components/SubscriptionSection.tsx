import { useSubscription } from '@/contexts/SubscriptionContext';
import { useStorage } from '@/contexts/StorageContext';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Crown, Zap, Building2, Loader2, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { showError } from '@/hooks/useStatusFeedback';
import { format } from 'date-fns';

export const SubscriptionSection = () => {
  const { t } = useTranslation();
  const { tier, subscribed, trialActive, trialDaysRemaining, subscriptionEnd, source, loading } = useSubscription();
  const { storageMode } = useStorage();
  const { session } = useAuth();
  const navigate = useNavigate();
  const [portalLoading, setPortalLoading] = useState(false);

  if (storageMode !== 'cloud') return null;

  const handleManageSubscription = async () => {
    if (!session?.access_token) return;
    setPortalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('customer-portal', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, '_blank');
      }
    } catch (err) {
      console.error('Portal error:', err);
      showError(t('subscription.portalError', 'Greška pri otvaranju portala za upravljanje pretplatom'));
    } finally {
      setPortalLoading(false);
    }
  };

  const tierConfig = {
    free: { label: 'Free', icon: Crown, color: 'text-muted-foreground', bg: 'bg-muted/50' },
    pro: { label: 'Pro', icon: Zap, color: 'text-primary', bg: 'bg-primary/10' },
    business: { label: 'Business', icon: Building2, color: 'text-primary', bg: 'bg-primary/10' },
  };

  const config = tierConfig[tier] || tierConfig.free;
  const Icon = config.icon;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <Separator />
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          {t('subscription.title', 'Pretplata')}
        </h3>

        <div className="p-3 bg-muted/30 rounded-xl space-y-3">
          {/* Current plan */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg ${config.bg} flex items-center justify-center`}>
                <Icon className={`w-4 h-4 ${config.color}`} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{config.label}</span>
                  {trialActive && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      Trial
                    </Badge>
                  )}
                  {subscribed && source === 'admin' && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      Admin
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {trialActive
                    ? t('subscription.trialRemaining', `Još ${trialDaysRemaining} dana triala`)
                    : subscribed && subscriptionEnd
                      ? `${t('subscription.renewsOn', 'Obnavlja se')} ${format(new Date(subscriptionEnd), 'dd.MM.yyyy.')}`
                      : t('subscription.freePlan', 'Besplatni plan')
                  }
                </p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            {!subscribed && !trialActive && (
              <Button
                size="sm"
                className="flex-1 rounded-lg gap-1.5"
                onClick={() => { navigate('/paywall'); }}
              >
                <Zap className="w-3.5 h-3.5" />
                {t('subscription.upgrade', 'Nadogradi')}
              </Button>
            )}
            {!subscribed && trialActive && (
              <Button
                size="sm"
                className="flex-1 rounded-lg gap-1.5"
                onClick={() => { navigate('/paywall'); }}
              >
                <Zap className="w-3.5 h-3.5" />
                {t('subscription.choosePlan', 'Odaberi plan')}
              </Button>
            )}
            {subscribed && source === 'stripe' && (
              <Button
                size="sm"
                variant="outline"
                className="flex-1 rounded-lg gap-1.5"
                onClick={handleManageSubscription}
                disabled={portalLoading}
              >
                {portalLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ExternalLink className="w-3.5 h-3.5" />
                )}
                {t('subscription.manage', 'Upravljaj pretplatom')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
