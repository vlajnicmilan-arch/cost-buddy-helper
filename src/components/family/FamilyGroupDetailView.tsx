import { useState, useEffect, useLayoutEffect, useCallback } from 'react';
import { FamilyGroup, FAMILY_ROLE_LABELS, FamilyRole } from '@/types/family';
import { useFamilyMembers, useFamilySharedResources, useFamilyActivity } from '@/hooks/useFamilyGroups';
import { useTranslation } from 'react-i18next';
import { useProjects } from '@/hooks/useProjects';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import { Input } from '@/components/ui/input';
import { useBudgets } from '@/hooks/useBudgets';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useAuth } from '@/hooks/useAuth';
import { useExpenses } from '@/hooks/useExpenses';
import { useSavingsGoals } from '@/hooks/useSavingsGoals';
import { BottomNav } from '@/components/BottomNav';
import { PaymentSourceTransactionsDialog } from '@/components/PaymentSourceTransactionsDialog';
import { BudgetDetailDialog } from '@/components/budget/BudgetDetailDialog';
import { ProjectDetailDialog } from '@/components/projects/ProjectDetailDialog';
import { ProjectCard } from '@/components/projects/ProjectCard';
import { ProjectFullScreenView } from '@/components/projects/ProjectFullScreenView';
import { CustomPaymentSource } from '@/types/customPaymentSource';
import { BudgetWithStats } from '@/types/budget';
import { ProjectWithOwnership } from '@/types/project';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { 
  ArrowLeft, Users, Mail, Plus, Trash2, Loader2,
  Wallet, Target, Settings, UserMinus, Send, FolderKanban, Activity, PiggyBank
} from 'lucide-react';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { hr } from 'date-fns/locale';
import { toast } from 'sonner';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { FamilyGroupDialog } from './FamilyGroupDialog';

interface Props {
  group: FamilyGroup;
  onBack: () => void;
  onUpdate: (id: string, data: Partial<FamilyGroup>) => Promise<void>;
  onDelete: () => Promise<void>;
}

