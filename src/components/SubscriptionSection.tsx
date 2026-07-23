import { useEffect, useState } from 'react';
import { useStorage } from '@/contexts/StorageContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Compass, Users, FolderKanban, Building2, Loader2, Zap, ShieldCheck, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { hr as hrLocale } from 'date-fns/locale';
import { showError } from '@/hooks/useStatusFeedback';

type Module = 'smjer' | 'krug' | 'projekti' | 'biznis';

interface EntitlementRow {
  module: Module;
  source: 'paddle' | 'trial' | 'admin_grant' | 'migration';
  status: string;
  period_end: string | null;
  billing_cycle: 'monthly' | 'yearly' | 'lifetime' | 'trial' | null;
  metadata: Record<string, unknown> | null;
}

const MODULE_META: Record<Module, { icon: typeof Compass; nameKey: string; defaultName: string }> = {
  smjer:    { icon: Compass,      nameKey: 'subscription.module.smjer',    defaultName: 'Smjer' },
  krug:     { icon: Users,        nameKey: 'subscription.module.krug',     defaultName: 'Krug' },
  projekti: { icon: FolderKanban, nameKey: 'subscription.module.projekti', defaultName: 'Projekti' },
  biznis:   { icon: Building2,    nameKey: 'subscription.module.biznis',   defaultName: 'Biznis' },
};

export const SubscriptionSection = () => {
  const { t } = useTranslation();
  const { storageMode } = useStorage();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [rows, setRows] = useState<EntitlementRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) return;

    const load = async () => {
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from('user_entitlements')
        .select('module, source, status, period_end, billing_cycle, metadata')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .or(`period_end.is.null,period_end.gt.${nowIso}`);

      if (cancelled) return;
      if (error) {
        setRows([]);
      } else {
        const filtered = (data || []).filter((r: any) =>
          ['smjer', 'krug', 'projekti', 'biznis'].includes(r.module)
        );
        const rank = (s: string) =>
          s === 'paddle' ? 4 : s === 'admin_grant' ? 3 : s === 'migration' ? 2 : 1;
        const byModule = new Map<Module, EntitlementRow>();
        filtered.forEach((r: any) => {
          const cur = byModule.get(r.module as Module);
          if (!cur || rank(r.source) > rank(cur.source)) {
            byModule.set(r.module as Module, r as EntitlementRow);
          }
        });
        setRows(Array.from(byModule.values()));
      }
      setLoading(false);
    };

    load();
    return () => { cancelled = true; };
  }, [user?.id]);

  if (storageMode !== 'cloud') return null;

  const hasPaddle = !!rows?.some((r) => r.source === 'paddle');

  const openPortal = async () => {
    setPortalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('paddle-portal-url', {
        method: 'POST',
      });
      const url = (data as { url?: string } | null)?.url;
      if (error || !url) {
        showError(t('subscription.portalError', 'Nije moguće otvoriti Paddle portal. Pokušajte kasnije ili nam pišite na support@vmbalance.com.'));
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      showError(t('subscription.portalError', 'Nije moguće otvoriti Paddle portal. Pokušajte kasnije ili nam pišite na support@vmbalance.com.'));
    } finally {
      setPortalLoading(false);
    }
  };

  const sourceLabel = (r: EntitlementRow) => {
    switch (r.source) {
      case 'paddle':      return t('subscription.source.paddle', 'Pretplata');
      case 'trial':       return t('subscription.source.trial', 'Probno razdoblje');
      case 'admin_grant': return t('subscription.source.admin', 'Admin dodijeljeno');
      case 'migration':   return t('subscription.source.migration', 'Naslijeđeno');
    }
  };

  const cycleLabel = (r: EntitlementRow) => {
    if (r.source === 'trial') return null;
    switch (r.billing_cycle) {
      case 'monthly':  return t('subscription.cycle.monthly', 'mjesečno');
      case 'yearly':   return t('subscription.cycle.yearly', 'godišnje');
      case 'lifetime': return t('subscription.cycle.lifetime', 'trajno');
      default:         return null;
    }
  };

  const scheduledCancelAt = (r: EntitlementRow): string | null => {
    const m = r.metadata as { scheduled_cancel_at?: string } | null;
    return m?.scheduled_cancel_at ?? null;
  };

  return (
    <>
      <Separator />
      <div className="space-y-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            {t('subscription.title', 'Pretplata')}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t('subscription.subtitle', 'Stanje po modulima. Otkaz, promjena kartice i računi dostupni su preko Paddle portala.')}
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center p-4">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : !rows || rows.length === 0 ? (
          <div className="p-3 bg-muted/30 rounded-xl space-y-3">
            <p className="text-sm text-muted-foreground">
              {t('subscription.none', 'Nemaš aktivnih pretplata.')}
            </p>
            <Button
              size="sm"
              className="rounded-lg gap-1.5"
              onClick={() => { navigate('/paywall'); }}
            >
              <Zap className="w-3.5 h-3.5" />
              {t('subscription.viewPricing', 'Pogledaj cjenik')}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {(['smjer', 'krug', 'projekti', 'biznis'] as Module[]).map((m) => {
              const r = rows.find((x) => x.module === m);
              if (!r) return null;
              const meta = MODULE_META[m];
              const Icon = meta.icon;
              const cycle = cycleLabel(r);
              const isTrial = r.source === 'trial';
              const isAdmin = r.source === 'admin_grant';
              const cancelAt = scheduledCancelAt(r);
              return (
                <div
                  key={m}
                  className="flex items-start gap-3 p-3 bg-muted/30 rounded-xl"
                >
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-medium">{t(meta.nameKey, meta.defaultName)}</span>
                      {isTrial && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {t('subscription.badge.trial', 'Trial')}
                        </Badge>
                      )}
                      {isAdmin && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-1">
                          <ShieldCheck className="w-2.5 h-2.5" />
                          {t('subscription.badge.admin', 'Admin')}
                        </Badge>
                      )}
                      {cancelAt && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/50 text-amber-600 dark:text-amber-400">
                          {t('subscription.badge.scheduledCancel', 'Otkazano')}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {sourceLabel(r)}
                      {cycle ? ` · ${cycle}` : ''}
                      {cancelAt
                        ? ` · ${t('subscription.activeUntil', 'aktivno do')} ${format(new Date(cancelAt), 'dd.MM.yyyy.', { locale: hrLocale })}`
                        : r.period_end
                        ? ` · ${t('subscription.validUntil', 'vrijedi do')} ${format(new Date(r.period_end), 'dd.MM.yyyy.', { locale: hrLocale })}`
                        : ''}
                    </p>
                  </div>
                </div>
              );
            })}

            {hasPaddle && (
              <div className="pt-1 space-y-1">
                <Button
                  size="sm"
                  className="rounded-lg gap-1.5 w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={openPortal}
                  disabled={portalLoading}
                >
                  {portalLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ExternalLink className="w-3.5 h-3.5" />
                  )}
                  {t('subscription.managePortal', 'Upravljaj pretplatom')}
                </Button>
                <p className="text-[11px] text-muted-foreground px-1">
                  {t(
                    'subscription.portalHint',
                    'Otvara Paddle — otkaži, promijeni karticu ili preuzmi račune.'
                  )}
                </p>
              </div>
            )}

            <p className="text-[11px] text-muted-foreground px-1 pt-1">
              {t(
                'subscription.cancelHint',
                'Otkazivanje, promjena kartice i računi — gumb Upravljaj pretplatom iznad. Za pitanja pišite na support@vmbalance.com.'
              )}
            </p>
          </div>
        )}
      </div>
    </>
  );
};
