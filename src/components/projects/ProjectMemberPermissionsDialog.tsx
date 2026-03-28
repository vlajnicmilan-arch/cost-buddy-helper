import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Loader2, Shield } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { 
  OPTIONAL_TABS, 
  MANDATORY_TABS, 
  TAB_LABELS, 
  useProjectMemberPermissions 
} from '@/hooks/useProjectMemberPermissions';

interface ProjectMemberPermissionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  userId: string;
  memberName: string;
}

export const ProjectMemberPermissionsDialog = ({
  open,
  onOpenChange,
  projectId,
  userId,
  memberName,
}: ProjectMemberPermissionsDialogProps) => {
  const { t } = useTranslation();
  const { permissions, loading, updatePermissions, refetch } = useProjectMemberPermissions(projectId, userId);
  const [localPerms, setLocalPerms] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      refetch();
    }
  }, [open, refetch]);

  useEffect(() => {
    const initial: Record<string, boolean> = {};
    OPTIONAL_TABS.forEach(tab => {
      initial[tab] = permissions[tab] === true;
    });
    setLocalPerms(initial);
  }, [permissions]);

  const handleSave = async () => {
    setSaving(true);
    const success = await updatePermissions(projectId, userId, localPerms);
    setSaving(false);
    if (success) {
      toast.success(t('projects.permissionsSaved', 'Dozvole spremljene'));
      onOpenChange(false);
    } else {
      toast.error(t('common.error'));
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

            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('common.save', 'Spremi')}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
