import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useTranslation } from 'react-i18next';
import { ProjectWithOwnership, ProjectMilestone, PROJECT_STATUS_LABELS, MILESTONE_STATUS_LABELS } from '@/types/project';
import { 
  generateProjectPDFReport, 
  generateProjectCSVReport, 
  generateProjectJSONExport,
  ProjectReportData 
} from '@/lib/projectReportExport';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { 
  FileText, Download, Wallet, Target, Users, 
  TrendingDown, CheckCircle2, Clock, AlertTriangle
} from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend
} from 'recharts';

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

  // Calculate spending by milestone
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

    const data = milestones.map((m, i) => ({
      name: m.name,
      spent: byMilestone[m.id] || 0,
      budget: m.budget,
      color: COLORS[i % COLORS.length],
    }));

    if (unassigned > 0) {
      data.push({
        name: t('projects.noMilestone', 'Bez faze'),
        spent: unassigned,
        budget: 0,
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

  // Milestone progress data for chart
  const milestoneProgressData = useMemo(() => {
    return milestones.map(m => {
      const spent = m.spent || 0;
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

  const handleExport = (format: 'pdf' | 'csv' | 'json') => {
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
    };

    try {
      switch (format) {
        case 'pdf':
          generateProjectPDFReport(reportData);
          toast.success(t('reports.pdfGenerated', 'PDF izvještaj generiran'));
          break;
        case 'csv':
          generateProjectCSVReport(reportData);
          toast.success(t('reports.csvGenerated', 'CSV izvještaj generiran'));
          break;
        case 'json':
          generateProjectJSONExport(reportData);
          toast.success(t('reports.jsonGenerated', 'JSON izvoz generiran'));
          break;
      }
    } catch (error) {
      console.error('Export error:', error);
      toast.error(t('common.error'));
    }
  };

  // Use unified logic: Remaining = Allocated (received) - Spent (completed milestones)
  const remaining = totalAllocated - totalSpent;
  const usedPercent = totalAllocated > 0 
    ? (totalSpent / totalAllocated) * 100 
    : 0;

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
          <TabsList className="shrink-0 grid grid-cols-3 w-full">
            <TabsTrigger value="overview" className="gap-1">
              <Wallet className="w-4 h-4" />
              {t('projects.budgetOverview', 'Budžet')}
            </TabsTrigger>
            <TabsTrigger value="milestones" className="gap-1">
              <Target className="w-4 h-4" />
              {t('projects.milestones', 'Faze')}
            </TabsTrigger>
            <TabsTrigger value="members" className="gap-1">
              <Users className="w-4 h-4" />
              {t('projects.members', 'Članovi')}
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto mt-4">
            {/* Overview Tab */}
            <TabsContent value="overview" className="m-0 space-y-6">
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
                <div className="p-4 rounded-lg border bg-primary/10 text-center">
                  <p className={cn("text-2xl font-bold", remaining >= 0 ? "text-primary" : "text-destructive")}>
                    {formatAmount(remaining)}
                  </p>
                  <p className="text-xs text-muted-foreground">{t('projects.remaining', 'Preostalo')}</p>
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

                  {/* Milestone list with details */}
                  <div className="space-y-3">
                    {milestones.map((milestone) => {
                      const spent = milestone.spent || 0;
                      const percent = milestone.budget > 0 ? (spent / milestone.budget) * 100 : 0;
                      const isOverBudget = percent > 100;

                      return (
                        <div key={milestone.id} className="p-4 rounded-lg border">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              {milestone.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-income" />}
                              {milestone.status === 'in_progress' && <Clock className="w-4 h-4 text-primary" />}
                              {milestone.status === 'overdue' && <AlertTriangle className="w-4 h-4 text-destructive" />}
                              {milestone.status === 'pending' && <Clock className="w-4 h-4 text-muted-foreground" />}
                              <span className="font-medium">{milestone.name}</span>
                              <Badge variant="outline">{MILESTONE_STATUS_LABELS[milestone.status]}</Badge>
                            </div>
                            <span className={cn("font-mono", isOverBudget && "text-destructive")}>
                              {formatAmount(spent)} / {formatAmount(milestone.budget)}
                            </span>
                          </div>
                          <Progress 
                            value={Math.min(percent, 100)} 
                            className={cn("h-2", isOverBudget && "[&>div]:bg-destructive")} 
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            {percent.toFixed(1)}% {t('projects.used', 'iskorišteno')}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
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
