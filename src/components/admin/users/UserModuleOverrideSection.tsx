import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound, Info, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import {
  useAdminModuleGrants,
  type GrantResultItem,
} from '@/hooks/useAdminModuleGrants';
import { AdminModuleGrantForm } from '../AdminModuleGrantForm';
import { ModuleAccessHistory } from '../ModuleAccessHistory';
import { ModuleAccessConflictDialog } from '../ModuleAccessConflictDialog';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';

interface ProfileLite {
  id: string;
  display_name: string | null;
  email?: string | null;
}

interface Props {
  userId: string;
  /** Notify parent (UsersTab/Admin) da je override lista promijenjena → refresh globalnih grantova. */
  onChanged?: () => void;
}

/**
 * Inline (u detalju korisnika) sekcija za Admin override modula.
 * Reuse postojećih komponenti: AdminModuleGrantForm + ModuleAccessHistory + ConflictDialog.
 */
export const UserModuleOverrideSection = ({ userId, onChanged }: Props) => {
  const { t } = useTranslation();
  const { rows, loading, grant, revoke } = useAdminModuleGrants(userId);
  const [busy, setBusy] = useState(false);
  const [conflicts, setConflicts] = useState<GrantResultItem[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    const ids = Array.from(
      new Set(
        rows
          .flatMap((r) => [r.granted_by, r.revoked_by])
          .filter((v): v is string => !!v)
      )
    );
    const missing = ids.filter((id) => !profiles[id]);
    if (missing.length === 0) return;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', missing);
      if (data) {
        setProfiles((prev) => {
          const next = { ...prev };
          for (const p of data) next[p.id] = { id: p.id, display_name: p.display_name };
          return next;
        });
      }
    })();
  }, [rows, profiles]);

  const handleGrant = async (params: Parameters<typeof grant>[0]) => {
    setBusy(true);
    try {
      const res = await grant(params);
      const conflictItems = res.results.filter((r) => r.status === 'conflict_active');
      const grantedCount = res.results.filter((r) => r.status === 'granted').length;
      if (grantedCount > 0) {
        showSuccess(
          t('admin.moduleAccess.grantSuccess', 'Pristup dodijeljen ({{n}})', {
            n: grantedCount,
          })
        );
        setShowForm(false);
        onChanged?.();
      }
      if (conflictItems.length > 0) setConflicts(conflictItems);
    } catch (e) {
      showError(
        e instanceof Error
          ? e.message
          : t('admin.moduleAccess.grantError', 'Greška pri dodjeli')
      );
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (grantId: string, reason: string) => {
    await revoke(grantId, reason);
    onChanged?.();
  };

  return (
    <div className="bg-card border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <KeyRound className="w-3.5 h-3.5 text-muted-foreground" />
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            {t('admin.user.overrideSection.title', 'Admin override modula')}
          </p>
        </div>
        <span className="text-[10px] px-1.5 py-0 rounded bg-muted text-muted-foreground">
          {t('admin.user.overrideSection.layerChip', 'Sloj 2')}
        </span>
      </div>

      <div className="flex gap-2 items-start text-[10px] text-muted-foreground bg-muted/40 rounded p-2 leading-snug">
        <Info className="w-3 h-3 mt-0.5 shrink-0 opacity-70" />
        <p>{t(
          'admin.user.layersIndependentNote',
          'Naplata i Admin override su nezavisni slojevi. Promjena naplate ne uklanja postojeće override grantove. Opoziv overridea ne mijenja naplatu. Efektivni pristup vrijedi dok postoji barem jedan aktivni izvor.'
        )}</p>
      </div>

      <ModuleAccessHistory
        rows={rows}
        loading={loading}
        profiles={profiles}
        onRevoke={handleRevoke}
      />

      {!showForm ? (
        <Button
          size="sm"
          variant="outline"
          className="w-full h-8 text-xs"
          onClick={() => setShowForm(true)}
        >
          <Plus className="w-3 h-3 mr-1" />
          {t('admin.user.overrideSection.addButton', 'Dodijeli pristup modulu')}
        </Button>
      ) : (
        <div className="border-t pt-3 space-y-2">
          <AdminModuleGrantForm busy={busy} onSubmit={handleGrant} />
          <Button
            size="sm"
            variant="ghost"
            className="w-full h-7 text-xs"
            onClick={() => setShowForm(false)}
          >
            {t('common.cancel', 'Odustani')}
          </Button>
        </div>
      )}

      <ModuleAccessConflictDialog
        open={conflicts.length > 0}
        conflicts={conflicts}
        onClose={() => setConflicts([])}
      />
    </div>
  );
};
