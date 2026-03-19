import { useAuth } from '@/hooks/useAuth';
import { useStorage } from '@/contexts/StorageContext';
import { useExpenses } from '@/hooks/useExpenses';
import { ProjectsPanel } from '@/components/projects/ProjectsPanel';
import { BottomNav } from '@/components/BottomNav';
import { PageHeader } from '@/components/PageHeader';
import { Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';

const Projects = () => {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const { storageMode } = useStorage();
  const navigate = useNavigate();
  const { refetch } = useExpenses();

  useEffect(() => {
    if (!authLoading && !user && storageMode === 'cloud') {
      navigate('/auth', { replace: true });
    }
  }, [user, authLoading, navigate, storageMode]);

  if (authLoading && storageMode === 'cloud') {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
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
        <PageHeader
          title={t('nav.projects', 'Projekti')}
          onDataImported={refetch}
        />
        <ProjectsPanel onRefreshExpenses={refetch} />
      </motion.div>
      <BottomNav />
    </div>
  );
};

export default Projects;