export const FamilyGroupDetailView = ({ group, onBack, onUpdate, onDelete }: Props) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { formatAmount } = useCurrency();
  const { members, invitations, loading: membersLoading, isOwner, updateMemberRole, removeMember, generateInviteLink, cancelInvitation } = useFamilyMembers(group.id);
  const { sharedSources, sharedBudgets, sharedProjects, sharedSavings, loading: resourcesLoading, addSharedSource, removeSharedSource, addSharedBudget, removeSharedBudget, addSharedProject, removeSharedProject, addSharedSavings, removeSharedSavings } = useFamilySharedResources(group.id);
  const { customPaymentSources: paymentSources } = useCustomPaymentSources();
  const { budgets } = useBudgets({});
  const { projects } = useProjects();
  const { activities, loading: activitiesLoading } = useFamilyActivity(group.id);
  const { allExpenses, updateExpense, deleteExpense, refetch: refetchExpenses } = useExpenses();
  const { goals: savingsGoals } = useSavingsGoals();

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<FamilyRole>('member');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [showAddSource, setShowAddSource] = useState(false);
  const [showAddBudget, setShowAddBudget] = useState(false);
  const [showAddProject, setShowAddProject] = useState(false);
  const [showAddSavings, setShowAddSavings] = useState(false);
  const [selectedPaymentSource, setSelectedPaymentSource] = useState<CustomPaymentSource | null>(null);
  const [paymentSourceDialogOpen, setPaymentSourceDialogOpen] = useState(false);
  const [selectedBudget, setSelectedBudget] = useState<BudgetWithStats | null>(null);
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<ProjectWithOwnership | null>(null);
  const [projectFullScreenOpen, setProjectFullScreenOpen] = useState(false);

  // Reset scroll to top on mount (when entering detail view).
  useLayoutEffect(() => {
    const reset = () => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };
    reset();
    const r1 = requestAnimationFrame(reset);
    const r2 = requestAnimationFrame(() => requestAnimationFrame(reset));
    const t = setTimeout(reset, 200);
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
      clearTimeout(t);
    };
  }, []);

  // Project stats for shared projects (same logic as ProjectsPanel)
  const [projectStats, setProjectStats] = useState<Record<string, { spent: number; income: number; memberCount: number; milestoneCount: number }>>({});

  const sharedProjectsList = sharedProjects.map(sp => projects.find(p => p.id === sp.project_id)).filter(Boolean) as ProjectWithOwnership[];

  const fetchProjectStats = useCallback(async () => {
    if (sharedProjectsList.length === 0) return;

    const stats: Record<string, { spent: number; income: number; memberCount: number; milestoneCount: number }> = {};
    
    for (const project of sharedProjectsList) {
      const { data: expenses } = await (supabase
        .from('expenses')
        .select('amount, type, status') as any)
        .eq('project_id', project.id);

      const approvedIncomes = (expenses || []).filter(
        (e: any) => e.type === 'income' && (!e.status || e.status === 'approved')
      );
      const income = approvedIncomes.reduce((sum: number, e: any) => sum + Number(e.amount), 0);

      const { data: fundingData } = await supabase
        .from('project_funding')
        .select('allocated_amount')
        .eq('project_id', project.id);

      const fundingTotal = (fundingData || []).reduce((sum, f) => sum + Number(f.allocated_amount || 0), 0);
      const totalIncome = income + fundingTotal;

      const { data: milestones } = await supabase
        .from('project_milestones')
        .select('budget, status')
        .eq('project_id', project.id);

      const completedMilestones = (milestones || []).filter((m: any) => m.status === 'completed');
      const spent = completedMilestones.reduce((sum: number, m: any) => sum + Number(m.budget || 0), 0);
      const milestoneCount = (milestones || []).length;

      const { count: memberCount } = await (supabase
        .from('project_members') as any)
        .select('*', { count: 'exact', head: true })
        .eq('project_id', project.id);

      stats[project.id] = {
        spent,
        income: totalIncome,
        memberCount: memberCount || 0,
        milestoneCount
      };
    }

    setProjectStats(stats);
  }, [sharedProjectsList.map(p => p.id).join(',')]);

  useEffect(() => {
    fetchProjectStats();
  }, [fetchProjectStats]);

  const totalBalance = sharedSources.reduce((sum, s) => sum + (s.source_balance || 0), 0);
  const existingSourceIds = new Set(sharedSources.map(s => s.payment_source_id));
  const existingBudgetIds = new Set(sharedBudgets.map(b => b.budget_id));
  const existingProjectIds = new Set(sharedProjects.map(p => p.project_id));
  const existingSavingsIds = new Set(sharedSavings.map(s => s.savings_goal_id));

  const availableSources = paymentSources.filter(ps => !existingSourceIds.has(ps.id));
  const availableBudgets = budgets.filter(b => !existingBudgetIds.has(b.id));
  const availableProjects = projects.filter(p => !existingProjectIds.has(p.id));
  const availableSavings = savingsGoals.filter(g => !existingSavingsIds.has(g.id));

  const handleSendInvite = async () => {
    if (!inviteEmail.trim()) return;
    
    setInviteLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-member-invitation', {
        body: {
          type: 'family',
          targetId: group.id,
          invitedEmail: inviteEmail.trim(),
          role: inviteRole
        }
      });

      if (error) throw error;

      if (data?.error) {
        if (data.error === 'user_not_found') {
          showError(t('family.userNotFound'));
        } else if (data.error === 'already_member') {
          showError(t('family.alreadyMember'));
        } else if (data.error === 'already_invited') {
          showError(t('family.alreadyInvited'));
        } else {
          showError(data.message || t('family.inviteError'));
        }
        return;
      }

      showSuccess(`${t('family.inviteSent')} ${inviteEmail.trim()}`);
      setInviteEmail('');
    } catch (error) {
      console.error('Error sending invitation:', error);
      showError(t('family.inviteError'));
    } finally {
      setInviteLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.25 }}
        className="max-w-4xl mx-auto"
      >
        {/* Header */}
        <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border/50 px-3 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onBack} className="h-9 w-9">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
              style={{ backgroundColor: `${group.color}20` }}
            >
              {group.icon}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="font-bold text-lg truncate">{group.name}</h1>
              <p className="text-xs text-muted-foreground">{members.length} {t('family.members')}</p>
            </div>
            {isOwner && (
              <Button variant="ghost" size="icon" onClick={() => setEditDialogOpen(true)} className="h-9 w-9">
                <Settings className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        <div className="px-3 py-4 space-y-6">
          {/* Summary Card */}
          <div className="rounded-xl p-4 bg-card border border-border/50">
            <p className="text-xs text-muted-foreground mb-1">{t('family.totalSharedBalance')}</p>
            <p className="text-2xl font-bold">{formatAmount(totalBalance)}</p>
          </div>

          {/* Shared Sources */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold flex items-center gap-2">
                <Wallet className="h-4 w-4 text-muted-foreground" />
                {t('family.sharedAccounts')}
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setShowAddSource(!showAddSource)} className="h-8 gap-1">
                <Plus className="h-3.5 w-3.5" />
                {t('family.add')}
              </Button>
            </div>

            {showAddSource && availableSources.length > 0 && (
              <div className="mb-3 space-y-1.5 p-3 rounded-lg bg-muted/30 border border-border/50">
                <p className="text-xs text-muted-foreground mb-2">{t('family.selectAccountToAdd')}</p>
                {availableSources.map(ps => (
                  <button
                    key={ps.id}
                    onClick={() => { addSharedSource(ps.id); setShowAddSource(false); }}
                    className="w-full flex items-center gap-2.5 p-2.5 rounded-lg hover:bg-background transition-colors text-left"
                  >
                    <span className="text-lg">{ps.icon}</span>
                    <span className="text-sm font-medium flex-1">{ps.name}</span>
                    <span className="text-xs text-muted-foreground">{formatAmount(ps.balance)}</span>
                  </button>
                ))}
              </div>
            )}

            {showAddSource && availableSources.length === 0 && (
              <p className="text-xs text-muted-foreground mb-3 p-3 bg-muted/30 rounded-lg">{t('family.allAccountsAdded')}</p>
            )}

            {sharedSources.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">{t('family.noAccounts')}</p>
            ) : (
              <div className="space-y-2">
                {sharedSources.map(source => (
                  <div
                    key={source.id}
                    role="button"
                    tabIndex={0}
                    aria-label={source.source_name || 'Račun'}
                    className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border/50 cursor-pointer hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    onClick={() => {
                      const fullSource: CustomPaymentSource = {
                        id: source.payment_source_id,
                        user_id: source.added_by,
                        name: source.source_name || 'Račun',
                        icon: source.source_icon || '💳',
                        color: source.source_color || '#6b7280',
                        balance: source.source_balance || 0,
                        created_at: source.created_at,
                        updated_at: source.created_at,
                      };
                      setSelectedPaymentSource(fullSource);
                      setPaymentSourceDialogOpen(true);
                      refetchExpenses();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        (e.currentTarget as HTMLDivElement).click();
                      }
                    }}
                  >
                    <span className="text-lg">{source.source_icon || '💳'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{source.source_name || 'Račun'}</p>
                    </div>
                    <span className="text-sm font-semibold">{formatAmount(source.source_balance || 0)}</span>
                    {(isOwner || source.added_by === user?.id) && (
                      <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); removeSharedSource(source.id); }} className="h-7 w-7 text-destructive hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Shared Budgets */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold flex items-center gap-2">
                <Target className="h-4 w-4 text-muted-foreground" />
                {t('family.sharedBudgets')}
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setShowAddBudget(!showAddBudget)} className="h-8 gap-1">
                <Plus className="h-3.5 w-3.5" />
                {t('family.add')}
              </Button>
            </div>

            {showAddBudget && availableBudgets.length > 0 && (
              <div className="mb-3 space-y-1.5 p-3 rounded-lg bg-muted/30 border border-border/50">
                <p className="text-xs text-muted-foreground mb-2">{t('family.selectBudgetToAdd')}</p>
                {availableBudgets.map(b => (
                  <button
                    key={b.id}
                    onClick={() => { addSharedBudget(b.id); setShowAddBudget(false); }}
                    className="w-full flex items-center gap-2.5 p-2.5 rounded-lg hover:bg-background transition-colors text-left"
                  >
                    <span className="text-lg">{b.icon || '💰'}</span>
                    <span className="text-sm font-medium flex-1">{b.name}</span>
                    <span className="text-xs text-muted-foreground">{formatAmount(b.total_amount)}</span>
                  </button>
                ))}
              </div>
            )}

            {showAddBudget && availableBudgets.length === 0 && (
              <p className="text-xs text-muted-foreground mb-3 p-3 bg-muted/30 rounded-lg">{t('family.allBudgetsAdded')}</p>
            )}

            {sharedBudgets.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">{t('family.noBudgets')}</p>
            ) : (
              <div className="space-y-2">
                {sharedBudgets.map(budget => {
                  const fullBudget = budgets.find(b => b.id === budget.budget_id);
                  return (
                  <div
                    key={budget.id}
                    role="button"
                    tabIndex={0}
                    aria-label={budget.budget_name || 'Budžet'}
                    className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border/50 cursor-pointer hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    onClick={() => {
                      if (fullBudget) {
                        setSelectedBudget(fullBudget);
                        setBudgetDialogOpen(true);
                      } else {
                        toast.info(t('family.budgetNotAvailable'));
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        (e.currentTarget as HTMLDivElement).click();
                      }
                    }}
                  >
                    <span className="text-lg">{budget.budget_icon || '💰'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{budget.budget_name || 'Budžet'}</p>
                    </div>
                    <span className="text-sm font-semibold">{formatAmount(budget.budget_total || 0)}</span>
                    {(isOwner || budget.added_by === user?.id) && (
                      <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); removeSharedBudget(budget.id); }} className="h-7 w-7 text-destructive hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Shared Projects - Using ProjectCard identical to main dashboard */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold flex items-center gap-2">
                <FolderKanban className="h-4 w-4 text-muted-foreground" />
                {t('family.sharedProjects')}
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setShowAddProject(!showAddProject)} className="h-8 gap-1">
                <Plus className="h-3.5 w-3.5" />
                {t('family.add')}
              </Button>
            </div>

            {showAddProject && availableProjects.length > 0 && (
              <div className="mb-3 space-y-1.5 p-3 rounded-lg bg-muted/30 border border-border/50">
                <p className="text-xs text-muted-foreground mb-2">{t('family.selectProjectToAdd')}</p>
                {availableProjects.map(p => (
                  <button
                    key={p.id}
                    onClick={() => { addSharedProject(p.id); setShowAddProject(false); }}
                    className="w-full flex items-center gap-2.5 p-2.5 rounded-lg hover:bg-background transition-colors text-left"
                  >
                    <span className="text-lg">{p.icon || '📁'}</span>
                    <span className="text-sm font-medium flex-1">{p.name}</span>
                    <span className="text-xs text-muted-foreground">{formatAmount(p.total_budget)}</span>
                  </button>
                ))}
              </div>
            )}

            {showAddProject && availableProjects.length === 0 && (
              <p className="text-xs text-muted-foreground mb-3 p-3 bg-muted/30 rounded-lg">{t('family.allProjectsAdded')}</p>
            )}

            {sharedProjects.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">{t('family.noProjects')}</p>
            ) : (
              <div className="space-y-3">
                {sharedProjects.map(sharedProject => {
                  const fullProject = projects.find(p => p.id === sharedProject.project_id);
                  if (!fullProject) {
                    return (
                      <div
                        key={sharedProject.id}
                        className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border/50"
                      >
                        <span className="text-lg">{sharedProject.project_icon || '📁'}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{sharedProject.project_name || 'Projekt'}</p>
                          <p className="text-xs text-muted-foreground">{t('family.projectNotAvailable')}</p>
                        </div>
                        {(isOwner || sharedProject.added_by === user?.id) && (
                          <Button variant="ghost" size="icon" onClick={() => removeSharedProject(sharedProject.id)} className="h-7 w-7 text-destructive hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    );
                  }
                  const stats = projectStats[fullProject.id] || { spent: 0, income: 0, memberCount: 0, milestoneCount: 0 };
                  return (
                    <div key={sharedProject.id} className="relative">
                      <ProjectCard
                        project={fullProject}
                        spent={stats.spent}
                        income={stats.income}
                        memberCount={stats.memberCount}
                        milestoneCount={stats.milestoneCount}
                        onEdit={() => {}}
                        onDelete={() => {}}
                        onClick={(p) => {
                          setSelectedProject(p);
                          setProjectFullScreenOpen(true);
                        }}
                      />
                      {(isOwner || sharedProject.added_by === user?.id) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => { e.stopPropagation(); removeSharedProject(sharedProject.id); }}
                          className="absolute top-2 right-2 h-7 w-7 text-destructive hover:text-destructive z-10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Shared Savings Goals */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold flex items-center gap-2">
                <PiggyBank className="h-4 w-4 text-muted-foreground" />
                {t('family.sharedSavings')}
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setShowAddSavings(!showAddSavings)} className="h-8 gap-1">
                <Plus className="h-3.5 w-3.5" />
                {t('family.add')}
              </Button>
            </div>

            {showAddSavings && availableSavings.length > 0 && (
              <div className="mb-3">
                <p className="text-xs text-muted-foreground mb-2">{t('family.selectSavingsToAdd')}</p>
                <div className="space-y-1">
                  {availableSavings.map(goal => (
                    <button
                      key={goal.id}
                      onClick={() => { addSharedSavings(goal.id); setShowAddSavings(false); }}
                      className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 text-left text-sm"
                    >
                      <span>{goal.icon}</span>
                      <span className="flex-1">{goal.name}</span>
                      <span className="text-muted-foreground">{formatAmount(goal.current_amount)} / {formatAmount(goal.target_amount)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {showAddSavings && availableSavings.length === 0 && (
              <p className="text-xs text-muted-foreground mb-3 p-3 bg-muted/30 rounded-lg">{t('family.allSavingsAdded')}</p>
            )}

            {sharedSavings.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">{t('family.noSavings')}</p>
            ) : (
              <div className="space-y-2">
                {sharedSavings.map(saving => {
                  const progress = saving.goal_target ? Math.min(100, ((saving.goal_current || 0) / saving.goal_target) * 100) : 0;
                  return (
                  <div
                    key={saving.id}
                    className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border/50"
                  >
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center text-lg" style={{ backgroundColor: `${saving.goal_color || '#22c55e'}20` }}>
                      {saving.goal_icon || '🎯'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{saving.goal_name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, backgroundColor: saving.goal_color || '#22c55e' }} />
                        </div>
                        <span className="text-[10px] text-muted-foreground shrink-0">{Math.round(progress)}%</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {formatAmount(saving.goal_current || 0)} / {formatAmount(saving.goal_target || 0)}
                      </p>
                    </div>
                    {(isOwner || saving.added_by === user?.id) && (
                      <Button variant="ghost" size="icon" onClick={() => removeSharedSavings(saving.id)} className="h-7 w-7 text-destructive hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Members */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                {t('family.membersCount')} ({members.length})
              </h2>
            </div>

            <div className="space-y-2">
              {members.map(member => (
                <div key={member.id} className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border/50">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="text-xs" style={{ backgroundColor: `${group.color}20` }}>
                      {(member.display_name || '?')[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">
                      {member.display_name}
                      {member.user_id === user?.id && <span className="text-muted-foreground"> ({t('family.you')})</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">{FAMILY_ROLE_LABELS[member.role]}</p>
                  </div>
                  {isOwner && member.user_id !== user?.id && (
                    <div className="flex items-center gap-1">
                      <Select
                        value={member.role}
                        onValueChange={(val) => updateMemberRole(member.id, val as FamilyRole)}
                      >
                        <SelectTrigger className="h-7 w-24 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="member">{t('family.member')}</SelectItem>
                          <SelectItem value="viewer">{t('family.viewer')}</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button variant="ghost" size="icon" onClick={() => removeMember(member.id)} className="h-7 w-7 text-destructive hover:text-destructive">
                        <UserMinus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Invite section */}
            {isOwner && (
              <div className="mt-4 p-4 rounded-xl bg-muted/30 border border-border/50 space-y-3">
                <h3 className="font-medium text-sm flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  {t('family.inviteMember')}
                </h3>

                <div className="flex items-center gap-2">
                  <Input
                    type="email"
                    placeholder="email@primjer.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="h-9 text-sm flex-1"
                    onKeyDown={(e) => e.key === 'Enter' && handleSendInvite()}
                  />
                  <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as FamilyRole)}>
                    <SelectTrigger className="h-9 w-28 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">{t('family.member')}</SelectItem>
                      <SelectItem value="viewer">{t('family.viewer')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button 
                  onClick={handleSendInvite} 
                  size="sm" 
                  disabled={!inviteEmail.trim() || inviteLoading}
                  className="gap-1.5 w-full"
                >
                  {inviteLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  {t('family.sendInvitation')}
                </Button>
              </div>
            )}
          </section>

          {/* Activity Feed */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                {t('family.activity')}
              </h2>
            </div>

            {activitiesLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : activities.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">{t('family.noActivity')}</p>
            ) : (
              <div className="space-y-1">
                {activities.map(activity => {
                  const actionIcons: Record<string, string> = {
                    added_source: '💳',
                    removed_source: '🗑️',
                    added_budget: '💰',
                    removed_budget: '🗑️',
                    added_project: '📁',
                    removed_project: '🗑️',
                    invited_member: '✉️',
                    member_joined: '👋',
                    member_left: '👤',
                  };
                  return (
                    <div key={activity.id} className="flex items-start gap-2.5 p-2.5 rounded-lg hover:bg-muted/30 transition-colors">
                      <span className="text-sm mt-0.5">{actionIcons[activity.action_type] || '📝'}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">
                          <span className="font-medium">{activity.display_name}</span>
                          {' '}
                          <span className="text-muted-foreground">{activity.action_description}</span>
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true, locale: hr })}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>


          {/* Danger zone */}
          {isOwner && (
            <section className="pt-4 border-t border-border/30">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDeleteConfirmOpen(true)}
                className="gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t('family.deleteGroup')}
              </Button>
            </section>
          )}
        </div>
      </motion.div>

      <FamilyGroupDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        group={group}
        onSave={async (data) => {
          await onUpdate(group.id, data);
          setEditDialogOpen(false);
        }}
      />

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('family.deleteGroupConfirm')} "{group.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {t('family.deleteGroupDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('family.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('family.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <PaymentSourceTransactionsDialog
        open={paymentSourceDialogOpen}
        onOpenChange={setPaymentSourceDialogOpen}
        paymentSource={selectedPaymentSource}
        expenses={allExpenses}
        onUpdate={updateExpense}
        onDelete={deleteExpense}
      />
      <BudgetDetailDialog
        open={budgetDialogOpen}
        onOpenChange={setBudgetDialogOpen}
        budget={selectedBudget}
        onEdit={() => {}}
      />
      {/* Full-screen Project View - identical to main dashboard */}
      <ProjectFullScreenView
        open={projectFullScreenOpen}
        onClose={() => {
          setProjectFullScreenOpen(false);
          setSelectedProject(null);
          fetchProjectStats();
        }}
        project={selectedProject}
        onRefreshExpenses={refetchExpenses}
      />
      <BottomNav />
    </div>
  );
};
