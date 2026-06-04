import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { Activity, Loader2, Plus, Ban, FolderKanban, Building2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { sortGrantsByLatestEvent } from '@/lib/adminAccess';

interface Row {
  id: string;
  user_id: string;
  module: 'projects' | 'business';
  granted_at: string;
  expires_at: string | null;
  granted_by: string;
  reason_code: string;
  reason_note: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  revoked_actor: 'admin' | 'system' | null;
  revoke_reason: string | null;
}

interface ProfileLite {
  id: string;
  display_name: string | null;
  email?: string | null;
}

const REASON_KEY: Record<string, string> = {
  refund: 'admin.moduleAccess.reasonCode.refund',
  beta_tester: 'admin.moduleAccess.reasonCode.beta_tester',
  internal: 'admin.moduleAccess.reasonCode.internal',
  partner: 'admin.moduleAccess.reasonCode.partner',
  support: 'admin.moduleAccess.reasonCode.support',
  other: 'admin.moduleAccess.reasonCode.other',
};

/**
 * Strogo read-only feed zadnjih 10 grant/revoke akcija.
 * Sort: GREATEST(granted_at, revoked_at) DESC, id DESC.
 * BEZ inline akcija.
 */
export const RecentOverrideActivity = () => {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Row[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      // Povučemo nešto više pa sortiramo helperom (zbog GREATEST semantike).
      const { data } = await supabase
        .from('admin_module_grants')
        .select(
          'id, user_id, module, granted_at, expires_at, granted_by, reason_code, reason_note, revoked_at, revoked_by, revoked_actor, revoke_reason'
        )
        .order('granted_at', { ascending: false })
        .limit(50);
      const list = (data ?? []) as Row[];
      const sorted = sortGrantsByLatestEvent(list).slice(0, 10);
      setRows(sorted);

      const ids = Array.from(
        new Set(
          sorted
            .flatMap((r) => [r.user_id, r.granted_by, r.revoked_by])
            .filter((v): v is string => !!v)
        )
      );
      if (ids.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, display_name')
          .in('id', ids);
        if (profs) {
          const map: Record<string, ProfileLite> = {};
          for (const p of profs) {
            map[p.id] = { id: p.id, display_name: p.display_name };
          }
          setProfiles(map);
        }
      }
      setLoading(false);
    })();
  }, []);

  const fmtActor = (id: string | null, actor?: string | null) => {
    if (actor === 'system') return t('admin.moduleAccess.actor.system', 'Sustav');
    if (!id) return '—';
    return profiles[id]?.display_name || `${id.slice(0, 8)}…`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <Activity className="w-4 h-4 text-muted-foreground" />
        {t('admin.access.recentActivity.title', 'Nedavna override aktivnost')}
      </h3>

      {rows.length === 0 ? (
        <p className="text-center text-xs text-muted-foreground py-4 bg-card border rounded-lg">
          {t('admin.access.recentActivity.empty', 'Još nema override aktivnosti.')}
        </p>
      ) : (
        <div className="bg-card border rounded-lg divide-y">
          {rows.map((r) => {
            const isRevoke = !!r.revoked_at;
            const eventDate = isRevoke ? r.revoked_at! : r.granted_at;
            const ModuleIcon = r.module === 'projects' ? FolderKanban : Building2;
            const moduleLabel =
              r.module === 'projects'
                ? t('settings.modules.projects.title', 'Projekti')
                : t('settings.modules.business.title', 'Business');
            const ActionIcon = isRevoke ? Ban : Plus;
            const actionText = isRevoke
              ? t('admin.access.recentActivity.actionRevoke', 'Opozvan')
              : t('admin.access.recentActivity.actionGrant', 'Dodijeljen');
            const actor = isRevoke
              ? fmtActor(r.revoked_by, r.revoked_actor)
              : fmtActor(r.granted_by);
            const reason = isRevoke
              ? r.revoke_reason || '—'
              : t(REASON_KEY[r.reason_code] ?? r.reason_code, r.reason_code) +
                (r.reason_note ? ` — ${r.reason_note}` : '');
            const target =
              profiles[r.user_id]?.display_name || `${r.user_id.slice(0, 8)}…`;
            const expiryText =
              !isRevoke && r.expires_at
                ? `${t('admin.user.until', 'do')} ${format(new Date(r.expires_at), 'dd.MM.yyyy.', { locale: hr })}`
                : !isRevoke
                  ? t('admin.moduleAccess.permanent', 'Trajno')
                  : null;

            return (
              <div key={r.id} className="p-3 text-xs space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <ActionIcon
                      className={`w-3.5 h-3.5 shrink-0 ${isRevoke ? 'text-destructive/70' : 'text-primary'}`}
                    />
                    <span className="font-medium">{actionText}</span>
                    <ModuleIcon className="w-3 h-3 text-muted-foreground" />
                    <span>{moduleLabel}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {format(new Date(eventDate), 'dd.MM. HH:mm', { locale: hr })}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground pl-5">
                  <span className="font-medium">{actor}</span>
                  {' → '}
                  <span>{target}</span>
                  {expiryText && (
                    <>
                      {' · '}
                      <span>{expiryText}</span>
                    </>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground pl-5 italic">
                  {reason}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
