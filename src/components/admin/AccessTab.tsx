import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CreditCard } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { SubscriptionMigrationPanel } from '@/components/admin/SubscriptionMigrationPanel';
import { ModuleAccessOverview, type DrilldownIntent } from './access/ModuleAccessOverview';
import { RecentOverrideActivity } from './access/RecentOverrideActivity';
import type { AppUser } from './types';
import type { ActiveGrantLike } from '@/lib/adminAccess';

interface AccessTabProps {
  billingEnabled: boolean;
  billingLoading: boolean;
  onToggleBilling: (enabled: boolean) => void;
  users: AppUser[];
  subscriptions: Record<string, string>;
  onDrilldown?: (intent: DrilldownIntent) => void;
}

export const AccessTab = ({
  billingEnabled,
  billingLoading,
  onToggleBilling,
  users,
  subscriptions,
  onDrilldown,
}: AccessTabProps) => {
  const { t } = useTranslation();
  const [grants, setGrants] = useState<ActiveGrantLike[]>([]);

  useEffect(() => {
    (async () => {
      const nowIso = new Date().toISOString();
      const { data } = await supabase
        .from('admin_module_grants')
        .select('user_id, module, revoked_at, expires_at')
        .is('revoked_at', null)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`);
      setGrants(
        (data ?? []).map((r: any) => ({
          user_id: r.user_id,
          module: r.module,
          revoked_at: r.revoked_at,
          expires_at: r.expires_at,
        }))
      );
    })();
  }, []);

  const userIds = users.map((u) => u.id);

  return (
    <div className="space-y-4 mt-4">
      {/* 1. Naplata sustava */}
      <div className="bg-card border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-primary" />
            <div>
              <h3 className="font-semibold text-sm">
                {t('admin.access.systemBilling.title', 'Naplata sustava')}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t(
                  'admin.access.systemBilling.desc',
                  'Uključi/isključi sustav naplate za sve korisnike'
                )}
              </p>
            </div>
          </div>
          <Switch
            checked={billingEnabled}
            onCheckedChange={onToggleBilling}
            disabled={billingLoading}
          />
        </div>
        <div
          className={`text-xs px-3 py-2 rounded-lg ${
            billingEnabled
              ? 'bg-green-500/10 text-green-700 dark:text-green-400'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {billingEnabled
            ? t(
                'admin.access.systemBilling.activeNote',
                '✓ Naplata je aktivna — korisnici vide ograničenja prema razini.'
              )
            : t(
                'admin.access.systemBilling.disabledNote',
                '○ Naplata je isključena — svi korisnici imaju puni pristup.'
              )}
        </div>
      </div>

      {/* 2. Stanje pristupa po modulima */}
      <ModuleAccessOverview
        userIds={userIds}
        subscriptions={subscriptions}
        grants={grants}
        onDrilldown={onDrilldown}
      />

      {/* 3. Nedavna override aktivnost */}
      <RecentOverrideActivity />

      {/* Migracija pretplatnika (postojeća funkcionalnost, neutralan smještaj) */}
      <SubscriptionMigrationPanel />

      <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
        {t(
          'admin.access.footerNote',
          'Per-user upravljanje naplatom i admin overrideom dostupno je u detalju korisnika na tabu Korisnici.'
        )}
      </p>
    </div>
  );
};
