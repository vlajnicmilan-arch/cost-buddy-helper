import { useEffect, useState } from 'react';
import { useStorage } from '@/contexts/StorageContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Compass, Users, FolderKanban, Building2, Loader2, Zap, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { hr as hrLocale } from 'date-fns/locale';

type Module = 'smjer' | 'krug' | 'projekti' | 'biznis';

interface EntitlementRow {
  module: Module;
  source: 'paddle' | 'trial' | 'admin_grant' | 'migration';
  status: string;
  period_end: string | null;
  billing_cycle: 'monthly' | 'yearly' | 'lifetime' | 'trial' | null;
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

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) return;

    const load = async () => {
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from('user_entitlements')
        .select('module, source, status, period_end, billing_cycle')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .or(`period_end.is.null,period_end.gt.${nowIso}`);

      if (cancelled) return;
      if (error) {
        setRows([]);
      } else {
        // Prikaz samo pravih modula (bez legacy pseudo-modula).
        const filtered = (data || []).filter((r: any) =>
          ['smjer', 'krug', 'projekti', 'biznis'].includes(r.module)
        );
        // Ako je više redova za isti modul, prioritet paddle > admin_grant > migration > trial.
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

  return (
    <>
      <Separator />
      <div className="space-y-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            {t('subscription.title', 'Pretplata')}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t('subscription.subtitle', 'Stanje po modulima. Otkazivanje i promjena paketa dolazi uskoro.')}
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
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {sourceLabel(r)}
                      {cycle ? ` · ${cycle}` : ''}
                      {r.period_end
                        ? ` · ${t('subscription.validUntil', 'vrijedi do')} ${format(new Date(r.period_end), 'dd.MM.yyyy.', { locale: hrLocale })}`
                        : ''}
                    </p>
                  </div>
                </div>
              );
            })}
            <p className="text-[11px] text-muted-foreground px-1 pt-1">
              {t(
                'subscription.cancelHint',
                'Otkazivanje pretplate uskoro dostupno unutar aplikacije. Do tada nam pišite na support@vmbalance.com.'
              )}
            </p>
          </div>
        )}
      </div>
    </>
  );
};
