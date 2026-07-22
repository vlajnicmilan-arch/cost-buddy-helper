/**
 * ModuleUpgradeDialog — prodajni dijalog koji zamjenjuje ranije
 * `showError` toast pri kliku na zaključani modul.
 *
 * UX pravilo: NIKAD ne prikazujemo tehničku grešku kad user "udari" u
 * paywall. Cijena, vrijednost i CTA moraju biti prvi dodir.
 *
 * Trial: čitamo POSTOJEĆE `user_entitlements` redove sa `source='trial'`
 * i samo prikazujemo status (aktivan / iskorišten / nije dostupan).
 * Aktivacija triala trenutno postoji SAMO kao trigger na `auth.users`
 * INSERT (30 dana za smjer/krug/projekti). Nema manual re-activation
 * RPC-a — ovaj dijalog ne izmišlja novu logiku dok Milan ne potvrdi.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Users, FolderKanban, Building2, Sparkles, Loader2, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { usePaddlePrices, type PaywallPlan } from '@/hooks/usePaddlePrices';

export type UpgradeModule = 'krug' | 'projects' | 'business';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  module: UpgradeModule;
}

const MODULE_META: Record<UpgradeModule, {
  icon: typeof Users;
  paywallPlan: PaywallPlan | null;
  entitlementKey: 'krug' | 'projekti' | 'biznis';
  titleKey: string; titleFallback: string;
  valueKey: string; valueFallback: string;
  iconClass: string; iconBg: string;
}> = {
  krug: {
    icon: Users,
    paywallPlan: 'krug',
    entitlementKey: 'krug',
    titleKey: 'moduleUpgrade.krug.title', titleFallback: 'Krug',
    valueKey: 'moduleUpgrade.krug.value',
    valueFallback: 'Dijeli troškove, budžete i projekte s obitelji ili timom — bez ručnog usklađivanja.',
    iconClass: 'text-teal-600', iconBg: 'bg-teal-500/10',
  },
  projects: {
    icon: FolderKanban,
    paywallPlan: 'projekti',
    entitlementKey: 'projekti',
    titleKey: 'moduleUpgrade.projekti.title', titleFallback: 'Projekti',
    valueKey: 'moduleUpgrade.projekti.value',
    valueFallback: 'Vodi projekte s budžetom, milestone-ima, radnicima i P&L pregledom — jedno mjesto za sve.',
    iconClass: 'text-primary', iconBg: 'bg-primary/10',
  },
  business: {
    icon: Building2,
    paywallPlan: null, // biznis još nije u prodaji
    entitlementKey: 'biznis',
    titleKey: 'moduleUpgrade.biznis.title', titleFallback: 'Biznis',
    valueKey: 'moduleUpgrade.biznis.value',
    valueFallback: 'Poslovna terminologija, profili tvrtki i R1 računi. Uskoro.',
    iconClass: 'text-amber-600', iconBg: 'bg-amber-500/10',
  },
};

type TrialState =
  | { kind: 'loading' }
  | { kind: 'none' }         // za taj modul ne postoji trial red (npr. biznis)
  | { kind: 'active'; until: string }
  | { kind: 'used' };        // trial red postoji ali istekao / neaktivan

export const ModuleUpgradeDialog = ({ open, onOpenChange, module }: Props) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { prices, loading: pricesLoading } = usePaddlePrices();
  const meta = MODULE_META[module];
  const Icon = meta.icon;

  const [trial, setTrial] = useState<TrialState>({ kind: 'loading' });

  useEffect(() => {
    if (!open || !user?.id) return;
    let cancelled = false;
    setTrial({ kind: 'loading' });
    (async () => {
      const { data } = await supabase
        .from('user_entitlements')
        .select('status, period_end')
        .eq('user_id', user.id)
        .eq('module', meta.entitlementKey)
        .eq('source', 'trial')
        .maybeSingle();
      if (cancelled) return;
      if (!data) { setTrial({ kind: 'none' }); return; }
      const active = data.status === 'active' &&
        (!data.period_end || new Date(data.period_end).getTime() > Date.now());
      setTrial(active
        ? { kind: 'active', until: data.period_end ?? '' }
        : { kind: 'used' });
    })();
    return () => { cancelled = true; };
  }, [open, user?.id, meta.entitlementKey]);

  const monthlyPrice = meta.paywallPlan ? prices[meta.paywallPlan]?.monthly : undefined;
  // Sticker prices (kept in sync s Paywall.tsx). paddle_price_map daje samo price_id.
  const STICKER: Record<PaywallPlan, number> = { smjer: 5.99, krug: 9.99, projekti: 21.99, komplet: 25.99 };
  const displayPrice = meta.paywallPlan ? STICKER[meta.paywallPlan] : null;

  const goPaywall = () => {
    onOpenChange(false);
    // ?plan= je hint; Paywall trenutno ne razdvaja, ali ostavljamo za budući highlight.
    navigate(meta.paywallPlan ? `/paywall?plan=${meta.paywallPlan}` : '/paywall');
  };

  const trialLabel = () => {
    if (trial.kind === 'loading') return null;
    if (trial.kind === 'active') return t('moduleUpgrade.trial.active', 'Probno razdoblje aktivno');
    if (trial.kind === 'used') return t('moduleUpgrade.trial.used', 'Probno razdoblje iskorišteno');
    return t('moduleUpgrade.trial.unavailable', 'Probno razdoblje nije dostupno');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${meta.iconBg}`}>
              <Icon className={`w-5 h-5 ${meta.iconClass}`} />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-lg">
                {t(meta.titleKey, meta.titleFallback)}
              </DialogTitle>
              {displayPrice !== null ? (
                <DialogDescription className="text-sm">
                  <span className="font-semibold text-foreground">{displayPrice.toFixed(2)}€</span>
                  {' '}<span className="text-muted-foreground">/ {t('moduleUpgrade.perMonth', 'mjesečno')}</span>
                  <span className="text-muted-foreground"> · {t('moduleUpgrade.yearlyHint', 'godišnje = 2 mj. gratis')}</span>
                </DialogDescription>
              ) : (
                <DialogDescription className="text-sm text-muted-foreground">
                  {t('moduleUpgrade.biznisComingSoon', 'Uskoro dostupno')}
                </DialogDescription>
              )}
            </div>
          </div>
        </DialogHeader>

        <p className="text-sm text-foreground/90 leading-relaxed pt-1">
          {t(meta.valueKey, meta.valueFallback)}
        </p>

        {/* Trial status — informativno, bez aktivacije (čeka Milanovu potvrdu). */}
        <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs flex items-center gap-2">
          {trial.kind === 'loading' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
          ) : trial.kind === 'active' ? (
            <Check className="w-3.5 h-3.5 text-primary" />
          ) : (
            <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
          )}
          <span className="text-muted-foreground">{trialLabel()}</span>
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-between gap-2 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="sm:w-auto w-full">
            {t('moduleUpgrade.notNow', 'Ne sada')}
          </Button>
          {meta.paywallPlan ? (
            <Button
              onClick={goPaywall}
              disabled={pricesLoading}
              className="sm:w-auto w-full gap-2"
            >
              <Sparkles className="w-4 h-4" />
              {t('moduleUpgrade.unlockCta', 'Otključaj')} {t(meta.titleKey, meta.titleFallback)}
            </Button>
          ) : (
            <Button disabled className="sm:w-auto w-full">
              {t('moduleUpgrade.comingSoonCta', 'Uskoro')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
