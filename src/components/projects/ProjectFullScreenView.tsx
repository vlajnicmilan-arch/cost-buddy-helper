import { useState, useEffect, useMemo } from 'react';
import { useBackButton } from '@/hooks/useBackButton';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ProjectWithOwnership, PROJECT_STATUS_LABELS } from '@/types/project';
import { useProjectStats } from '@/hooks/useProjectStats';
import { useProjectMilestones } from '@/hooks/useProjectMilestones';
import { useProjectFunding } from '@/hooks/useProjectFunding';
import { useProjectCollaborators } from '@/hooks/useProjectCollaborators';
import { useProjectMembers } from '@/hooks/useProjectMembers';
import { useProjectMemberPermissions } from '@/hooks/useProjectMemberPermissions';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useAppState } from '@/contexts/AppStateContext';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { 
  Wallet, Target, Users, FileText, TrendingUp, X,
  Calendar, AlertTriangle, GanttChart, BarChart3, ClipboardList, Handshake, ChevronRight, History, Clock,
  Briefcase, FolderOpen, HelpCircle, Share2, Activity, BookOpen, Flag, RotateCcw
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { CompleteProjectWizard } from './CompleteProjectWizard';
import { ProjectShareDialog } from './ProjectShareDialog';
import { ProjectProfitLossCard } from './ProjectProfitLossCard';
import { ProjectEarnedValueCard } from './ProjectEarnedValueCard';
import { useProjectLossZoneAlert } from '@/hooks/useProjectLossZoneAlert';
import { ProjectBudgetHistoryDialog } from './ProjectBudgetHistoryDialog';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { ProjectMilestonesTab } from './ProjectMilestonesTab';
import { ProjectFundingTab } from './ProjectFundingTab';
import { ProjectTransactionsTab } from './ProjectTransactionsTab';
import { ProjectTimelineTab } from './ProjectTimelineTab';
import { ProjectReportsDialog } from './ProjectReportsDialog';
import { ProjectTeamTab } from './ProjectTeamTab';
import { ProjectDocumentsTab } from './ProjectDocumentsTab';
import { ProjectActivityTab } from './ProjectActivityTab';
import { ProjectWorkLogTab } from './ProjectWorkLogTab';
import { useProjectTypeLabels } from '@/hooks/useProjectTypeLabels';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { motion, AnimatePresence } from 'framer-motion';

type TabGroup = 'work' | 'people' | 'money';

interface ProjectFullScreenViewProps {
  open: boolean;
  onClose: () => void;
  project: ProjectWithOwnership | null;
  onRefreshExpenses?: () => void;
  initialTab?: string;
  /** Called when user wants to edit the project (e.g. from "enter contract value" CTA). */
  onRequestEdit?: (project: ProjectWithOwnership) => void;
}

export const ProjectFullScreenView = ({
  open,
  onClose,
  project,
  onRefreshExpenses,
  initialTab,
  onRequestEdit
}: ProjectFullScreenViewProps) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const [activeTab, setActiveTab] = useState(initialTab || 'timeline');
  const [activeGroup, setActiveGroup] = useState<TabGroup>('work');
  useBackButton(open, onClose);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [budgetHistoryOpen, setBudgetHistoryOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [completeWizardOpen, setCompleteWizardOpen] = useState(false);
  const [reopening, setReopening] = useState(false);

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  const { stats, expenses, loading: statsLoading, refetch: refetchStats } = useProjectStats(
    project?.id || null, 
    project?.total_budget || 0
  );
  const { milestones, loading: milestonesLoading, refetch: refetchMilestones } = useProjectMilestones(project?.id || null);
  const { funding, incomeSources, totalAllocated, totalSourcesCount, loading: fundingLoading, refetch: refetchFunding } = useProjectFunding(project?.id || null);
  const { members, invitations, isManager, loading: membersLoading, refetch: refetchMembers } = useProjectMembers(project?.id || null);
  const { totalPaid: collaboratorsPaid, totalCost: collaboratorsAgreed } = useProjectCollaborators(project?.id || null);
  const { isTabVisible, loading: permsLoading } = useProjectMemberPermissions(project?.id || null);
  
  const currentUserRole = project?.role || 'viewer';
  const isWorkerOnly = currentUserRole === 'worker' && !isManager;
  const { activeBusinessProfileId } = useAppState();
  const { hasAccess } = useFeatureAccess();
  const labels = useProjectTypeLabels(project);

  // Business view supports both owned business projects and shared projects joined under this business profile.
  const isBusinessView = !!activeBusinessProfileId && (
    project?.business_profile_id === activeBusinessProfileId ||
    (project?.member_context === 'business' && project?.member_business_profile_id === activeBusinessProfileId)
  );
  const canSeeWorkers = hasAccess('workforce') && !isWorkerOnly;
  const canSeeCollaborators = isBusinessView && hasAccess('collaborators') && !isWorkerOnly;
  // Business-only UI bits (P&L card, budget history) — kept gated to Business tier in business view
  const canAccessBusinessTabs = isBusinessView && hasAccess('collaborators') && !isWorkerOnly;

  // Determine if current user can see a tab (with business-level filtering)
  const canSeeTab = (tabKey: string) => {
    // Workers (restricted role) only see the work log
    if (isWorkerOnly) return tabKey === 'worklog';
    if (tabKey === 'workers' && !canSeeWorkers) return false;
    if (tabKey === 'collaborators' && !canSeeCollaborators) return false;
    // Documents always visible to project members
    if (tabKey === 'documents') return true;
    return isManager || isTabVisible(tabKey);
  };

  // Reset tab when project changes or closes
  useEffect(() => {
    if (!open) {
      setActiveTab(isWorkerOnly ? 'worklog' : 'timeline');
      setActiveGroup('work');
    } else if (isWorkerOnly) {
      setActiveTab('worklog');
      setActiveGroup('work');
    }
  }, [open, project?.id, isWorkerOnly]);

  // Map tab to its group (for auto-switching group when initialTab is set)
  const TAB_TO_GROUP: Record<string, TabGroup> = {
    overview: 'work',
    timeline: 'work',
    milestones: 'work',
    documents: 'work',
    activity: 'work',
    worklog: 'work',
    team: 'people',
    // legacy aliases — still resolve to people group, ProjectTeamTab opens the right sub-tab
    members: 'people',
    workers: 'people',
    collaborators: 'people',
    funding: 'money',
    transactions: 'money',
  };

  // Resolve legacy tab keys to the unified team tab
  const resolvedActiveTab = (['members', 'workers', 'collaborators'] as const).includes(activeTab as any)
    ? 'team'
    : activeTab;
  const teamInitialSubTab = (['members', 'workers', 'collaborators'] as const).includes(activeTab as any)
    ? (activeTab as 'members' | 'workers' | 'collaborators')
    : undefined;

  useEffect(() => {
    const grp = TAB_TO_GROUP[activeTab];
    if (grp && grp !== activeGroup) setActiveGroup(grp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Handle browser back button
  useEffect(() => {
    if (!open) return;

    const handlePopState = (e: PopStateEvent) => {
      e.preventDefault();
      onClose();
    };

    window.history.pushState({ projectView: true }, '');
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [open, onClose]);

  if (!project) return null;

  const budget = project.total_budget || 0;
  
  // Use actual transaction-based spending from useProjectStats
  const totalSpent = stats.totalSpent;
  const completedMilestones = milestones.filter(m => m.status === 'completed').length;
  
  // Remaining = Allocated (received funds) - Spent (from real transactions)
  const remaining = totalAllocated - totalSpent;
  const budgetUsedPercentage = totalAllocated > 0 
    ? (totalSpent / totalAllocated) * 100 
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
                  onClick={onClose}
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
                  </div>
                  {project.description && (
                    <p className="text-sm text-muted-foreground truncate">{project.description}</p>
                  )}
                </div>

                {!isWorkerOnly && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShareOpen(true)}
                  className="shrink-0"
                  title={t('projects.share.title', 'Podijeli s klijentom')}
                >
                  <Share2 className="w-4 h-4 sm:mr-1" />
                  <span className="hidden sm:inline">{t('projects.share.button', 'Podijeli')}</span>
                </Button>
                )}

                {!isWorkerOnly && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setReportsOpen(true)}
                  className="shrink-0"
                >
                  <BarChart3 className="w-4 h-4 mr-1" />
                  <span className="hidden sm:inline">{t('projects.reports', 'Izvještaji')}</span>
                </Button>
                )}

                {!isWorkerOnly && isManager && project.status !== 'completed' && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setCompleteWizardOpen(true)}
                  className="shrink-0 gap-1"
                  title={t('projects.complete.headerCta', 'Završi projekt')}
                >
                  <Flag className="w-4 h-4 sm:mr-1" />
                  <span className="hidden sm:inline">{t('projects.complete.headerCta', 'Završi projekt')}</span>
                </Button>
                )}

                {!isWorkerOnly && isManager && project.status === 'completed' && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={reopening}
                  onClick={async () => {
                    setReopening(true);
                    try {
                      const { error } = await supabase
                        .from('projects')
                        .update({ status: 'active', archived_at: null })
                        .eq('id', project.id);
                      if (error) throw error;
                      showSuccess(t('projects.complete.reopened', 'Projekt ponovo otvoren'));
                      onRefreshExpenses?.();
                      onClose();
                    } catch (e) {
                      console.error('Reopen project error:', e);
                      showError(t('common.error'));
                    } finally {
                      setReopening(false);
                    }
                  }}
                  className="shrink-0 gap-1"
                  title={t('projects.complete.reopenCta', 'Ponovo otvori projekt')}
                >
                  <RotateCcw className="w-4 h-4 sm:mr-1" />
                  <span className="hidden sm:inline">{t('projects.complete.reopenCta', 'Ponovo otvori')}</span>
                </Button>
                )}
              </div>
            </div>

            <ProjectShareDialog
              open={shareOpen}
              onOpenChange={setShareOpen}
              projectId={project.id}
              projectName={project.name}
            />

            {/* Reports Dialog */}
            <ProjectReportsDialog
              open={reportsOpen}
              onOpenChange={setReportsOpen}
              project={project}
              milestones={milestones}
              members={members}
              expenses={expenses}
              totalSpent={totalSpent}
              totalAllocated={totalAllocated}
            />

            {/* Complete Project Wizard */}
            <CompleteProjectWizard
              open={completeWizardOpen}
              onOpenChange={setCompleteWizardOpen}
              project={project}
              milestones={milestones}
              totalSpent={totalSpent}
              totalAllocated={totalAllocated}
              onOpenReports={() => setReportsOpen(true)}
              onCompleted={() => {
                refetchMilestones();
                onRefreshExpenses?.();
                onClose();
              }}
            />

            {/* Main content */}
            <div className="max-w-6xl mx-auto p-4 pb-24">
              {/* Budget Overview - only show if user can see funding */}
              {canSeeTab('funding') && (
              <div className="p-4 rounded-lg bg-muted/50 space-y-3 mb-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Wallet className="w-5 h-5 text-muted-foreground" />
                      <span className="font-medium">{t('projects.budgetOverview')}</span>
                    </div>
                    {canAccessBusinessTabs && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setBudgetHistoryOpen(true)}
                      title={t('projects.budgetHistory', 'Povijest budžeta')}
                    >
                      <History className="w-4 h-4 text-muted-foreground" />
                    </Button>
                    )}
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
                    <div className="grid grid-cols-3 gap-2 sm:gap-4">
                      <div className="p-2 sm:p-3 rounded-lg bg-income/10 text-center">
                        <p className="text-base sm:text-2xl font-bold text-income truncate">{formatAmount(totalAllocated)}</p>
                        <p className="text-[10px] sm:text-xs text-muted-foreground">{t('projects.received', 'Primljeno')}</p>
                      </div>
                      <div className="p-2 sm:p-3 rounded-lg bg-expense/10 text-center">
                        <p className="text-base sm:text-2xl font-bold text-expense truncate">{formatAmount(totalSpent)}</p>
                        <p className="text-[10px] sm:text-xs text-muted-foreground">{t('projects.spent', 'Potrošeno')}</p>
                      </div>
                      <div className="p-2 sm:p-3 rounded-lg bg-primary/10 text-center">
                        <p className={cn("text-base sm:text-2xl font-bold truncate", remaining >= 0 ? "text-primary" : "text-destructive")}>
                          {formatAmount(remaining)}
                        </p>
                        <p className="text-[10px] sm:text-xs text-muted-foreground">{t('projects.remaining', 'Preostalo')}</p>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-center text-muted-foreground py-2">{t('projects.noFundingYet', 'Nema primljenih sredstava')}</p>
                )}
              </div>
              )}

              {/* Tabs - reorganized in 3 groups: Posao / Ljudi / Novac */}
              <Tabs value={resolvedActiveTab} onValueChange={setActiveTab}>
                {/* Top group selector — hidden for restricted workers */}
                {!isWorkerOnly && (
                <div className="grid grid-cols-3 gap-2 mb-3 p-1 bg-muted/40 rounded-2xl border border-border/30">
                  {([
                    { id: 'work' as TabGroup, icon: Briefcase, label: t('projects.tabs.work', 'Posao') },
                    { id: 'people' as TabGroup, icon: Users, label: t('projects.tabs.people', 'Ljudi') },
                    { id: 'money' as TabGroup, icon: Wallet, label: t('projects.tabs.money', 'Novac') },
                  ]).map(({ id, icon: GroupIcon, label }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setActiveGroup(id);
                        // jump to first visible sub-tab in that group
                        const firstSub: Record<TabGroup, string> = {
                          work: 'overview',
                          people: 'team',
                          money: canSeeTab('funding') ? 'funding' : 'transactions',
                        };
                        setActiveTab(firstSub[id]);
                      }}
                      className={cn(
                        'flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all',
                        activeGroup === id
                          ? 'bg-primary text-primary-foreground shadow-md'
                          : 'text-muted-foreground hover:bg-muted/60'
                      )}
                    >
                      <GroupIcon className="w-4 h-4" />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
                )}

                {/* Sub-tabs for active group */}
                {!isWorkerOnly && (
                <div className="relative mb-6">
                  <div className="overflow-x-auto -mx-4 px-4 scrollbar-hide">
                    <TabsList className="inline-flex gap-1 h-auto p-1 bg-transparent w-auto min-w-max">
                      {/* WORK group */}
                      {activeGroup === 'work' && (
                        <>
                          <TabsTrigger value="overview" className="gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground data-[state=inactive]:text-muted-foreground border border-transparent data-[state=active]:border-border">
                            <TrendingUp className="w-3.5 h-3.5" />
                            {t('projects.overview', 'Pregled')}
                          </TabsTrigger>
                          {canSeeTab('timeline') && (
                            <TabsTrigger value="timeline" className="gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground data-[state=inactive]:text-muted-foreground border border-transparent data-[state=active]:border-border">
                              <GanttChart className="w-3.5 h-3.5" />
                              {t('projects.timeline', 'Timeline')}
                            </TabsTrigger>
                          )}
                          {canSeeTab('milestones') && (
                            <TabsTrigger value="milestones" className="gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground data-[state=inactive]:text-muted-foreground border border-transparent data-[state=active]:border-border">
                              <Target className="w-3.5 h-3.5" />
                              {labels.milestonesLabel}
                              {milestones.length > 0 && (
                                <Badge variant="secondary" className="h-4 px-1 text-[10px] leading-none">{completedMilestones}/{milestones.length}</Badge>
                              )}
                            </TabsTrigger>
                          )}
                          <TabsTrigger value="documents" className="gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground data-[state=inactive]:text-muted-foreground border border-transparent data-[state=active]:border-border">
                            <FolderOpen className="w-3.5 h-3.5" />
                            {labels.documentsLabel}
                          </TabsTrigger>
                          <TabsTrigger value="activity" className="gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground data-[state=inactive]:text-muted-foreground border border-transparent data-[state=active]:border-border">
                            <Activity className="w-3.5 h-3.5" />
                            {t('projects.activity.tab', 'Aktivnost')}
                          </TabsTrigger>
                          <TabsTrigger value="worklog" className="gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground data-[state=inactive]:text-muted-foreground border border-transparent data-[state=active]:border-border">
                            <BookOpen className="w-3.5 h-3.5" />
                            {t('workLog.tab', 'Dnevnik')}
                          </TabsTrigger>
                        </>
                      )}

                      {/* PEOPLE group — single unified "Tim projekta" tab with internal sub-tabs */}
                      {activeGroup === 'people' && (
                        <TooltipProvider delayDuration={200}>
                          <TabsTrigger value="team" className="gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground data-[state=inactive]:text-muted-foreground border border-transparent data-[state=active]:border-border">
                            <Users className="w-3.5 h-3.5" />
                            {t('projects.projectTeam', 'Tim projekta')}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="ml-0.5 inline-flex"><HelpCircle className="w-3 h-3 opacity-60" /></span>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="max-w-[260px] text-xs">
                                {t('projects.tooltips.projectTeam', 'Svi ljudi na projektu: članovi aplikacije, radnici i vanjski suradnici')}
                              </TooltipContent>
                            </Tooltip>
                          </TabsTrigger>
                        </TooltipProvider>
                      )}

                      {/* MONEY group */}
                      {activeGroup === 'money' && (
                        <>
                          {canSeeTab('funding') && (
                            <TabsTrigger value="funding" className="gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground data-[state=inactive]:text-muted-foreground border border-transparent data-[state=active]:border-border">
                              <Wallet className="w-3.5 h-3.5" />
                              {t('projects.funding', 'Financiranje')}
                            </TabsTrigger>
                          )}
                          {canSeeTab('transactions') && (
                            <TabsTrigger value="transactions" className="gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground data-[state=inactive]:text-muted-foreground border border-transparent data-[state=active]:border-border">
                              <FileText className="w-3.5 h-3.5" />
                              {t('projects.transactions', 'Transakcije')}
                              {expenses.length > 0 && (
                                <Badge variant="secondary" className="h-4 px-1 text-[10px] leading-none">{expenses.length}</Badge>
                              )}
                            </TabsTrigger>
                          )}
                        </>
                      )}
                    </TabsList>
                  </div>
                  {/* Fade hint za scroll */}
                  <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent pointer-events-none sm:hidden" />
                </div>
                )}

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

                  {/* Earned Value Card — margin, EAC, contract-based health */}
                  {isBusinessView && (
                    <ProjectEarnedValueCard
                      project={project}
                      spent={stats.totalSpent}
                      milestones={milestones}
                      onEnterContract={() => onRequestEdit?.(project)}
                    />
                  )}

                  {/* P&L Card - only in business view */}
                  {canAccessBusinessTabs && (
                    <ProjectProfitLossCard projectId={project.id} />
                  )}
                </TabsContent>

                {canSeeTab('timeline') && (
                <TabsContent value="timeline" className="m-0">
                  <ProjectTimelineTab
                    projectId={project.id}
                    milestones={milestones}
                    projectStartDate={project.start_date}
                    projectEndDate={project.end_date}
                    loading={milestonesLoading}
                  />
                </TabsContent>
                )}

                {canSeeTab('milestones') && (
                <TabsContent value="milestones" className="m-0">
                  <ProjectMilestonesTab 
                    projectId={project.id}
                    milestones={milestones}
                    isManager={isManager}
                    loading={milestonesLoading}
                    onRefetch={refetchMilestones}
                  />
                </TabsContent>
                )}

                <TabsContent value="team" className="m-0">
                  <ProjectTeamTab
                    projectId={project.id}
                    projectName={project.name}
                    members={members}
                    invitations={invitations}
                    isManager={isManager}
                    membersLoading={membersLoading}
                    onRefetchMembers={refetchMembers}
                    milestones={milestones}
                    canSeeWorkers={canSeeTab('workers')}
                    canSeeCollaborators={canSeeTab('collaborators')}
                    initialSubTab={teamInitialSubTab}
                    projectStatus={project.status}
                    archivedAt={project.archived_at ?? null}
                  />
                </TabsContent>

                <TabsContent value="documents" className="m-0">
                  <ProjectDocumentsTab projectId={project.id} />
                </TabsContent>

                <TabsContent value="activity" className="m-0">
                  <ProjectActivityTab projectId={project.id} />
                </TabsContent>

                <TabsContent value="worklog" className="m-0">
                  <ProjectWorkLogTab projectId={project.id} isManager={isManager} projectName={project.name} />
                </TabsContent>

                {canSeeTab('funding') && (
                <TabsContent value="funding" className="m-0">
                  <ProjectFundingTab
                    projectId={project.id}
                    funding={funding}
                    incomeSources={incomeSources}
                    milestones={milestones}
                    totalAllocated={totalAllocated}
                    totalSpent={totalSpent}
                    projectBudget={budget}
                    isManager={isManager}
                    loading={fundingLoading}
                    onRefetch={refetchFunding}
                  />
                </TabsContent>
                )}



                {canSeeTab('transactions') && (
                <TabsContent value="transactions" className="m-0">
                  <ProjectTransactionsTab
                    projectId={project.id}
                    projectName={project.name}
                    expenses={expenses}
                    milestones={milestones}
                    isManager={isManager}
                    userRole={currentUserRole}
                    loading={statsLoading}
                    onRefetch={() => {
                      refetchStats();
                      refetchMilestones();
                    }}
                  />
                </TabsContent>
                )}

              </Tabs>
            </div>

            {/* Budget History Dialog */}
            <ProjectBudgetHistoryDialog
              open={budgetHistoryOpen}
              onOpenChange={setBudgetHistoryOpen}
              projectId={project.id}
            />
          </motion.div>

        </>
      )}
    </AnimatePresence>
  );
};
