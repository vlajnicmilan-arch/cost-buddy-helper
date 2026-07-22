/**
 * ModuleUpgradeDialog — prodajni dijalog za zaključane module.
 *
 * Trial politika B (Milan odobrio):
 * - 30 dana probno PO MODULU, isključivo na svjesnu aktivaciju korisnika.
 * - Nema automatskog triala na registraciji.
 * - Aktivacija ide preko RPC-a `activate_module_trial(_module)`; jednokratno.
 * - Ako je trial već iskorišten (aktivan ili istekao) — nema ponovne aktivacije.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Users, FolderKanban, Building2, Sparkles, Loader2, Check, ArrowLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { usePaddlePrices, type PaywallPlan } from '@/hooks/usePaddlePrices';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';

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
  trialModule: 'smjer' | 'krug' | 'projekti' | null;
  titleKey: string; titleFallback: string;
  valueKey: string; valueFallback: string;
  iconClass: string; iconBg: string;
}> = {
  krug: {
    icon: Users,
    paywallPlan: 'krug',
    entitlementKey: 'krug',
    trialModule: 'krug',
    titleKey: 'moduleUpgrade.krug.title', titleFallback: 'Krug',
    valueKey: 'moduleUpgrade.krug.value',
    valueFallback: 'Dijeli troškove, budžete i projekte s obitelji ili timom — bez ručnog usklađivanja.',
    iconClass: 'text-teal-600', iconBg: 'bg-teal-500/10',
  },
  projects: {
    icon: FolderKanban,
    paywallPlan: 'projekti',
    entitlementKey: 'projekti',
    trialModule: 'projekti',
    titleKey: 'moduleUpgrade.projekti.title', titleFallback: 'Projekti',
    valueKey: 'moduleUpgrade.projekti.value',
    valueFallback: 'Vodi projekte s budžetom, milestone-ima, radnicima i P&L pregledom — jedno mjesto za sve.',
    iconClass: 'text-primary', iconBg: 'bg-primary/10',
  },
  business: {
    icon: Building2,
    paywallPlan: null, // biznis još nije u prodaji
    entitlementKey: 'biznis',
    trialModule: null, // biznis NEMA trial
    titleKey: 'moduleUpgrade.biznis.title', titleFallback: 'Biznis',
    valueKey: 'moduleUpgrade.biznis.value',
    valueFallback: 'Poslovna terminologija, profili tvrtki i R1 računi. Uskoro.',
    iconClass: 'text-amber-600', iconBg: 'bg-amber-500/10',
  },
};

type TrialState =
  | { kind: 'loading' }
  | { kind: 'none' }         // trial dostupan za aktivaciju
  | { kind: 'active'; until: string }
  | { kind: 'used'; until: string | null }
  | { kind: 'unavailable' }; // biznis — nema trial politike

export const ModuleUpgradeDialog = ({ open, onOpenChange, module }: Props) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { checkSubscription } = useSubscription();
  const { prices, loading: pricesLoading } = usePaddlePrices();
  const meta = MODULE_META[module];
  const Icon = meta.icon;

  const [trial, setTrial] = useState<TrialState>({ kind: 'loading' });
  const [confirming, setConfirming] = useState(false);
  const [activating, setActivating] = useState(false);

  useEffect(() => {
    if (!open) { setConfirming(false); return; }
    if (!user?.id) return;
    if (!meta.trialModule) { setTrial({ kind: 'unavailable' }); return; }
    let cancelled = false;
    setTrial({ kind: 'loading' });
    (async () => {
      const { data } = await supabase
        .from('user_entitlements')
        .select('status, period_end')
        .eq('user_id', user.id)
        .eq('module', meta.trialModule!)
        .eq('source', 'trial')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (!data) { setTrial({ kind: 'none' }); return; }
      const active = data.status === 'active' &&
        (!data.period_end || new Date(data.period_end).getTime() > Date.now());
      setTrial(active
        ? { kind: 'active', until: data.period_end ?? '' }
        : { kind: 'used', until: data.period_end ?? null });
    })();
    return () => { cancelled = true; };
  }, [open, user?.id, meta.trialModule]);

  const monthlyPrice = meta.paywallPlan ? prices[meta.paywallPlan]?.monthly : undefined;
  const STICKER: Record<PaywallPlan, number> = { smjer: 5.99, krug: 9.99, projekti: 21.99, komplet: 25.99 };
  const displayPrice = meta.paywallPlan ? STICKER[meta.paywallPlan] : null;

  const goPaywall = () => {
    onOpenChange(false);
    navigate(meta.paywallPlan ? `/paywall?plan=${meta.paywallPlan}` : '/paywall');
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return '';
    try { return new Date(iso).toLocaleDateString(i18n.language || 'hr'); } catch { return ''; }
  };

  const trialEndPreview = () => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toLocaleDateString(i18n.language || 'hr');
  };

  const handleActivateTrial = async () => {
    if (!meta.trialModule) return;
    setActivating(true);
    try {
      const { data, error } = await supabase.rpc('activate_module_trial', { _module: meta.trialModule });
      if (error) throw error;
      const payload = (data ?? {}) as { activated?: boolean; already_used?: boolean; period_end?: string };
      const until = payload.period_end ?? null;
      // Osvježi subscription stanje (isti mehanizam kao checkout success) — modul se otključa bez odjave.
      await checkSubscription();
      if (payload.already_used) {
        setTrial({ kind: 'used', until });
        setConfirming(false);
      } else {
        setTrial({ kind: 'active', until: until ?? '' });
        showSuccess(t('moduleUpgrade.trial.activatedToast', 'Probno aktivno do {{date}}', { date: formatDate(until) }));
        onOpenChange(false);
      }
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (/invalid_module/.test(msg)) {
        showError(t('moduleUpgrade.trial.errorInvalid', 'Probno razdoblje nije dostupno za ovaj modul.'));
      } else if (/not_authenticated/.test(msg)) {
        showError(t('moduleUpgrade.trial.errorAuth', 'Prijava je istekla. Osvježi stranicu.'));
      } else {
        showError(t('moduleUpgrade.trial.errorGeneric', 'Aktivacija nije uspjela. Pokušaj ponovno.'));
      }
    } finally {
      setActivating(false);
    }
  };

  const canOfferTrial = trial.kind === 'none';
  const trialActive = trial.kind === 'active';
  const trialUsed = trial.kind === 'used';

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

        {!confirming && (
          <p className="text-sm text-foreground/90 leading-relaxed pt-1">
            {t(meta.valueKey, meta.valueFallback)}
          </p>
        )}

        {/* Confirm korak za aktivaciju triala */}
        {confirming && meta.trialModule && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Sparkles className="w-4 h-4 text-primary" />
              {t('moduleUpgrade.trial.confirmTitle', 'Aktivirati probno razdoblje?')}
            </div>
            <p className="text-sm text-foreground/85 leading-relaxed">
              {t('moduleUpgrade.trial.confirmBody', 'Probno razdoblje za {{module}} počinje ODMAH i traje do {{date}}. Može se aktivirati samo jednom.', {
                module: t(meta.titleKey, meta.titleFallback),
                date: trialEndPreview(),
              })}
            </p>
          </div>
        )}

        {/* Trial status */}
        {!confirming && (
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs flex items-center gap-2">
            {trial.kind === 'loading' ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                <span className="text-muted-foreground">…</span>
              </>
            ) : trialActive ? (
              <>
                <Check className="w-3.5 h-3.5 text-primary" />
                <span className="text-muted-foreground">
                  {t('moduleUpgrade.trial.activeUntil', 'Probno aktivno do {{date}}', { date: formatDate(trial.until) })}
                </span>
              </>
            ) : trialUsed ? (
              <>
                <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">
                  {t('moduleUpgrade.trial.usedUntil', 'Probno razdoblje iskorišteno (isteklo {{date}})', { date: formatDate(trial.until) })}
                </span>
              </>
            ) : trial.kind === 'unavailable' ? (
              <>
                <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">{t('moduleUpgrade.trial.unavailable', 'Probno razdoblje nije dostupno')}</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span className="text-muted-foreground">
                  {t('moduleUpgrade.trial.availableHint', '30 dana besplatno — aktiviraj jednim klikom')}
                </span>
              </>
            )}
          </div>
        )}

        <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-between gap-2 pt-2">
          {confirming ? (
            <>
              <Button
                variant="ghost"
                onClick={() => setConfirming(false)}
                disabled={activating}
                className="sm:w-auto w-full gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                {t('moduleUpgrade.trial.cancel', 'Odustani')}
              </Button>
              <Button
                onClick={handleActivateTrial}
                disabled={activating}
                className="sm:w-auto w-full gap-2"
              >
                {activating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {t('moduleUpgrade.trial.confirmCta', 'Aktiviraj')}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)} className="sm:w-auto w-full">
                {t('moduleUpgrade.notNow', 'Ne sada')}
              </Button>
              <div className="flex flex-col sm:flex-row gap-2 sm:w-auto w-full">
                {canOfferTrial && (
                  <Button
                    variant="outline"
                    onClick={() => setConfirming(true)}
                    className="sm:w-auto w-full gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    {t('moduleUpgrade.trial.tryCta', 'Isprobaj besplatno 30 dana')}
                  </Button>
                )}
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
              </div>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
