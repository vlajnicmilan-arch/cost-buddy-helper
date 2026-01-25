import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ProjectWithOwnership, PROJECT_STATUS_LABELS } from '@/types/project';
import { useProjectStats } from '@/hooks/useProjectStats';
import { useProjectMilestones } from '@/hooks/useProjectMilestones';
import { useProjectFunding } from '@/hooks/useProjectFunding';
import { useProjectMembers } from '@/hooks/useProjectMembers';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { 
  Wallet, Target, Users, FileText, TrendingUp, Settings,
  Plus, Calendar, AlertTriangle, CheckCircle2, GanttChart
} from 'lucide-react';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { ProjectMilestonesTab } from './ProjectMilestonesTab';
import { ProjectFundingTab } from './ProjectFundingTab';
import { ProjectMembersTab } from './ProjectMembersTab';
import { ProjectTransactionsTab } from './ProjectTransactionsTab';
import { ProjectTimelineTab } from './ProjectTimelineTab';

interface ProjectDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: ProjectWithOwnership | null;
  onRefreshExpenses?: () => void;
}

export const ProjectDetailDialog = ({
  open,
  onOpenChange,
  project,
  onRefreshExpenses
}: ProjectDetailDialogProps) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const [activeTab, setActiveTab] = useState('overview');

  const { stats, expenses, loading: statsLoading, refetch: refetchStats } = useProjectStats(
    project?.id || null, 
    project?.total_budget || 0
  );
  const { milestones, loading: milestonesLoading, refetch: refetchMilestones } = useProjectMilestones(project?.id || null);
  const { funding, totalAllocated, loading: fundingLoading, refetch: refetchFunding } = useProjectFunding(project?.id || null);
  const { members, invitations, isManager, loading: membersLoading, refetch: refetchMembers } = useProjectMembers(project?.id || null);

  if (!project) return null;

  const budget = project.total_budget || 0;
  const remaining = budget - stats.totalSpent;
  const budgetWarning = stats.budgetUsedPercentage >= 90;

  const completedMilestones = milestones.filter(m => m.status === 'completed').length;
  const overdueMilestones = milestones.filter(m => m.status === 'overdue').length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <div className="flex items-center gap-3">
            <div 
              className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
              style={{ backgroundColor: `${project.color}20` }}
            >
              {project.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <DialogTitle className="truncate">{project.name}</DialogTitle>
                <Badge variant="secondary">{PROJECT_STATUS_LABELS[project.status]}</Badge>
              </div>
              {project.description && (
                <p className="text-sm text-muted-foreground truncate">{project.description}</p>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Budget Overview */}
        <div className="shrink-0 p-4 rounded-lg bg-muted/50 space-y-3">
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
          
          {budget > 0 ? (
            <>
              <Progress value={stats.budgetUsedPercentage} className="h-3" />
              <div className="grid grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold">{formatAmount(budget)}</p>
                  <p className="text-xs text-muted-foreground">{t('projects.totalBudget')}</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-expense">{formatAmount(stats.totalSpent)}</p>
                  <p className="text-xs text-muted-foreground">{t('projects.spent')}</p>
                </div>
                <div>
                  <p className={cn("text-2xl font-bold", remaining >= 0 ? "text-income" : "text-destructive")}>
                    {formatAmount(remaining)}
                  </p>
                  <p className="text-xs text-muted-foreground">{t('projects.remaining')}</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{formatAmount(totalAllocated)}</p>
                  <p className="text-xs text-muted-foreground">{t('projects.allocated')}</p>
                </div>
              </div>
            </>
          ) : (
            <p className="text-center text-muted-foreground py-2">{t('projects.noBudgetSet')}</p>
          )}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="shrink-0 grid grid-cols-6 w-full">
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
                <Badge variant="secondary" className="ml-1 h-5 px-1">
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
              <Badge variant="secondary" className="ml-1 h-5 px-1">{members.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="transactions" className="gap-1">
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">{t('projects.transactions')}</span>
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto mt-4">
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
                  <p className="text-3xl font-bold">{funding.length}</p>
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
                  <div className="flex items-center gap-4 text-sm">
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
                onRefetch={refetchMilestones}
              />
            </TabsContent>

            <TabsContent value="funding" className="m-0">
              <ProjectFundingTab
                projectId={project.id}
                funding={funding}
                totalAllocated={totalAllocated}
                projectBudget={budget}
                isManager={isManager}
                loading={fundingLoading}
                onRefetch={refetchFunding}
              />
            </TabsContent>

            <TabsContent value="members" className="m-0">
              <ProjectMembersTab
                projectId={project.id}
                members={members}
                invitations={invitations}
                isManager={isManager}
                loading={membersLoading}
                onRefetch={refetchMembers}
              />
            </TabsContent>

            <TabsContent value="transactions" className="m-0">
              <ProjectTransactionsTab
                projectId={project.id}
                expenses={expenses}
                milestones={milestones}
                isManager={isManager}
                loading={statsLoading}
                onRefetch={() => {
                  refetchStats();
                  refetchMilestones();
                  onRefreshExpenses?.();
                }}
              />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
