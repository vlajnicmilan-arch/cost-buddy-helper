import { useState, useEffect, useMemo, useRef } from 'react';
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
import { isNativeFlowActive } from '@/lib/nativeFlowGuard';
import { logDiagnostic } from '@/lib/diagnosticLogger';
import { useAppState } from '@/contexts/AppStateContext';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import {
  Wallet, Target, Users, FileText, TrendingUp, X,
  Calendar, AlertTriangle, GanttChart, BarChart3, ClipboardList, Handshake, ChevronRight, History, Clock,
  FolderOpen, Share2, Activity, BookOpen, Flag, RotateCcw, Scale
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { CompleteProjectWizard } from './CompleteProjectWizard';
import { MobileProjectTabs, type MobileTabDef } from './MobileProjectTabs';
import { ProjectShareDialog } from './ProjectShareDialog';
import { ProjectDeleteDialog } from './ProjectDeleteDialog';
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
import { ProjectDecisionsTab } from './ProjectDecisionsTab';
import { ProjectWorkLogTab } from './ProjectWorkLogTab';
import { useProjectWorkers } from '@/hooks/useProjectWorkers';
import { useProjectDocuments } from '@/hooks/useProjectDocuments';
import { useProjectTypeLabels } from '@/hooks/useProjectTypeLabels';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { useProjectAccessLevel, isReadOnlyAccess } from '@/hooks/useProjectAccessLevel';
import { deriveProjectPermissions } from '@/lib/projectRolePermissions';
import { ProjectReadOnlyBanner } from './ProjectReadOnlyBanner';
import { isProjectsReadonlyError } from '@/lib/softDelete';
import { ProjectHeaderMenu } from './ProjectHeaderMenu';
import { ProjectBudgetTab } from './ProjectBudgetTab';
import { ProjectQuickStartCards } from './ProjectQuickStartCards';
import { LocalStorage } from '@/hooks/useLocalStorage';
import { resolveProjectTabVisibility } from '@/lib/projectTabVisibility';
import { resolveLegacyTabAlias } from '@/lib/projectTabAliases';

import { motion, AnimatePresence } from 'framer-motion';



interface ProjectFullScreenViewProps {
  open: boolean;
  onClose: () => void;
  project: ProjectWithOwnership | null;
  onRefreshExpenses?: () => void;
  initialTab?: string;
  /** Called when user wants to edit the project (e.g. from "enter contract value" CTA). */
  onRequestEdit?: (project: ProjectWithOwnership) => void;
  /** Optional: archive/unarchive trigger from the header ⋮ menu. */
  onRequestArchive?: (id: string, archive: boolean) => void;
  /** Optional: delete trigger from the header ⋮ menu (only enabled for archived projects). */
  onRequestDelete?: (id: string) => void;
}

export const ProjectFullScreenView = ({
  open,
  onClose,
  project,
  onRefreshExpenses,
  initialTab,
  onRequestEdit,
  onRequestArchive,
  onRequestDelete
}: ProjectFullScreenViewProps) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const [activeTab, setActiveTab] = useState(initialTab || 'overview');
  const handleTabChange = (next: string) => {
    try {
      logDiagnostic({ event: 'pfsv_tab_changed', details: { from: activeTab, to: next, projectId: project?.id ?? null } });
    } catch { /* ignore */ }
    setActiveTab(next);
  };
  useBackButton(open, onClose);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [budgetHistoryOpen, setBudgetHistoryOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [completeWizardOpen, setCompleteWizardOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [phasesView, setPhasesView] = useState<'list' | 'timeline'>('list');

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  // dbg: log every open change
  useEffect(() => {
    logDiagnostic({
      event: 'dbg_pfsv_open_change',
      details: { open, projectId: project?.id ?? null, nativeFlowActive: isNativeFlowActive() },
    });
  }, [open, project?.id]);

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
  const { documents } = useProjectDocuments(project?.id || null);

  // Wave 2: Lite vs Full unifikacija — single tab strip, no view-mode toggle, no "More" sheet.
  const [quickStartDismissed, setQuickStartDismissed] = useState(false);
  useEffect(() => {
    if (!project?.id) return;
    LocalStorage.get(`projectQuickStart_dismissed:${project.id}`)
      .then((v) => setQuickStartDismissed(v === '1'))
      .catch(() => setQuickStartDismissed(false));
  }, [project?.id]);
  const dismissQuickStart = () => {
    setQuickStartDismissed(true);
    if (project?.id) {
      LocalStorage.set(`projectQuickStart_dismissed:${project.id}`, '1').catch(() => {});
    }
  };

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
  // Owner-readonly billing downgrade — only true when the current user IS the
  // owner but lacks an active Projects subscription. Participants never get
  // this flag (they fall under 'participant' accessLevel).
  const isOwnerReadonly = accessLevel === 'owner_readonly';
  // Single source of truth for role-based worklog permission.
  const worklogPerms = deriveProjectPermissions({ role: currentUserRole, isOwner });
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

  // Determine if current user can see a tab — delegated to pure helper (1:1 with prior inline logic).
  const canSeeTab = (tabKey: string) =>
    resolveProjectTabVisibility({
      tabKey,
      isWorkerOnly,
      isManager,
      isTabVisible,
      canSeeWorkers,
      canSeeCollaborators,
      hasWorkers: (workers?.length ?? 0) > 0,
    });

  // Modul "Odluke" (Faza 1) — vidljiv SAMO vlasniku ILI investitoru.
  // Ostale uloge (member/viewer/worker) tab uopće ne dobivaju.
  const investorMember = members.find((m) => m.role === 'investor');
  const investorUserId = investorMember?.user_id ?? null;
  const canSeeDecisions = !isWorkerOnly && (isOwner || currentUserRole === 'investor');
  const memberNameMap = new Map<string, string>(
    members.map((m) => [m.user_id, m.display_name || ''])
  );

  // Reset tab when project changes or closes
  useEffect(() => {
    if (!open) {
      logDiagnostic({
        event: 'dbg_pfsv_tab_reset',
        details: { branch: 'closed', open, isWorkerOnly, prevTab: activeTab, projectId: project?.id ?? null },
      });
      setActiveTab(isWorkerOnly ? 'worklog' : 'overview');
    } else if (isWorkerOnly) {
      logDiagnostic({
        event: 'dbg_pfsv_tab_reset',
        details: { branch: 'workerOnly', open, isWorkerOnly, prevTab: activeTab, projectId: project?.id ?? null },
      });
      setActiveTab('worklog');
    }
  }, [open, project?.id, isWorkerOnly]);

  // Resolve legacy tab keys to the unified tabs (pure helper — covered by tests)
  const aliasResolution = resolveLegacyTabAlias(activeTab);
  const resolvedActiveTab = aliasResolution.tab;
  const teamInitialSubTab = aliasResolution.teamSubTab;

  // Sync internal view-switchers when arriving via legacy initialTab
  useEffect(() => {
    if (activeTab === 'timeline') setPhasesView('timeline');
    else if (activeTab === 'milestones') setPhasesView('list');
  }, [activeTab]);


  // Handle browser back button
  useEffect(() => {
    if (!open) return;

    const handlePopState = (e: PopStateEvent) => {
      const guarded = isNativeFlowActive();
      logDiagnostic({ event: 'dbg_pfsv_popstate', details: { guarded, projectId: project?.id ?? null } });
      // Ignore synthetic popstate emitted by Android when a native activity
      // (camera, file picker, share sheet, …) returns focus to the WebView.
      // Otherwise it would close the project view mid-flight and destroy any
      // draft (e.g. a decision being composed) — see AddExpenseDialog pattern.
      if (guarded) {
        window.history.pushState({ projectView: true }, '');
        return;
      }
      e.preventDefault();
      logDiagnostic({ event: 'dbg_pfsv_close_via_popstate', details: { projectId: project?.id ?? null } });
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
                  <ProjectHeaderMenu
                    isManager={isManager}
                    isReadOnly={isReadOnly}
                    projectCompleted={project.status === 'completed'}
                    projectArchived={!!project.archived_at}
                    
                    canDelete={!!onRequestDelete}
                    canArchive={!!onRequestArchive}
                    onEdit={() => onRequestEdit?.(project)}
                    onOpenReports={() => setReportsOpen(true)}
                    onComplete={() => {
                      if (isReadOnly) {
                        showError(t('projects.access.readOnlyBlockedToast'));
                        return;
                      }
                      setCompleteWizardOpen(true);
                    }}
                    onReopen={async () => {
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
                    onArchiveToggle={() => onRequestArchive?.(project.id, !project.archived_at)}
                    onDelete={() => {
                      if (isReadOnly) {
                        showError(t('projects.access.readOnlyBlockedToast'));
                        return;
                      }
                      setDeleteDialogOpen(true);
                    }}
                  />
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

            <ProjectDeleteDialog
              open={deleteDialogOpen}
              onOpenChange={setDeleteDialogOpen}
              isArchived={!!project.archived_at}
              onArchive={
                onRequestArchive
                  ? () => onRequestArchive(project.id, true)
                  : undefined
              }
              onDelete={() => onRequestDelete?.(project.id)}
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
              {/* Budget Overview block removed (Faza 2 #3 — budget dedup).
                  Kanonski prikaz živi u Funding/Budget tabu;
                  Overview hijerarhija (#4) dolazi u NEXT WAVE. */}


              {/* Forecast section — shown whenever funding is visible and a budget exists. */}
              {canSeeTab('funding') && budget > 0 && (
                <ProjectForecastCard totalBudget={budget} spent={totalSpent} milestones={milestones} />
              )}

              {/* Wave 2: unified single tab strip.
                  Mobile: fixed 4+1 (Overview, Budget, Phases, Team) + "More" sheet for overflow.
                  Desktop (sm+): full horizontal TabsList. */}
              <Tabs value={resolvedActiveTab} onValueChange={handleTabChange}>
                {!isWorkerOnly && (() => {
                  const triggerCls = 'gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground data-[state=inactive]:text-muted-foreground border border-transparent data-[state=active]:border-border';

                  // Mobile fixed primary order: Overview, Budget, Phases, Team.
                  // Invisible primaries are skipped (slot omitted) — positions of visible ones never change.
                  const primary: MobileTabDef[] = [
                    { key: 'overview', label: t('projects.overview', 'Pregled'), icon: TrendingUp },
                    { key: 'budget', label: t('projects.budgetTab.label', 'Budžet'), icon: Wallet },
                    ...(canSeeTab('milestones') || canSeeTab('timeline')
                      ? [{
                          key: 'phases',
                          label: labels.milestonesLabel,
                          icon: Target,
                          badge: milestones.length > 0 ? (
                            <Badge variant="secondary" className="h-4 px-1 text-[10px] leading-none">{completedMilestones}/{milestones.length}</Badge>
                          ) : undefined,
                        } as MobileTabDef]
                      : []),
                    { key: 'team', label: t('projects.projectTeam', 'Tim projekta'), icon: Users },
                  ];

                  const overflow: MobileTabDef[] = [
                    ...(canSeeDecisions
                      ? [{ key: 'decisions', label: t('projects.decisions.tab', 'Odluke'), icon: Scale } as MobileTabDef]
                      : []),
                    ...(canSeeTab('funding')
                      ? [{ key: 'funding', label: t('projects.funding', 'Financiranje'), icon: Handshake } as MobileTabDef]
                      : []),
                    ...(canSeeTab('transactions')
                      ? [{
                          key: 'transactions',
                          label: t('projects.transactions', 'Transakcije'),
                          icon: FileText,
                          badge: expenses.length > 0 ? (
                            <Badge variant="secondary" className="h-4 px-1 text-[10px] leading-none">{expenses.length}</Badge>
                          ) : undefined,
                        } as MobileTabDef]
                      : []),
                    ...(canSeeTab('worklog')
                      ? [{ key: 'worklog', label: t('workLog.tab', 'Dnevnik rada'), icon: BookOpen } as MobileTabDef]
                      : []),
                    { key: 'documents', label: labels.documentsLabel, icon: FolderOpen },
                    { key: 'activity', label: t('projects.activity.tab', 'Aktivnost'), icon: Activity },
                  ];

                  return (
                    <>
                      <MobileProjectTabs
                        value={resolvedActiveTab}
                        onValueChange={handleTabChange}
                        primary={primary}
                        overflow={overflow}
                      />
                      <div className="hidden sm:block mb-6">
                        <div className="overflow-x-auto -mx-4 px-4 scrollbar-hide">
                          <TabsList className="inline-flex gap-1 h-auto p-1 bg-transparent w-auto min-w-max">
                            <TabsTrigger value="overview" className={triggerCls}>
                              <TrendingUp className="w-3.5 h-3.5" />
                              {t('projects.overview', 'Pregled')}
                            </TabsTrigger>
                            <TabsTrigger value="budget" className={triggerCls}>
                              <Wallet className="w-3.5 h-3.5" />
                              {t('projects.budgetTab.label', 'Budžet')}
                            </TabsTrigger>
                            {(canSeeTab('milestones') || canSeeTab('timeline')) && (
                              <TabsTrigger value="phases" className={triggerCls}>
                                <Target className="w-3.5 h-3.5" />
                                {labels.milestonesLabel}
                                {milestones.length > 0 && (
                                  <Badge variant="secondary" className="h-4 px-1 text-[10px] leading-none">{completedMilestones}/{milestones.length}</Badge>
                                )}
                              </TabsTrigger>
                            )}
                            {canSeeTab('funding') && (
                              <TabsTrigger value="funding" className={triggerCls}>
                                <Handshake className="w-3.5 h-3.5" />
                                {t('projects.funding', 'Financiranje')}
                              </TabsTrigger>
                            )}
                            {canSeeTab('transactions') && (
                              <TabsTrigger value="transactions" className={triggerCls}>
                                <FileText className="w-3.5 h-3.5" />
                                {t('projects.transactions', 'Transakcije')}
                                {expenses.length > 0 && (
                                  <Badge variant="secondary" className="h-4 px-1 text-[10px] leading-none">{expenses.length}</Badge>
                                )}
                              </TabsTrigger>
                            )}
                            <TabsTrigger value="team" className={triggerCls}>
                              <Users className="w-3.5 h-3.5" />
                              {t('projects.projectTeam', 'Tim projekta')}
                            </TabsTrigger>
                            {canSeeTab('worklog') && (
                              <TabsTrigger value="worklog" className={triggerCls}>
                                <BookOpen className="w-3.5 h-3.5" />
                                {t('workLog.tab', 'Dnevnik rada')}
                              </TabsTrigger>
                            )}
                            <TabsTrigger value="documents" className={triggerCls}>
                              <FolderOpen className="w-3.5 h-3.5" />
                              {labels.documentsLabel}
                            </TabsTrigger>
                            <TabsTrigger value="activity" className={triggerCls}>
                              <Activity className="w-3.5 h-3.5" />
                              {t('projects.activity.tab', 'Aktivnost')}
                            </TabsTrigger>
                            {canSeeDecisions && (
                              <TabsTrigger value="decisions" className={triggerCls}>
                                <Scale className="w-3.5 h-3.5" />
                                {t('projects.decisions.tab', 'Odluke')}
                              </TabsTrigger>
                            )}
                          </TabsList>
                        </div>
                      </div>
                    </>
                  );
                })()}



                <TabsContent value="overview" className="m-0 space-y-4">
                  {/* Quick Start cards — prikazuju se dok god ima nedovršenih koraka */}
                  {!quickStartDismissed && (() => {
                    const hasMilestones = milestones.length > 0;
                    const hasTransactions = expenses.length > 0;
                    const hasBudget = budget > 0;
                    const hasTeam = (members.length + invitations.length) > 1;
                    const allDone = hasMilestones && hasTransactions && hasBudget && hasTeam;
                    if (allDone) return null;
                    return (
                      <ProjectQuickStartCards
                        hasMilestones={hasMilestones}
                        hasTransactions={hasTransactions}
                        hasBudget={hasBudget}
                        hasTeam={hasTeam}
                        isManager={isManager}
                        onAddMilestone={() => setActiveTab('phases')}
                        onAddTransaction={() => setActiveTab('transactions')}
                        onSetBudget={() => onRequestEdit?.(project)}
                        onInviteTeam={() => setActiveTab('team')}
                        onDismiss={dismissQuickStart}
                      />
                    );
                  })()}

                  {/* #4 Overview hierarchy — KPIs first, progress next, meta last */}

                  {/* 1. P&L Card — primary financial KPI (business view) */}
                  {canAccessBusinessTabs && (
                    <ProjectProfitLossCard projectId={project.id} projectName={project.name} />
                  )}

                  {/* 2. Earned Value Card — margin, EAC, contract-based health */}
                  {isBusinessView && (
                    <ProjectEarnedValueCard
                      project={project}
                      spent={stats.totalSpent}
                      milestones={milestones}
                      onEnterContract={() => onRequestEdit?.(project)}
                    />
                  )}

                  {/* 3. Milestones progress */}
                  {milestones.length > 0 && (
                    <div className="p-4 rounded-lg border">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Target className="w-4 h-4 text-module-muted" />
                          <span className="font-medium text-module-muted">{t('projects.milestonesProgress')}</span>
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

                  {/* 4. Timeline — meta context at the bottom */}
                  {(project.start_date || project.end_date) && (
                    <div className="p-4 rounded-lg border">
                      <div className="flex items-center gap-2 mb-2">
                        <Calendar className="w-4 h-4 text-module-muted" />
                        <span className="font-medium text-module-muted">{t('projects.timeline')}</span>
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
                </TabsContent>

                {/* Budget tab — extracted KPI panel; available in both Lite and Full mode */}
                <TabsContent value="budget" className="m-0">
                  <ProjectBudgetTab
                    project={project}
                    budget={budget}
                    originalContract={originalContract}
                    totalReceived={totalReceived}
                    totalSpent={totalSpent}
                    costPct={costPct}
                    collectionPct={collectionPct}
                    marginPct={marginPct}
                    marginStatusKey={marginStatusKey}
                    showBudgetAlarm={showBudgetAlarm}
                    showCollectionAlarm={showCollectionAlarm}
                    canAccessBusinessTabs={canAccessBusinessTabs}
                    onOpenBudgetHistory={() => setBudgetHistoryOpen(true)}
                    onRequestEdit={onRequestEdit ? () => onRequestEdit(project) : undefined}
                  />
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
                          phasesView === 'list' ? 'bg-background shadow-sm text-module' : 'text-muted-foreground'
                        )}
                      >
                        {t('projects.kanban.list', 'Lista')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPhasesView('timeline')}
                        className={cn(
                          'px-3 py-1.5 text-xs font-medium rounded-md transition-all inline-flex items-center gap-1',
                          phasesView === 'timeline' ? 'bg-background shadow-sm text-module' : 'text-muted-foreground'
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

                {canSeeDecisions && (
                <TabsContent value="decisions" className="m-0">
                  <ProjectDecisionsTab
                    projectId={project.id}
                    projectOwnerId={project.user_id}
                    investorUserId={investorUserId}
                    isDecisionParty={canSeeDecisions}
                    memberNameMap={memberNameMap}
                  />
                </TabsContent>
                )}

                {canSeeTab('worklog') && (
                <TabsContent value="worklog" className="m-0">
                  <ProjectWorkLogTab
                    projectId={project.id}
                    isManager={isManager}
                    projectName={project.name}
                    isReadOnly={isReadOnly}
                    canLogOwnWork={worklogPerms.canLogOwnWork}
                    isOwnerReadonly={isOwnerReadonly}
                  />
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
                    isReadOnly={isReadOnly}
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
