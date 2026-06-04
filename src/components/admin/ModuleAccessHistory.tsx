import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Ban, FolderKanban, Building2 } from 'lucide-react';
import {
  AdminGrantRow,
  deriveGrantStatus,
} from '@/hooks/useAdminModuleGrants';
import { RevokeGrantDialog } from './RevokeGrantDialog';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';

interface ProfileLite {
  id: string;
  display_name: string | null;
  email?: string | null;
}

interface Props {
  rows: AdminGrantRow[];
  loading: boolean;
  profiles: Record<string, ProfileLite>;
  onRevoke: (grantId: string, reason: string) => Promise<void>;
}

const REASON_KEY: Record<string, string> = {
  refund: 'admin.moduleAccess.reasonCode.refund',
  beta_tester: 'admin.moduleAccess.reasonCode.beta_tester',
  internal: 'admin.moduleAccess.reasonCode.internal',
  partner: 'admin.moduleAccess.reasonCode.partner',
  support: 'admin.moduleAccess.reasonCode.support',
  other: 'admin.moduleAccess.reasonCode.other',
};

export const ModuleAccessHistory = ({ rows, loading, profiles, onRevoke }: Props) => {
  const { t } = useTranslation();
  const [revoking, setRevoking] = useState<AdminGrantRow | null>(null);
  const [busy, setBusy] = useState(false);

  const formatActor = (id: string | null, actor?: string | null) => {
    if (actor === 'system') return t('admin.moduleAccess.actor.system', 'Sustav');
    if (!id) return '—';
    const p = profiles[id];
    return p?.display_name || p?.email || `${id.slice(0, 8)}…`;
  };

  const handleRevoke = async (reason: string) => {
    if (!revoking) return;
    setBusy(true);
    try {
      await onRevoke(revoking.id, reason);
      showSuccess(t('admin.moduleAccess.revokeSuccess', 'Pristup opozvan'));
      setRevoking(null);
    } catch (e) {
      showError(
        e instanceof Error ? e.message : t('admin.moduleAccess.revokeError', 'Opoziv nije uspio')
      );
    } finally {
      setBusy(false);
    }
  };

  const sorted = useMemo(
    () => [...rows].sort((a, b) => new Date(b.granted_at).getTime() - new Date(a.granted_at).getTime()),
    [rows]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <p className="text-center text-sm text-muted-foreground py-6">
        {t('admin.moduleAccess.historyEmpty', 'Nema povijesti override grantova.')}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {sorted.map((row) => {
        const status = deriveGrantStatus(row);
        const ModuleIcon = row.module === 'projects' ? FolderKanban : Building2;
        const moduleLabel =
          row.module === 'projects'
            ? t('settings.modules.projects.title', 'Projekti')
            : t('settings.modules.business.title', 'Business');

        const statusBadge =
          status === 'active' ? (
            <Badge className="bg-primary/15 text-primary border-primary/30 text-[10px]">
              {t('admin.moduleAccess.status.active', 'Aktivan')}
            </Badge>
          ) : status === 'expired' ? (
            <Badge variant="outline" className="text-muted-foreground text-[10px]">
              {t('admin.moduleAccess.status.expired', 'Istekao')}
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px]">
              {t('admin.moduleAccess.status.revoked', 'Opozvan')}
            </Badge>
          );

        return (
          <div key={row.id} className="bg-muted/30 rounded-lg p-3 space-y-2 border border-border/60">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <ModuleIcon className="w-4 h-4 text-primary shrink-0" />
                <span className="text-sm font-medium">{moduleLabel}</span>
                {statusBadge}
              </div>
              {status === 'active' && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                  onClick={() => setRevoking(row)}
                >
                  <Ban className="w-3 h-3 mr-1" />
                  {t('admin.moduleAccess.revoke', 'Opozovi')}
                </Button>
              )}
            </div>

            <div className="text-[11px] text-muted-foreground space-y-0.5">
              <div>
                <span className="font-medium">
                  {t('admin.moduleAccess.field.grantedBy', 'Dodijelio')}:
                </span>{' '}
                {formatActor(row.granted_by)} •{' '}
                {format(new Date(row.granted_at), 'dd.MM.yyyy. HH:mm', { locale: hr })}
              </div>
              <div>
                <span className="font-medium">
                  {t('admin.moduleAccess.field.duration', 'Trajanje')}:
                </span>{' '}
                {row.expires_at
                  ? format(new Date(row.expires_at), 'dd.MM.yyyy. HH:mm', { locale: hr })
                  : t('admin.moduleAccess.permanent', 'Trajno')}
              </div>
              <div>
                <span className="font-medium">
                  {t('admin.moduleAccess.field.reason', 'Razlog')}:
                </span>{' '}
                {t(REASON_KEY[row.reason_code] ?? row.reason_code, row.reason_code)}
                {row.reason_note ? ` — ${row.reason_note}` : ''}
              </div>
              {row.revoked_at && (
                <div className="text-destructive/80">
                  <span className="font-medium">
                    {t('admin.moduleAccess.field.revokedBy', 'Opozvao')}:
                  </span>{' '}
                  {formatActor(row.revoked_by, row.revoked_actor)} •{' '}
                  {format(new Date(row.revoked_at), 'dd.MM.yyyy. HH:mm', { locale: hr })}
                  {row.revoke_reason ? ` — ${row.revoke_reason}` : ''}
                </div>
              )}
            </div>
          </div>
        );
      })}

      <RevokeGrantDialog
        open={!!revoking}
        busy={busy}
        onOpenChange={(o) => !o && setRevoking(null)}
        onConfirm={handleRevoke}
      />
    </div>
  );
};
