import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Loader2, Shield } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { 
  OPTIONAL_TABS, 
  MANDATORY_TABS, 
  TAB_LABELS, 
  useProjectMemberPermissions 
} from '@/hooks/useProjectMemberPermissions';
import { useProjectWriteGuard } from '@/hooks/useProjectWriteGuard';

interface ProjectMemberPermissionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  userId: string;
  memberName: string;
  /** Owner-readonly downgrade: blocks save with toast. */
  isReadOnly?: boolean;
}

export const ProjectMemberPermissionsDialog = ({
  open,
  onOpenChange,
  projectId,
  userId,
  memberName,
  isReadOnly = false,
}: ProjectMemberPermissionsDialogProps) => {
  const { t } = useTranslation();
  const { permissions, loading, updatePermissions, refetch } = useProjectMemberPermissions(projectId, userId);
  const [localPerms, setLocalPerms] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const { guard } = useProjectWriteGuard({ isReadOnly });
  /**
   * Korak D2 — vidljivost cijene prema investitoru živi na `project_members`,
   * ne na karticama. Vrijedi ISKLJUČIVO za ulogu `member`.
   */
  const [memberRole, setMemberRole] = useState<string | null>(null);
  const [canSeePrice, setCanSeePrice] = useState(false);

  useEffect(() => {
    if (open) {
      refetch();
    }
  }, [open, refetch]);

  useEffect(() => {
    if (!open || !projectId || !userId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('project_members')
        .select('role, can_see_investor_price')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .maybeSingle();
      if (cancelled || !data) return;
      setMemberRole((data as any).role ?? null);
      setCanSeePrice((data as any).can_see_investor_price === true);
    })();
    return () => { cancelled = true; };
  }, [open, projectId, userId]);

  useEffect(() => {
    const initial: Record<string, boolean> = {};
    OPTIONAL_TABS.forEach(tab => {
      initial[tab] = permissions[tab] === true;
    });
    setLocalPerms(initial);
  }, [permissions]);

  const handleSave = async () => {
    if (!guard()) return;
    setSaving(true);
    const success = await updatePermissions(projectId, userId, localPerms);
    let priceOk = true;
    if (memberRole === 'member') {
      const { error } = await supabase
        .from('project_members')
        .update({ can_see_investor_price: canSeePrice } as any)
        .eq('project_id', projectId)
        .eq('user_id', userId);
      priceOk = !error;
    }
    setSaving(false);
    if (success && priceOk) {
      showSuccess(t('projects.permissionsSaved', 'Dozvole spremljene'));
      onOpenChange(false);
    } else {
      showError(t('common.error'));
    }
  };



  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            {t('projects.permissionsFor', 'Dozvole za')} {memberName}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t('projects.permissionsDescription', 'Odaberite koje kartice ovaj član može vidjeti')}
            </p>

            <div className="space-y-3">
              {/* Mandatory tabs - always checked, disabled */}
              {MANDATORY_TABS.map(tab => (
                <div key={tab} className="flex items-center gap-3 opacity-60">
                  <Checkbox checked disabled id={`perm-${tab}`} />
                  <label htmlFor={`perm-${tab}`} className="text-sm">
                    {t(`projects.tab_${tab}`, TAB_LABELS[tab])}
                  </label>
                </div>
              ))}

              {/* Optional tabs */}
              {OPTIONAL_TABS.map(tab => (
                <div key={tab} className="flex items-center gap-3">
                  <Checkbox
                    id={`perm-${tab}`}
                    checked={localPerms[tab] || false}
                    onCheckedChange={(checked) => {
                      setLocalPerms(prev => ({ ...prev, [tab]: !!checked }));
                    }}
                  />
                  <label htmlFor={`perm-${tab}`} className="text-sm cursor-pointer">
                    {t(`projects.tab_${tab}`, TAB_LABELS[tab])}
                  </label>
                </div>
              ))}
            </div>

            {memberRole === 'member' && (
              <div className="space-y-1.5 rounded-md border p-3">
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="perm-investor-price"
                    checked={canSeePrice}
                    onCheckedChange={(checked) => setCanSeePrice(!!checked)}
                  />
                  <label htmlFor="perm-investor-price" className="text-sm cursor-pointer">
                    {t('projects.investorPriceLabel')}
                  </label>
                </div>
                <p className="text-xs text-muted-foreground">{t('projects.investorPriceHint')}</p>
              </div>
            )}

            <Button onClick={handleSave} disabled={saving || isReadOnly} aria-disabled={saving || isReadOnly} title={isReadOnly ? t('projects.access.readOnlyBlockedToast') : undefined} className="w-full">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('common.save', 'Spremi')}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
