import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import {
  useAdminModuleGrants,
  GrantResultItem,
} from '@/hooks/useAdminModuleGrants';
import { AdminModuleGrantForm } from './AdminModuleGrantForm';
import { ModuleAccessHistory } from './ModuleAccessHistory';
import { ModuleAccessConflictDialog } from './ModuleAccessConflictDialog';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';

interface ProfileLite {
  id: string;
  display_name: string | null;
  email?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetUserId: string | null;
  targetUserLabel: string;
}

export const AdminModuleAccessDialog = ({
  open,
  onOpenChange,
  targetUserId,
  targetUserLabel,
}: Props) => {
  const { t } = useTranslation();
  const { rows, loading, grant, revoke } = useAdminModuleGrants(open ? targetUserId : null);
  const [busy, setBusy] = useState(false);
  const [conflicts, setConflicts] = useState<GrantResultItem[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});

  // Resolve actor names (granted_by, revoked_by) za history view.
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
      }
      if (conflictItems.length > 0) {
        setConflicts(conflictItems);
      }
    } catch (e) {
      showError(
        e instanceof Error ? e.message : t('admin.moduleAccess.grantError', 'Greška pri dodjeli')
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="z-[60] max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {t('admin.moduleAccess.dialogTitle', 'Pristup modulima')}
            </DialogTitle>
            <DialogDescription>
              {t('admin.moduleAccess.dialogDesc', 'Korisnik')}: {targetUserLabel}
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="grant" className="mt-2">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="grant">
                {t('admin.moduleAccess.tabGrant', 'Dodijeli')}
              </TabsTrigger>
              <TabsTrigger value="history">
                {t('admin.moduleAccess.tabHistory', 'Povijest')} ({rows.length})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="grant" className="mt-4">
              <AdminModuleGrantForm busy={busy} onSubmit={handleGrant} />
            </TabsContent>
            <TabsContent value="history" className="mt-4">
              <ModuleAccessHistory
                rows={rows}
                loading={loading}
                profiles={profiles}
                onRevoke={revoke}
              />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <ModuleAccessConflictDialog
        open={conflicts.length > 0}
        conflicts={conflicts}
        onClose={() => setConflicts([])}
      />
    </>
  );
};
