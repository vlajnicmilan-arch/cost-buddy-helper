import { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { ProjectWithOwnership, ProjectMilestone, PROJECT_STATUS_LABELS, MILESTONE_STATUS_LABELS } from '@/types/project';
import { 
  generateProjectPDFReport, 
  generateProjectCSVReport, 
  generateProjectJSONExport,
  generateWorkLogPDFReport,
  ProjectReportData,
  WorkLogEntry,
} from '@/lib/projectReportExport';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { cn } from '@/lib/utils';
import { 
  FileText, Download, Wallet, Target, Users, 
  TrendingDown, CheckCircle2, Clock, AlertTriangle, History, BookOpen
} from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend
} from 'recharts';
import { ProjectRevisionsReport } from './ProjectRevisionsReport';

interface ProjectExpense {
  id: string;
  amount: number;
  description: string;
  category: string;
  date: string;
  type: string;
  milestone_id?: string | null;
  user_id: string;
}

interface ProjectMember {
  display_name?: string;
  user_id: string;
  role: string;
}

interface ProjectReportsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: ProjectWithOwnership;
  milestones: ProjectMilestone[];
  members: ProjectMember[];
  expenses: ProjectExpense[];
  totalSpent: number;
  totalAllocated: number;
}

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

export const ProjectReportsDialog = ({
  open,
  onOpenChange,
  project,
  milestones,
  members,
  expenses,
  totalSpent,
  totalAllocated
}: ProjectReportsDialogProps) => {
  const { t, i18n } = useTranslation();
  const { formatAmount, currency } = useCurrency();
  const [activeTab, setActiveTab] = useState('overview');

  // Fetch workers and collaborators for exports
  const [reportWorkers, setReportWorkers] = useState<{ name: string; hours: number; rate: number; cost: number }[]>([]);
  const [reportCollaborators, setReportCollaborators] = useState<{ name: string; totalPrice: number; paidAmount: number; service: string }[]>([]);

  useEffect(() => {
    if (!open || !project.id) return;

    const fetchWorkersAndCollaborators = async () => {
      const [workersRes, entriesRes, collabRes] = await Promise.all([
        supabase.from('project_workers').select('id, first_name, last_name, hourly_rate').eq('project_id', project.id),
        supabase.from('project_work_entries').select('actual_hours, worker_id').eq('project_id', project.id),
        (supabase.from('project_collaborators') as any).select('first_name, last_name, service_description, total_price, paid_amount').eq('project_id', project.id),
      ]);

      // Workers
      const workerMap = new Map<string, { name: string; rate: number; hours: number }>();
      workersRes.data?.forEach((w: any) => {
        workerMap.set(w.id, { name: `${w.first_name} ${w.last_name}`, rate: Number(w.hourly_rate) || 0, hours: 0 });
      });
      entriesRes.data?.forEach((e: any) => {
        const w = workerMap.get(e.worker_id);
        if (w) w.hours += Number(e.actual_hours) || 0;
      });
      const workers: { name: string; hours: number; rate: number; cost: number }[] = [];
      workerMap.forEach(w => {
        if (w.hours > 0) workers.push({ name: w.name, hours: w.hours, rate: w.rate, cost: w.hours * w.rate });
      });
      setReportWorkers(workers);

      // Collaborators
      const collabs = (collabRes.data || []).map((c: any) => ({
        name: `${c.first_name} ${c.last_name}`,
        service: c.service_description || '',
        totalPrice: Number(c.total_price) || 0,
        paidAmount: Number(c.paid_amount) || 0,
      }));
      setReportCollaborators(collabs);
    };

    fetchWorkersAndCollaborators();
  }, [open, project.id]);

  // Calculate completed milestones budget as "spent" (unified logic)
  const completedMilestones = milestones.filter(m => m.status === 'completed');
  const spentFromCompletedMilestones = completedMilestones.reduce((sum, m) => sum + (m.budget || 0), 0);

  // Calculate spending by milestone (for chart visualization - shows expense transactions per milestone)
  const spendingByMilestone = useMemo(() => {
    const byMilestone: Record<string, number> = {};
    let unassigned = 0;

    expenses.forEach(e => {
      if (e.type === 'expense') {
        if (e.milestone_id) {
          byMilestone[e.milestone_id] = (byMilestone[e.milestone_id] || 0) + e.amount;
        } else {
          unassigned += e.amount;
        }
      }
    });

    // Use milestone budget for completed milestones, expense sum for others
    const data = milestones.map((m, i) => ({
      name: m.name,
      spent: m.status === 'completed' ? m.budget : (byMilestone[m.id] || 0),
      budget: m.budget,
      status: m.status,
      color: COLORS[i % COLORS.length],
    }));

    if (unassigned > 0) {
      data.push({
        name: t('projects.noMilestone', 'Bez faze'),
        spent: unassigned,
        budget: 0,
        status: 'pending',
        color: '#94a3b8',
      });
    }

    return data;
  }, [expenses, milestones, t]);

  // Calculate spending by member
  const spendingByMember = useMemo(() => {
    const byMember: Record<string, number> = {};

    expenses.forEach(e => {
      if (e.type === 'expense') {
        byMember[e.user_id] = (byMember[e.user_id] || 0) + e.amount;
      }
    });

    return members.map((m, i) => ({
      name: m.display_name || 'Unknown',
      spent: byMember[m.user_id] || 0,
      role: m.role,
      color: COLORS[i % COLORS.length],
    }));
  }, [expenses, members]);

  // Milestone progress data for chart - use budget for completed milestones
  const milestoneProgressData = useMemo(() => {
    return milestones.map(m => {
      // For completed milestones, "spent" equals budget (the full budget is consumed)
      const spent = m.status === 'completed' ? m.budget : (m.spent || 0);
      const percent = m.budget > 0 ? (spent / m.budget) * 100 : 0;
      return {
        name: m.name.length > 15 ? m.name.substring(0, 15) + '...' : m.name,
        fullName: m.name,
        spent,
        budget: m.budget,
        percent: Math.min(percent, 100),
        status: m.status,
      };
    });
  }, [milestones]);

  const handleExport = async (format: 'pdf' | 'csv' | 'json') => {
    const reportData: ProjectReportData = {
      projectName: project.name,
      projectDescription: project.description,
      projectStatus: PROJECT_STATUS_LABELS[project.status],
      totalBudget: project.total_budget,
      totalSpent,
      totalAllocated,
      milestones: milestones.map(m => ({
        ...m,
        spent: spendingByMilestone.find(s => s.name === m.name)?.spent || 0,
      })),
      members: members.map(m => ({
        display_name: m.display_name,
        role: m.role,
        spent: spendingByMember.find(s => s.name === m.display_name)?.spent || 0,
      })),
      transactions: expenses.map(e => ({
        date: new Date(e.date),
        description: e.description,
        category: e.category,
        amount: e.amount,
        type: e.type,
        milestone_name: e.milestone_id 
          ? milestones.find(m => m.id === e.milestone_id)?.name 
          : undefined,
      })),
      currency: currency ? {
        code: currency.code,
        symbol: currency.symbol,
        locale: i18n.language === 'hr' ? 'hr-HR' : i18n.language === 'de' ? 'de-DE' : 'en-US',
      } : undefined,
      workers: reportWorkers,
      collaborators: reportCollaborators,
    };

    try {
      switch (format) {
        case 'pdf':
          await generateProjectPDFReport(reportData);
          showSuccess(t('reports.pdfGenerated', 'PDF izvještaj generiran'));
          break;
        case 'csv':
          await generateProjectCSVReport(reportData);
          showSuccess(t('reports.csvGenerated', 'CSV izvještaj generiran'));
          break;
        case 'json':
          await generateProjectJSONExport(reportData);
          showSuccess(t('reports.jsonGenerated', 'JSON izvoz generiran'));
          break;
      }
    } catch (error) {
      console.error('Export error:', error);
      showError(t('common.error'));
    }
  };

  // Use unified logic: Remaining = Allocated (received) - Spent (completed milestones)
  const remaining = totalAllocated - totalSpent;
  const usedPercent = totalAllocated > 0 
    ? (totalSpent / totalAllocated) * 100 
    : 0;
  
  // Budget status indicators
  const isOverBudget = remaining < 0;
  const isWarning = usedPercent >= 80 && usedPercent < 100;
  const overBudgetAmount = isOverBudget ? Math.abs(remaining) : 0;

  // Count milestones over budget
  const milestonesOverBudget = milestoneProgressData.filter(m => 
    m.budget > 0 && m.spent > m.budget
  ).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              {t('projects.reports', 'Izvještaji projekta')}
            </DialogTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => handleExport('csv')}>
                <Download className="w-4 h-4 mr-1" />
                CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleExport('json')}>
                <Download className="w-4 h-4 mr-1" />
                JSON
              </Button>
              <Button size="sm" onClick={() => handleExport('pdf')}>
                <Download className="w-4 h-4 mr-1" />
                PDF
              </Button>
            </div>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="shrink-0 grid grid-cols-4 w-full">
            <TabsTrigger value="overview" className="gap-1">
              <Wallet className="w-4 h-4" />
              {t('projects.budgetOverview', 'Budžet')}
            </TabsTrigger>
            <TabsTrigger value="milestones" className="gap-1">
              <Target className="w-4 h-4" />
              {t('projects.milestones', 'Faze')}
            </TabsTrigger>
            <TabsTrigger value="revisions" className="gap-1">
              <History className="w-4 h-4" />
              {t('projects.revisions.tabLabel', 'Promjene')}
            </TabsTrigger>
            <TabsTrigger value="members" className="gap-1">
              <Users className="w-4 h-4" />
              {t('projects.members', 'Članovi')}
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto mt-4">
            {/* Overview Tab */}
            <TabsContent value="overview" className="m-0 space-y-6">
              {/* Over Budget Warning */}
              {isOverBudget && (
                <div className="p-4 rounded-lg border-2 border-destructive/50 bg-destructive/10 space-y-2">
                  <div className="flex items-center gap-2 text-destructive">
                    <AlertTriangle className="w-5 h-5" />
                    <span className="font-semibold">{t('projects.overBudgetWarning', 'Prekoračenje budžeta!')}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t('projects.overBudgetDescription', 'Potrošnja je premašila primljena sredstva za')} {' '}
                    <span className="font-bold text-destructive">{formatAmount(overBudgetAmount)}</span>
                  </p>
                </div>
              )}

              {/* Warning (approaching limit) */}
              {isWarning && !isOverBudget && (
                <div className="p-4 rounded-lg border-2 border-warning/50 bg-warning/10 space-y-2">
                  <div className="flex items-center gap-2 text-warning-foreground">
                    <AlertTriangle className="w-5 h-5" />
                    <span className="font-semibold">{t('projects.budgetWarningTitle', 'Upozorenje: Približavanje limitu')}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t('projects.budgetWarningDescription', 'Iskorišteno je')} {usedPercent.toFixed(1)}% {t('projects.ofAvailableFunds', 'dostupnih sredstava')}.
                  </p>
                </div>
              )}

              {/* Budget summary cards - unified logic */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 rounded-lg border bg-income/10 text-center">
                  <p className="text-2xl font-bold text-income">{formatAmount(totalAllocated)}</p>
                  <p className="text-xs text-muted-foreground">{t('projects.received', 'Primljeno')}</p>
                </div>
                <div className="p-4 rounded-lg border bg-expense/10 text-center">
                  <p className="text-2xl font-bold text-expense">{formatAmount(totalSpent)}</p>
                  <p className="text-xs text-muted-foreground">{t('projects.completedPhases', 'Završene faze')}</p>
                </div>
                <div className={cn(
                  "p-4 rounded-lg border text-center",
                  isOverBudget ? "bg-destructive/10 border-destructive/30" : "bg-primary/10"
                )}>
                  <p className={cn("text-2xl font-bold", remaining >= 0 ? "text-primary" : "text-destructive")}>
                    {isOverBudget && '-'}{formatAmount(Math.abs(remaining))}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {isOverBudget ? t('projects.overBudget', 'Prekoračeno') : t('projects.remaining', 'Preostalo')}
                  </p>
                </div>
                <div className="p-4 rounded-lg border text-center">
                  <p className="text-2xl font-bold">{formatAmount(project.total_budget)}</p>
                  <p className="text-xs text-muted-foreground">{t('projects.totalBudget', 'Ukupni proračun')}</p>
                </div>
              </div>

              {/* Funds usage progress */}
              <div className="p-4 rounded-lg border space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{t('projects.fundsUsage', 'Iskorištenost sredstava')}</span>
                  <span className={usedPercent > 100 ? 'text-destructive' : ''}>
                    {formatAmount(totalSpent)} / {formatAmount(totalAllocated)}
                  </span>
                </div>
                <Progress 
                  value={Math.min(usedPercent, 100)} 
                  className={cn("h-3", usedPercent >= 90 && "[&>div]:bg-destructive")} 
                />
              </div>

              {/* Spending by milestone pie chart */}
              {spendingByMilestone.length > 0 && (
                <div className="p-4 rounded-lg border">
                  <h3 className="font-medium mb-4">{t('projects.spendingByMilestone', 'Potrošnja po fazama')}</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={spendingByMilestone.filter(d => d.spent > 0)}
                          dataKey="spent"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                        >
                          {spendingByMilestone.map((entry, index) => (
                            <Cell key={index} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip 
                          formatter={(value: number) => formatAmount(value)}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Milestones Tab */}
            <TabsContent value="milestones" className="m-0 space-y-4">
              {milestones.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Target className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>{t('projects.noMilestones', 'Nema faza')}</p>
                </div>
              ) : (
                <>
                  {/* Bar chart of milestone budgets */}
                  <div className="p-4 rounded-lg border">
                    <h3 className="font-medium mb-4">{t('projects.milestoneBudgets', 'Budžeti faza')}</h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={milestoneProgressData} layout="vertical">
                          <XAxis type="number" tickFormatter={(v) => formatAmount(v)} />
                          <YAxis type="category" dataKey="name" width={100} />
                          <Tooltip 
                            formatter={(value: number) => formatAmount(value)}
                            labelFormatter={(label) => milestoneProgressData.find(d => d.name === label)?.fullName || label}
                          />
                          <Legend />
                          <Bar dataKey="budget" name={t('projects.budget', 'Budžet')} fill="#94a3b8" />
                          <Bar dataKey="spent" name={t('projects.spent', 'Potrošeno')} fill="#3b82f6" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Milestones over budget warning */}
                  {milestonesOverBudget > 0 && (
                    <div className="p-3 rounded-lg border border-destructive/30 bg-destructive/10 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-destructive" />
                      <span className="text-sm">
                        {milestonesOverBudget} {milestonesOverBudget === 1 
                          ? t('projects.milestoneOverBudget', 'faza je prekoračila budžet') 
                          : t('projects.milestonesOverBudget', 'faze su prekoračile budžet')}
                      </span>
                    </div>
                  )}

                  {/* Milestone list with details */}
                  <div className="space-y-3">
                    {milestones.map((milestone) => {
                      // For completed milestones, spent equals budget
                      const spent = milestone.status === 'completed' ? milestone.budget : (milestone.spent || 0);
                      const percent = milestone.budget > 0 ? (spent / milestone.budget) * 100 : 0;
                      const isMilestoneOverBudget = percent > 100;
                      const overAmount = isMilestoneOverBudget ? spent - milestone.budget : 0;

                      return (
                        <div 
                          key={milestone.id} 
                          className={cn(
                            "p-4 rounded-lg border",
                            isMilestoneOverBudget && "border-destructive/30 bg-destructive/5"
                          )}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              {milestone.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-income" />}
                              {milestone.status === 'in_progress' && <Clock className="w-4 h-4 text-primary" />}
                              {milestone.status === 'overdue' && <AlertTriangle className="w-4 h-4 text-destructive" />}
                              {milestone.status === 'pending' && <Clock className="w-4 h-4 text-muted-foreground" />}
                              <span className="font-medium">{milestone.name}</span>
                              <Badge variant="outline">{MILESTONE_STATUS_LABELS[milestone.status]}</Badge>
                              {isMilestoneOverBudget && (
                                <Badge variant="destructive" className="gap-1">
                                  <AlertTriangle className="w-3 h-3" />
                                  {t('projects.overBudget', 'Prekoračeno')}
                                </Badge>
                              )}
                            </div>
                            <span className={cn("font-mono", isMilestoneOverBudget && "text-destructive")}>
                              {formatAmount(spent)} / {formatAmount(milestone.budget)}
                            </span>
                          </div>
                          <Progress 
                            value={Math.min(percent, 100)} 
                            className={cn("h-2", isMilestoneOverBudget && "[&>div]:bg-destructive")} 
                          />
                          <div className="flex justify-between items-center mt-1">
                            <p className="text-xs text-muted-foreground">
                              {percent.toFixed(1)}% {t('projects.used', 'iskorišteno')}
                            </p>
                            {isMilestoneOverBudget && (
                              <p className="text-xs text-destructive font-medium">
                                +{formatAmount(overAmount)} {t('projects.overBudgetBy', 'prekoračenje')}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </TabsContent>

            {/* Revisions Tab */}
            <TabsContent value="revisions" className="m-0">
              <ProjectRevisionsReport projectId={project.id} milestones={milestones} />
            </TabsContent>

            {/* Members Tab */}
            <TabsContent value="members" className="m-0 space-y-4">
              {members.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>{t('projects.noMembers', 'Nema članova')}</p>
                </div>
              ) : (
                <>
                  {/* Spending by member chart */}
                  {spendingByMember.some(m => m.spent > 0) && (
                    <div className="p-4 rounded-lg border">
                      <h3 className="font-medium mb-4">{t('projects.spendingByMember', 'Potrošnja po članovima')}</h3>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={spendingByMember}>
                            <XAxis dataKey="name" />
                            <YAxis tickFormatter={(v) => formatAmount(v)} />
                            <Tooltip formatter={(value: number) => formatAmount(value)} />
                            <Bar dataKey="spent" name={t('projects.spent', 'Potrošeno')}>
                              {spendingByMember.map((entry, index) => (
                                <Cell key={index} fill={entry.color} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {/* Member list */}
                  <div className="space-y-2">
                    {spendingByMember.map((member, i) => (
                      <div key={i} className="p-3 rounded-lg border flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div 
                            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-medium"
                            style={{ backgroundColor: member.color }}
                          >
                            {member.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium">{member.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {member.role === 'manager' ? 'Manager' : member.role === 'member' ? 'Član' : 'Promatrač'}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-mono font-medium text-expense">
                            <TrendingDown className="w-4 h-4 inline mr-1" />
                            {formatAmount(member.spent)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {totalSpent > 0 ? ((member.spent / totalSpent) * 100).toFixed(1) : 0}% {t('projects.ofTotal', 'od ukupno')}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
