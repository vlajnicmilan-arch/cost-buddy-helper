import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ProjectWithOwnership, PROJECT_STATUS_LABELS } from '@/types/project';
import { useProjectStats } from '@/hooks/useProjectStats';
import { useProjectMilestones } from '@/hooks/useProjectMilestones';
import { useProjectFunding } from '@/hooks/useProjectFunding';
import { useProjectMembers } from '@/hooks/useProjectMembers';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { 
  Wallet, Target, Users, FileText, TrendingUp, X,
  Calendar, AlertTriangle, GanttChart, BarChart3
} from 'lucide-react';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { ProjectMilestonesTab } from './ProjectMilestonesTab';
import { ProjectFundingTab } from './ProjectFundingTab';
import { ProjectMembersTab } from './ProjectMembersTab';
import { ProjectTransactionsTab } from './ProjectTransactionsTab';
import { ProjectTimelineTab } from './ProjectTimelineTab';
import { ProjectReportsDialog } from './ProjectReportsDialog';
import { motion, AnimatePresence } from 'framer-motion';

interface ProjectFullScreenViewProps {
  open: boolean;
  onClose: () => void;
  project: ProjectWithOwnership | null;
  onRefreshExpenses?: () => void;
}

export const ProjectFullScreenView = ({
  open,
  onClose,
  project,
  onRefreshExpenses
}: ProjectFullScreenViewProps) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const [activeTab, setActiveTab] = useState('overview');
  const [reportsOpen, setReportsOpen] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const { stats, expenses, loading: statsLoading, refetch: refetchStats } = useProjectStats(
    project?.id || null, 
    project?.total_budget || 0
  );
  const { milestones, loading: milestonesLoading, refetch: refetchMilestones } = useProjectMilestones(project?.id || null);
  const { funding, incomeSources, totalAllocated, totalSourcesCount, loading: fundingLoading, refetch: refetchFunding } = useProjectFunding(project?.id || null);
  const { members, invitations, isManager, loading: membersLoading, refetch: refetchMembers } = useProjectMembers(project?.id || null);
  
  const currentUserRole = project?.role || 'viewer';

  // Track changes - whenever data is refetched after user action, mark as changed
  const markAsChanged = useCallback(() => {
    setHasUnsavedChanges(true);
  }, []);

  // Reset unsaved changes when project changes or closes
  useEffect(() => {
    if (!open) {
      setHasUnsavedChanges(false);
      setActiveTab('overview');
    }
  }, [open, project?.id]);

  // Handle browser back button
  useEffect(() => {
    if (!open) return;

    const handlePopState = (e: PopStateEvent) => {
      e.preventDefault();
      handleCloseAttempt();
    };

    // Push a state so we can intercept back
    window.history.pushState({ projectView: true }, '');
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [open, hasUnsavedChanges]);

  const handleCloseAttempt = () => {
    if (hasUnsavedChanges) {
      setShowExitConfirm(true);
    } else {
      handleClose();
    }
  };

  const handleClose = () => {
    setHasUnsavedChanges(false);
    onClose();
  };

  const handleConfirmExit = () => {
    setShowExitConfirm(false);
    handleClose();
  };

  const handleStay = () => {
    setShowExitConfirm(false);
    // Re-push state since popstate consumed it
    window.history.pushState({ projectView: true }, '');
  };

  if (!project) return null;

  const budget = project.total_budget || 0;
  
  // Calculate spent from completed milestones (unified logic)
  const completedMilestonesList = milestones.filter(m => m.status === 'completed');
  const spentFromMilestones = completedMilestonesList.reduce((sum, m) => sum + (m.budget || 0), 0);
  const completedMilestones = completedMilestonesList.length;
  
  // Remaining = Allocated (received funds) - Spent (completed milestones)
  const remaining = totalAllocated - spentFromMilestones;
  const budgetUsedPercentage = totalAllocated > 0 
    ? (spentFromMilestones / totalAllocated) * 100 
    : 0;
  const budgetWarning = budgetUsedPercentage >= 90;
  const overdueMilestones = milestones.filter(m => m.status === 'overdue').length;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Full-screen overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-background overflow-y-auto"
          >
            {/* Header */}
            <div className="sticky top-0 z-10 bg-background border-b">
              <div className="flex items-center gap-3 p-4 max-w-6xl mx-auto">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCloseAttempt}
                  className="shrink-0"
                >
                  <X className="w-5 h-5" />
                </Button>

                <div 
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                  style={{ backgroundColor: `${project.color}20` }}
                >
                  {project.icon}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h1 className="text-lg font-semibold truncate">{project.name}</h1>
                    <Badge variant="secondary" className="shrink-0">
                      {t(`projectStatus.${project.status}`, PROJECT_STATUS_LABELS[project.status])}
                    </Badge>
                    {hasUnsavedChanges && (
                      <Badge variant="outline" className="shrink-0 text-warning border-warning">
                        {t('common.unsavedChanges', 'Nespremljene promjene')}
                      </Badge>
                    )}
                  </div>
                  {project.description && (
                    <p className="text-sm text-muted-foreground truncate">{project.description}</p>
                  )}
                </div>

                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setReportsOpen(true)}
                  className="shrink-0"
                >
                  <BarChart3 className="w-4 h-4 mr-1" />
                  <span className="hidden sm:inline">{t('projects.reports', 'Izvještaji')}</span>
                </Button>
              </div>
            </div>

            {/* Reports Dialog */}
            <ProjectReportsDialog
              open={reportsOpen}
              onOpenChange={setReportsOpen}
              project={project}
              milestones={milestones}
              members={members}
              expenses={expenses}
              totalSpent={stats.totalSpent}
              totalAllocated={totalAllocated}
            />

            {/* Main content */}
            <div className="max-w-6xl mx-auto p-4 pb-24">
              {/* Budget Overview - Unified logic based on completed milestones */}
              <div className="p-4 rounded-lg bg-muted/50 space-y-3 mb-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wallet className="w-5 h-5 text-muted-foreground" />
                    <span className="font-medium">{t('projects.budgetOverview')}</span>
                  </div>
                  {budgetWarning && (
                    <Badge variant="destructive" className="gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {t('projects.budgetWarning')}
                    </Badge>
                  )}
                </div>
                
                {totalAllocated > 0 ? (
                  <>
                    <Progress 
                      value={Math.min(budgetUsedPercentage, 100)} 
                      className={cn(
                        "h-3",
                        budgetUsedPercentage >= 90 && "[&>div]:bg-destructive",
                        budgetUsedPercentage >= 70 && budgetUsedPercentage < 90 && "[&>div]:bg-warning"
                      )}
                    />
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-xl sm:text-2xl font-bold text-income">{formatAmount(totalAllocated)}</p>
                        <p className="text-xs text-muted-foreground">{t('projects.received', 'Primljeno')}</p>
                      </div>
                      <div>
                        <p className="text-xl sm:text-2xl font-bold text-expense">{formatAmount(spentFromMilestones)}</p>
                        <p className="text-xs text-muted-foreground">{t('projects.completedPhases', 'Završene faze')}</p>
                      </div>
                      <div>
                        <p className={cn("text-xl sm:text-2xl font-bold", remaining >= 0 ? "text-income" : "text-destructive")}>
                          {formatAmount(remaining)}
                        </p>
                        <p className="text-xs text-muted-foreground">{t('projects.remaining', 'Preostalo')}</p>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-center text-muted-foreground py-2">{t('projects.noFundingYet', 'Nema primljenih sredstava')}</p>
                )}
              </div>

              {/* Tabs */}
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid grid-cols-6 w-full mb-6">
                  <TabsTrigger value="overview" className="gap-1">
                    <TrendingUp className="w-4 h-4" />
                    <span className="hidden sm:inline">{t('projects.overview')}</span>
                  </TabsTrigger>
                  <TabsTrigger value="timeline" className="gap-1">
                    <GanttChart className="w-4 h-4" />
                    <span className="hidden sm:inline">{t('projects.timeline')}</span>
                  </TabsTrigger>
                  <TabsTrigger value="milestones" className="gap-1">
                    <Target className="w-4 h-4" />
                    <span className="hidden sm:inline">{t('projects.milestones')}</span>
                    {milestones.length > 0 && (
                      <Badge variant="secondary" className="ml-1 h-5 px-1 hidden sm:inline-flex">
                        {completedMilestones}/{milestones.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="funding" className="gap-1">
                    <Wallet className="w-4 h-4" />
                    <span className="hidden sm:inline">{t('projects.funding')}</span>
                  </TabsTrigger>
                  <TabsTrigger value="members" className="gap-1">
                    <Users className="w-4 h-4" />
                    <span className="hidden sm:inline">{t('projects.team')}</span>
                    <Badge variant="secondary" className="ml-1 h-5 px-1 hidden sm:inline-flex">{members.length}</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="transactions" className="gap-1">
                    <FileText className="w-4 h-4" />
                    <span className="hidden sm:inline">{t('projects.transactions')}</span>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="m-0 space-y-4">
                  {/* Quick stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-4 rounded-lg border text-center">
                      <p className="text-3xl font-bold">{stats.transactionCount}</p>
                      <p className="text-sm text-muted-foreground">{t('projects.transactions')}</p>
                    </div>
                    <div className="p-4 rounded-lg border text-center">
                      <p className="text-3xl font-bold">{milestones.length}</p>
                      <p className="text-sm text-muted-foreground">{t('projects.milestones')}</p>
                    </div>
                    <div className="p-4 rounded-lg border text-center">
                      <p className="text-3xl font-bold">{members.length}</p>
                      <p className="text-sm text-muted-foreground">{t('projects.members')}</p>
                    </div>
                    <div className="p-4 rounded-lg border text-center">
                      <p className="text-3xl font-bold">{totalSourcesCount}</p>
                      <p className="text-sm text-muted-foreground">{t('projects.fundingSources')}</p>
                    </div>
                  </div>

                  {/* Timeline */}
                  {(project.start_date || project.end_date) && (
                    <div className="p-4 rounded-lg border">
                      <div className="flex items-center gap-2 mb-2">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">{t('projects.timeline')}</span>
                      </div>
                      <div className="flex items-center gap-4 text-sm flex-wrap">
                        {project.start_date && (
                          <div>
                            <span className="text-muted-foreground">{t('projects.start')}:</span>{' '}
                            {format(new Date(project.start_date), 'd. MMMM yyyy', { locale: hr })}
                          </div>
                        )}
                        {project.end_date && (
                          <div>
                            <span className="text-muted-foreground">{t('projects.end')}:</span>{' '}
                            {format(new Date(project.end_date), 'd. MMMM yyyy', { locale: hr })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Milestones summary */}
                  {milestones.length > 0 && (
                    <div className="p-4 rounded-lg border">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Target className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium">{t('projects.milestonesProgress')}</span>
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {completedMilestones} / {milestones.length} {t('projects.completed')}
                        </span>
                      </div>
                      <Progress value={(completedMilestones / milestones.length) * 100} className="h-2" />
                      {overdueMilestones > 0 && (
                        <p className="text-sm text-destructive mt-2 flex items-center gap-1">
                          <AlertTriangle className="w-4 h-4" />
                          {overdueMilestones} {t('projects.overdueMilestones')}
                        </p>
                      )}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="timeline" className="m-0">
                  <ProjectTimelineTab
                    projectId={project.id}
                    milestones={milestones}
                    projectStartDate={project.start_date}
                    projectEndDate={project.end_date}
                    loading={milestonesLoading}
                  />
                </TabsContent>

                <TabsContent value="milestones" className="m-0">
                  <ProjectMilestonesTab 
                    projectId={project.id}
                    milestones={milestones}
                    isManager={isManager}
                    loading={milestonesLoading}
                    onRefetch={() => {
                      refetchMilestones();
                      markAsChanged();
                    }}
                  />
                </TabsContent>

                <TabsContent value="funding" className="m-0">
                  <ProjectFundingTab
                    projectId={project.id}
                    funding={funding}
                    incomeSources={incomeSources}
                    milestones={milestones}
                    totalAllocated={totalAllocated}
                    projectBudget={budget}
                    isManager={isManager}
                    loading={fundingLoading}
                    onRefetch={() => {
                      refetchFunding();
                      markAsChanged();
                    }}
                  />
                </TabsContent>

                <TabsContent value="members" className="m-0">
                  <ProjectMembersTab
                    projectId={project.id}
                    members={members}
                    invitations={invitations}
                    isManager={isManager}
                    loading={membersLoading}
                    onRefetch={() => {
                      refetchMembers();
                      markAsChanged();
                    }}
                  />
                </TabsContent>

                <TabsContent value="transactions" className="m-0">
                  <ProjectTransactionsTab
                    projectId={project.id}
                    expenses={expenses}
                    milestones={milestones}
                    isManager={isManager}
                    userRole={currentUserRole}
                    loading={statsLoading}
                    onRefetch={() => {
                      refetchStats();
                      refetchMilestones();
                      markAsChanged();
                    }}
                  />
                </TabsContent>
              </Tabs>
            </div>
          </motion.div>

          {/* Exit confirmation dialog */}
          <AlertDialog open={showExitConfirm} onOpenChange={setShowExitConfirm}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('common.unsavedChangesTitle', 'Imate nespremljenih promjena')}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t('common.unsavedChangesDescription', 'Napravili ste promjene na ovom projektu. Jeste li sigurni da želite izaći bez spremanja?')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={handleStay}>
                  {t('common.stay', 'Ostani')}
                </AlertDialogCancel>
                <AlertDialogAction onClick={handleConfirmExit} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  {t('common.exitWithoutSaving', 'Izađi bez spremanja')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </AnimatePresence>
  );
};
