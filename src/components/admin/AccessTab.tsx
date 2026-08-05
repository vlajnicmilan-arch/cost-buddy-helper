import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';

import { ModuleAccessOverview, type DrilldownIntent } from './access/ModuleAccessOverview';
import { RecentOverrideActivity } from './access/RecentOverrideActivity';
import type { AppUser } from './types';
import type { ActiveGrantLike } from '@/lib/adminAccess';

interface AccessTabProps {
  users: AppUser[];
  subscriptions: Record<string, string>;
  onDrilldown?: (intent: DrilldownIntent) => void;
}

export const AccessTab = ({
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
        .select('user_id, module, revoked_at, expires_at, reason_code')
        .is('revoked_at', null)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`);
      setGrants(
        (data ?? []).map((r: any) => ({
          user_id: r.user_id,
          module: r.module,
          revoked_at: r.revoked_at,
          expires_at: r.expires_at,
          reason_code: r.reason_code,
        }))
      );
    })();
  }, []);

  const userIds = users.map((u) => u.id);

  return (
    <div className="space-y-4 mt-4">
      {/* 2. Stanje pristupa po modulima */}
      <ModuleAccessOverview
        userIds={userIds}
        subscriptions={subscriptions}
        grants={grants}
        onDrilldown={onDrilldown}
      />

      {/* 3. Nedavna override aktivnost */}
      <RecentOverrideActivity />

      {/* SubscriptionMigrationPanel removed with Stripe purge (Milan 28.8.2026) */}

      <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
        {t(
          'admin.access.footerNote',
          'Per-user upravljanje naplatom i admin overrideom dostupno je u detalju korisnika na tabu Korisnici.'
        )}
      </p>
    </div>
  );
};
