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
import { ContractAmendmentsBadge } from './ContractAmendmentsBadge';
import { ProjectForecastCard } from './ProjectForecastCard';
import { useProjectLossZoneAlert } from '@/hooks/useProjectLossZoneAlert';
import { useProjectContractAmendments } from '@/hooks/useProjectContractAmendments';

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
import { useProjectWorkers } from '@/hooks/useProjectWorkers';
import { useProjectTypeLabels } from '@/hooks/useProjectTypeLabels';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { useProjectAccessLevel, isReadOnlyAccess } from '@/hooks/useProjectAccessLevel';
import { ProjectReadOnlyBanner } from './ProjectReadOnlyBanner';
import { isProjectsReadonlyError } from '@/lib/softDelete';

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
  const [activeTab, setActiveTab] = useState(initialTab || 'phases');
  const [activeGroup, setActiveGroup] = useState<TabGroup>('work');
  useBackButton(open, onClose);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [budgetHistoryOpen, setBudgetHistoryOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [completeWizardOpen, setCompleteWizardOpen] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [phasesView, setPhasesView] = useState<'list' | 'timeline'>('list');

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
  const { workers } = useProjectWorkers(project?.id || null);
  const { totalPaid: collaboratorsPaid, totalCost: collaboratorsAgreed } = useProjectCollaborators(project?.id || null);
  const { isTabVisible, loading: permsLoading } = useProjectMemberPermissions(project?.id || null);
  const { total: amendmentsTotal } = useProjectContractAmendments(project?.id || null);

  // Razlika prikaza i računanja:
  // - effectiveContract (=contract_value, koji već uključuje aneks) koristi se za marže/% potrošnje/% naplate/alarme.
  // - originalContract (=effectiveContract - amendmentsTotal) prikazuje se u KPI "Ugovoreno"; aneks se prikazuje zasebnim badgeom ispod.
  const effectiveContract = Number(project?.contract_value) > 0
    ? Number(project?.contract_value)
    : Number(project?.total_budget) || 0;
  const originalContract = Math.max(0, effectiveContract - (amendmentsTotal || 0));

  // Loss-zone alert: fires in-app notification when spent crosses 90% of effective contract value
  useProjectLossZoneAlert({
    projectId: project?.id,
    projectName: project?.name,
    contractValue: effectiveContract,
    spent: stats.totalSpent,
  });
  
  const currentUserRole = project?.role || 'viewer';
  const isWorkerOnly = currentUserRole === 'worker' && !isManager;
  const { activeBusinessProfileId } = useAppState();
  const { hasAccess } = useFeatureAccess();
  const labels = useProjectTypeLabels(project);
  const { user } = useAuth();
  const navigate = useNavigate();
  const isOwner = !!project && !!user && project.user_id === user.id;
  const accessLevel = useProjectAccessLevel(
    project ? { user_id: project.user_id, isParticipant: !isOwner } : null
  );
  const isReadOnly = isReadOnlyAccess(accessLevel);
  const handleUpgradeProjects = () => navigate('/paywall');

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
    // Worklog tab in People group: only visible if project has at least one worker
    if (tabKey === 'worklog') return (workers?.length ?? 0) > 0 && (isManager || isTabVisible('worklog'));
    return isManager || isTabVisible(tabKey);
  };

  // Reset tab when project changes or closes
  useEffect(() => {
    if (!open) {
      setActiveTab(isWorkerOnly ? 'worklog' : 'phases');
      setActiveGroup('work');
    } else if (isWorkerOnly) {
      setActiveTab('worklog');
      setActiveGroup('work');
    }
  }, [open, project?.id, isWorkerOnly]);

  // Map tab to its group (for auto-switching group when initialTab is set)
  const TAB_TO_GROUP: Record<string, TabGroup> = {
    overview: 'work',
    phases: 'work',
    // legacy aliases — resolved to phases below
    timeline: 'work',
    milestones: 'work',
    documents: 'work',
    activity: 'work',
    worklog: 'people',
    team: 'people',
    members: 'people',
    workers: 'people',
    collaborators: 'people',
    funding: 'money',
    transactions: 'money',
  };

  // Resolve legacy tab keys to the unified tabs
  const resolvedActiveTab = (() => {
    if (['members', 'workers', 'collaborators'].includes(activeTab)) return 'team';
    if (['timeline', 'milestones'].includes(activeTab)) return 'phases';
    return activeTab;
  })();
  const teamInitialSubTab = (['members', 'workers', 'collaborators'] as const).includes(activeTab as any)
    ? (activeTab as 'members' | 'workers' | 'collaborators')
    : undefined;

  // Sync internal view-switchers when arriving via legacy initialTab
  useEffect(() => {
    if (activeTab === 'timeline') setPhasesView('timeline');
    else if (activeTab === 'milestones') setPhasesView('list');
  }, [activeTab]);

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

  const budget = effectiveContract;

  // Use actual transaction-based spending from useProjectStats
  const totalSpent = stats.totalSpent;
  const completedMilestones = milestones.filter(m => m.status === 'completed').length;
  const overdueMilestones = milestones.filter(m => m.status === 'overdue').length;

  // Total received = income transactions + funding allocations
  // Naplaćeno = samo stvarne income transakcije na projektu.
  // project_funding (totalAllocated) je alokacija izvora, ne stvarna uplata klijenta.
  const totalReceived = stats.totalIncome || 0;

  // Margin — identical formula to ActiveProjectsStrip home card: (budget - spent) / budget
  const marginPct = budget > 0 ? ((budget - totalSpent) / budget) * 100 : null;
  const marginStatusKey: 'healthy' | 'attention' | 'critical' | 'neutral' =
    marginPct === null ? 'neutral'
    : marginPct >= 30 ? 'healthy'
    : marginPct >= 10 ? 'attention'
    : 'critical';

  const costPct = budget > 0 ? (totalSpent / budget) * 100 : 0;
  const collectionPct = budget > 0 ? (totalReceived / budget) * 100 : 0;

  // Independent alarms (only when contracted budget exists)
  const showBudgetAlarm = budget > 0 && costPct >= 80;
  const daysSinceStart = project.start_date
    ? Math.floor((Date.now() - new Date(project.start_date).getTime()) / 86400000)
    : 0;
  const showCollectionAlarm = budget > 0 && collectionPct < 50 && daysSinceStart > 30;

  // Status token maps
  const marginDotClass = {
    healthy: 'bg-income',
    attention: 'bg-warning',
    critical: 'bg-destructive',
    neutral: 'bg-muted-foreground',
  }[marginStatusKey];
  const marginTextClass = {
    healthy: 'text-income',
    attention: 'text-warning',
    critical: 'text-destructive',
    neutral: 'text-muted-foreground',
  }[marginStatusKey];
  const marginBarClass = {
    healthy: '[&>div]:bg-income',
    attention: '[&>div]:bg-warning',
    critical: '[&>div]:bg-destructive',
    neutral: '',
  }[marginStatusKey];
  const marginStatusLabel = t(`projects.marginStatus.${marginStatusKey}`,
    marginStatusKey === 'healthy' ? 'Zdrav'
    : marginStatusKey === 'attention' ? 'Pažnja'
    : marginStatusKey === 'critical' ? 'Kritično' : '—');

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
                  onClick={() => {
                    if (isReadOnly) {
                      showError(t('projects.access.readOnlyBlockedToast'));
                      return;
                    }
                    setCompleteWizardOpen(true);
                  }}
                  disabled={isReadOnly}
                  className="shrink-0 gap-1"
                  title={isReadOnly ? t('projects.access.readOnlyBlockedToast') : t('projects.complete.headerCta', 'Završi projekt')}
                >
                  <Flag className="w-4 h-4 sm:mr-1" />
                  <span className="hidden sm:inline">{t('projects.complete.headerCta', 'Završi projekt')}</span>
                </Button>
                )}

                {!isWorkerOnly && isManager && project.status === 'completed' && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={reopening || isReadOnly}
                  onClick={async () => {
                    if (isReadOnly) {
                      showError(t('projects.access.readOnlyBlockedToast'));
                      return;
                    }
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
                      if (isProjectsReadonlyError(e)) {
                        showError(t('projects.access.readOnlyBlockedToast'));
                      } else {
                        showError(t('common.error'));
                      }
                    } finally {
                      setReopening(false);
                    }
                  }}
                  className="shrink-0 gap-1"
                  title={isReadOnly ? t('projects.access.readOnlyBlockedToast') : t('projects.complete.reopenCta', 'Ponovo otvori projekt')}
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
              isReadOnly={isReadOnly}
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
              {isReadOnly && (
                <ProjectReadOnlyBanner
                  reason={isOwner ? 'owner_downgrade' : 'participant'}
                  onUpgradeClick={isOwner ? handleUpgradeProjects : undefined}
                  className="mb-4"
                />
              )}
              {/* Budget Overview - only show if user can see funding */}
              {canSeeTab('funding') && (
              <div className="p-4 rounded-lg bg-muted/50 space-y-4 mb-6">
                <div className="flex items-center justify-between">
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

                {budget > 0 || totalReceived > 0 || totalSpent > 0 ? (
                  <>
                    {/* 4 KPI cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                      <div className="p-2 sm:p-3 rounded-lg bg-muted text-center">
                        <p className="text-base sm:text-xl font-bold tabular-nums truncate">{formatAmount(originalContract)}</p>
                        <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">{t('projects.contracted', 'Ugovoreno')}</p>
                        <ContractAmendmentsBadge projectId={project.id} />
                      </div>
                      <div className="p-2 sm:p-3 rounded-lg bg-income/10 text-center">
                        <p className="text-base sm:text-xl font-bold text-income tabular-nums truncate">{formatAmount(totalReceived)}</p>
                        <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
                          {t('projects.received', 'Primljeno')}
                        </p>
                        {budget > 0 && (
                          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                            {t('projects.receivedOfContract', '{{pct}}% od ugovorenog', { pct: collectionPct.toFixed(0) })}
                          </p>
                        )}
                      </div>
                      <div className="p-2 sm:p-3 rounded-lg bg-expense/10 text-center">
                        <p className="text-base sm:text-xl font-bold text-expense tabular-nums truncate">{formatAmount(totalSpent)}</p>
                        <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">{t('projects.spent', 'Potrošeno')}</p>
                      </div>
                      <div className="p-2 sm:p-3 rounded-lg bg-muted text-center">
                        <p className={cn('text-base sm:text-xl font-bold tabular-nums truncate', marginTextClass)}>
                          {marginPct !== null ? `${marginPct.toFixed(0)}%` : '—'}
                        </p>
                        <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">{t('projects.margin', 'Marža')}</p>
                        <div className="flex items-center justify-center gap-1 mt-1">
                          <span className={cn('w-1.5 h-1.5 rounded-full', marginDotClass)} />
                          <span className={cn('text-[10px]', marginTextClass)}>{marginStatusLabel}</span>
                        </div>
                      </div>
                    </div>

                    {/* Dual progress bars (need a budget to be meaningful) */}
                    {budget > 0 && (
                      <div className="space-y-3">
                        <div>
                          <div className="flex items-center justify-between text-[11px] sm:text-xs mb-1">
                            <span className="text-muted-foreground">
                              {t('projects.progress.cost', 'Trošak')} · {costPct.toFixed(0)}%
                            </span>
                            <span className="text-muted-foreground tabular-nums">
                              {formatAmount(totalSpent)} / {formatAmount(budget)}
                            </span>
                          </div>
                          <Progress value={Math.min(costPct, 100)} className={cn('h-2', marginBarClass)} />
                        </div>
                        <div>
                          <div className="flex items-center justify-between text-[11px] sm:text-xs mb-1">
                            <span className="text-muted-foreground">
                              {t('projects.progress.collection', 'Naplata')} · {collectionPct.toFixed(0)}%
                            </span>
                            <span className="text-muted-foreground tabular-nums">
                              {formatAmount(totalReceived)} / {formatAmount(budget)}
                            </span>
                          </div>
                          <Progress value={Math.min(collectionPct, 100)} className="h-2 [&>div]:bg-primary" />
                        </div>
                      </div>
                    )}

                    {/* Independent alarms */}
                    {(showBudgetAlarm || showCollectionAlarm) && (
                      <div className="space-y-2">
                        {showBudgetAlarm && (
                          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-destructive/10 text-destructive text-xs">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>
                              {t('projects.alerts.budgetHigh', '⚠️ Potrošio si {{pct}}% ugovorenog budžeta', { pct: costPct.toFixed(0) })}
                            </span>
                          </div>
                        )}
                        {showCollectionAlarm && (
                          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-warning/10 text-warning text-xs">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>
                              {t('projects.alerts.collectionLow', '💰 Naplaćeno samo {{pct}}%. Razmisli o podsjetniku klijentu.', { pct: collectionPct.toFixed(0) })}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-center text-muted-foreground py-2">{t('projects.noFundingYet', 'Nema primljenih sredstava')}</p>
                )}
              </div>
              )}

              {/* Forecast section */}
              {canSeeTab('funding') && budget > 0 && (
                <ProjectForecastCard totalBudget={budget} spent={totalSpent} milestones={milestones} />
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
                          {(canSeeTab('milestones') || canSeeTab('timeline')) && (
                            <TabsTrigger value="phases" className="gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground data-[state=inactive]:text-muted-foreground border border-transparent data-[state=active]:border-border">
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
                        </>
                      )}

                      {/* PEOPLE group — Tim projekta + Dnevnik rada (if project has workers) */}
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
                          {canSeeTab('worklog') && (
                            <TabsTrigger value="worklog" className="gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground data-[state=inactive]:text-muted-foreground border border-transparent data-[state=active]:border-border">
                              <BookOpen className="w-3.5 h-3.5" />
                              {t('workLog.tab', 'Dnevnik rada')}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="ml-0.5 inline-flex"><HelpCircle className="w-3 h-3 opacity-60" /></span>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="max-w-[260px] text-xs">
                                  {t('projects.tooltips.workLog', 'Upisani sati radnika po danima i obračun isplata')}
                                </TooltipContent>
                              </Tooltip>
                            </TabsTrigger>
                          )}
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
                    <ProjectProfitLossCard projectId={project.id} projectName={project.name} />
                  )}
                </TabsContent>

                {(canSeeTab('milestones') || canSeeTab('timeline')) && (
                <TabsContent value="phases" className="m-0 space-y-3">
                  {canSeeTab('timeline') && (
                    <div className="inline-flex p-1 bg-muted/40 rounded-lg border border-border/30">
                      <button
                        type="button"
                        onClick={() => setPhasesView('list')}
                        className={cn(
                          'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
                          phasesView === 'list' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'
                        )}
                      >
                        {t('projects.kanban.list', 'Lista')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPhasesView('timeline')}
                        className={cn(
                          'px-3 py-1.5 text-xs font-medium rounded-md transition-all inline-flex items-center gap-1',
                          phasesView === 'timeline' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'
                        )}
                      >
                        <GanttChart className="w-3 h-3" />
                        {t('projects.timeline', 'Timeline')}
                      </button>
                    </div>
                  )}
                  {phasesView === 'timeline' && canSeeTab('timeline') ? (
                    <ProjectTimelineTab
                      projectId={project.id}
                      milestones={milestones}
                      projectStartDate={project.start_date}
                      projectEndDate={project.end_date}
                      loading={milestonesLoading}
                    />
                  ) : (
                    <ProjectMilestonesTab
                      projectId={project.id}
                      milestones={milestones}
                      isManager={isManager}
                      loading={milestonesLoading}
                      onRefetch={refetchMilestones}
                      isReadOnly={isReadOnly}
                    />
                  )}
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
                    isReadOnly={isReadOnly}
                  />
                </TabsContent>

                <TabsContent value="documents" className="m-0">
                  <ProjectDocumentsTab projectId={project.id} isReadOnly={isReadOnly} />
                </TabsContent>

                <TabsContent value="activity" className="m-0">
                  <ProjectActivityTab projectId={project.id} />
                </TabsContent>

                {canSeeTab('worklog') && (
                <TabsContent value="worklog" className="m-0">
                  <ProjectWorkLogTab projectId={project.id} isManager={isManager} projectName={project.name} isReadOnly={isReadOnly} />
                </TabsContent>
                )}

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
                    isReadOnly={isReadOnly}
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
