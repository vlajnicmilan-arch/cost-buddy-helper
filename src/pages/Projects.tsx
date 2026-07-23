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
import { ReadOnlyBanner } from '@/components/access/ReadOnlyBanner';
import { useModuleGate } from '@/hooks/useModuleGate';

import { TrialFeatureChip } from '@/components/TrialFeatureChip';
import { supabase } from '@/integrations/supabase/client';

const Projects = () => {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const { storageMode } = useStorage();
  const navigate = useNavigate();
  const { refetch } = useExpenses();
  const { hasModuleAccess } = useFeatureAccess();
  const { requestModule } = useModuleGate();
  const hasProjectsAccess = hasModuleAccess('projekti');


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
       if (hasProjectsAccess) { setHasMemberships(true); return; }
      const { count } = await supabase
        .from('project_members')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id);
      setHasMemberships((count || 0) > 0);
    };
    check();
  }, [user, hasProjectsAccess]);

  const gatePromptedRef = useState<{ done: boolean }>({ done: false })[0];
  useEffect(() => {
    if (hasProjectsAccess || hasMemberships !== false || gatePromptedRef.done) return;
    gatePromptedRef.done = true;
    requestModule('projects', { onDismiss: () => navigate('/home', { replace: true }) });
  }, [hasProjectsAccess, hasMemberships, requestModule, navigate, gatePromptedRef]);

  if (authLoading && storageMode === 'cloud') {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const canSeePanel = hasProjectsAccess || hasMemberships === true;
  const canCreate = hasProjectsAccess;

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
          <>
            {!canCreate && (
              <ReadOnlyBanner
                className="mb-3"
                title={t('projects.access.readOnlyTitle', 'Projekti su u načinu samo za pregled')}
                body={t('projects.access.readOnlyBody', 'Postojeće projekte vidiš i možeš izvesti. Za nove/izmjene aktiviraj modul Projekti.')}
              />
            )}
            <ProjectsPanel onRefreshExpenses={refetch} canCreate={canCreate} />
          </>
        ) : (
          <>
            <ReadOnlyBanner
              className="mb-3"
              title={t('projects.access.readOnlyTitle', 'Projekti su u načinu samo za pregled')}
              body={t('projects.access.readOnlyBody', 'Postojeće projekte vidiš i možeš izvesti. Za nove/izmjene aktiviraj modul Projekti.')}
            />
            <ProjectsPanel onRefreshExpenses={refetch} canCreate={false} />
          </>
        )}

      </motion.div>
      <BottomNav />
    </div>
  );
};

export default Projects;
