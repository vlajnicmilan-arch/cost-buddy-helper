import { useAuth } from '@/hooks/useAuth';
import { useStorage } from '@/contexts/StorageContext';
import { useFamilyGroups } from '@/hooks/useFamilyGroups';
import { BottomNav } from '@/components/BottomNav';
import { PageHeader } from '@/components/PageHeader';
import { Loader2, Plus, Users } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { FamilyGroupCard } from '@/components/family/FamilyGroupCard';
import { FamilyGroupDialog } from '@/components/family/FamilyGroupDialog';
import { FamilyGroupDetailView } from '@/components/family/FamilyGroupDetailView';
import { FamilyGroup } from '@/types/family';
import { useTranslation } from 'react-i18next';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { UpgradePrompt } from '@/components/UpgradePrompt';

const Family = () => {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const { storageMode } = useStorage();
  const navigate = useNavigate();
  const location = useLocation();
  const { groups, loading, createGroup, updateGroup, deleteGroup, refetch } = useFamilyGroups();
  const { hasAccess, getRequiredTier } = useFeatureAccess();
  const canAccessFamily = hasAccess('family_groups');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<FamilyGroup | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<FamilyGroup | null>(null);
  const [initialOpenChat, setInitialOpenChat] = useState(false);

  useEffect(() => {
    if (!authLoading && !user && storageMode === 'cloud') {
      navigate('/auth', { replace: true });
    }
  }, [user, authLoading, navigate, storageMode]);

  // Handle deep-link from notifications
  useEffect(() => {
    const state = location.state as { openGroupId?: string; openChat?: boolean } | null;
    if (state?.openGroupId && groups.length > 0 && !selectedGroup) {
      const group = groups.find(g => g.id === state.openGroupId);
      if (group) {
        setSelectedGroup(group);
        if (state.openChat) {
          setInitialOpenChat(true);
        }
        navigate(location.pathname, { replace: true, state: {} });
      }
    }
  }, [groups, location.state, selectedGroup, navigate, location.pathname]);

  if (authLoading && storageMode === 'cloud') {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (storageMode !== 'cloud') {
    return (
      <div className="min-h-dvh bg-background pb-20">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-8"
        >
          <PageHeader title={t('family.title')} />
          <div className="text-center text-muted-foreground mt-12">
            <p>{t('family.cloudOnly')}</p>
          </div>
        </motion.div>
        <BottomNav />
      </div>
    );
  }

  if (!canAccessFamily) {
    return (
      <div className="min-h-dvh bg-background pb-20">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-8"
        >
          <PageHeader title={t('family.title')} />
          <UpgradePrompt
            feature="Obiteljske grupe i dijeljenje"
            requiredTier={getRequiredTier('family_groups')}
            className="mt-12"
          />
        </motion.div>
        <BottomNav />
      </div>
    );
  }

  if (selectedGroup) {
      <FamilyGroupDetailView
        group={selectedGroup}
        initialOpenChat={initialOpenChat}
        onBack={() => {
          setSelectedGroup(null);
          setInitialOpenChat(false);
          refetch();
        }}
        onUpdate={updateGroup}
        onDelete={async () => {
          await deleteGroup(selectedGroup.id);
          setSelectedGroup(null);
        }}
      />
    );
  }

  return (
    <div className="min-h-dvh bg-background pb-20">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-8"
      >
        <PageHeader title={t('family.title')} />

        <div className="flex justify-end mb-4">
          <Button onClick={() => { setEditingGroup(null); setDialogOpen(true); }} size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            {t('family.newGroup')}
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : groups.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <div className="mx-auto w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center">
              <Users className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-lg">{t('family.noGroups')}</h3>
            <p className="text-muted-foreground text-sm max-w-xs mx-auto">
              {t('family.noGroupsDesc')}
            </p>
            <Button onClick={() => setDialogOpen(true)} className="mt-2 gap-1.5">
              <Plus className="h-4 w-4" />
              {t('family.createFirst')}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((group) => (
              <FamilyGroupCard
                key={group.id}
                group={group}
                onClick={() => setSelectedGroup(group)}
              />
            ))}
          </div>
        )}
      </motion.div>

      <FamilyGroupDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        group={editingGroup}
        onSave={async (data) => {
          if (editingGroup) {
            await updateGroup(editingGroup.id, data);
          } else {
            await createGroup(data);
          }
          setDialogOpen(false);
        }}
      />

      <BottomNav />
    </div>
  );
};

export default Family;