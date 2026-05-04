import { useAuth } from '@/hooks/useAuth';
import { useStorage } from '@/contexts/StorageContext';
import { useExpenses } from '@/hooks/useExpenses';
import { ProjectsPanel } from '@/components/projects/ProjectsPanel';
import { BottomNav } from '@/components/BottomNav';
import { PageHeader } from '@/components/PageHeader';
import { Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { UpgradePrompt } from '@/components/UpgradePrompt';
import { TrialFeatureChip } from '@/components/TrialFeatureChip';
import { supabase } from '@/integrations/supabase/client';

const Projects = () => {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const { storageMode } = useStorage();
  const navigate = useNavigate();
  const { refetch } = useExpenses();
  const { hasAccess, getRequiredTier } = useFeatureAccess();

  // Free users get access if they are a member of at least one project (invited as worker/member)
  const [hasMemberships, setHasMemberships] = useState<boolean | null>(null);

  useEffect(() => {
    if (!authLoading && !user && storageMode === 'cloud') {
      navigate('/', { replace: true });
    }
  }, [user, authLoading, navigate, storageMode]);

  useEffect(() => {
    const check = async () => {
      if (!user) { setHasMemberships(false); return; }
      if (hasAccess('projects')) { setHasMemberships(true); return; }
      const { count } = await supabase
        .from('project_members')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id);
      setHasMemberships((count || 0) > 0);
    };
    check();
  }, [user, hasAccess]);

  if (authLoading && storageMode === 'cloud') {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const canSeePanel = hasAccess('projects') || hasMemberships === true;
  const canCreate = hasAccess('projects');

  return (
    <div className="min-h-dvh bg-background pb-20">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-8"
      >
        <PageHeader
          title={t('nav.projects', 'Projekti')}
          onDataImported={refetch}
        />
        <div className="mb-3">
          <TrialFeatureChip feature="projects" />
        </div>
        {hasMemberships === null ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : canSeePanel ? (
          <ProjectsPanel onRefreshExpenses={refetch} canCreate={canCreate} />
        ) : (
          <UpgradePrompt feature={t('nav.projects', 'Projekti')} requiredTier={getRequiredTier('projects')} />
        )}
      </motion.div>
      <BottomNav />
    </div>
  );
};

export default Projects;
