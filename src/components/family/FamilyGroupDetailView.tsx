import { useState } from 'react';
import { FamilyGroup, FAMILY_ROLE_LABELS, FamilyRole } from '@/types/family';
import { useFamilyMembers, useFamilySharedResources, useFamilyActivity } from '@/hooks/useFamilyGroups';
import { useProjects } from '@/hooks/useProjects';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import { Input } from '@/components/ui/input';
import { useBudgets } from '@/hooks/useBudgets';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useAuth } from '@/hooks/useAuth';
import { useExpenses } from '@/hooks/useExpenses';
import { BottomNav } from '@/components/BottomNav';
import { PaymentSourceTransactionsDialog } from '@/components/PaymentSourceTransactionsDialog';
import { BudgetDetailDialog } from '@/components/budget/BudgetDetailDialog';
import { ProjectDetailDialog } from '@/components/projects/ProjectDetailDialog';
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
  Wallet, Target, Settings, UserMinus, Send, FolderKanban, Activity, MessageCircle
} from 'lucide-react';
import { FamilyChat } from './FamilyChat';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { hr } from 'date-fns/locale';
import { toast } from 'sonner';
import { FamilyGroupDialog } from './FamilyGroupDialog';

interface Props {
  group: FamilyGroup;
  onBack: () => void;
  onUpdate: (id: string, data: Partial<FamilyGroup>) => Promise<void>;
  onDelete: () => Promise<void>;
}

export const FamilyGroupDetailView = ({ group, onBack, onUpdate, onDelete }: Props) => {
  const { user } = useAuth();
  const { formatAmount } = useCurrency();
  const { members, invitations, loading: membersLoading, isOwner, updateMemberRole, removeMember, generateInviteLink, cancelInvitation } = useFamilyMembers(group.id);
  const { sharedSources, sharedBudgets, sharedProjects, loading: resourcesLoading, addSharedSource, removeSharedSource, addSharedBudget, removeSharedBudget, addSharedProject, removeSharedProject } = useFamilySharedResources(group.id);
  const { customPaymentSources: paymentSources } = useCustomPaymentSources();
  const { budgets } = useBudgets({});
  const { projects } = useProjects();
  const { activities, loading: activitiesLoading } = useFamilyActivity(group.id);
  const { allExpenses, updateExpense, deleteExpense, refetch: refetchExpenses } = useExpenses();

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<FamilyRole>('member');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [showAddSource, setShowAddSource] = useState(false);
  const [showAddBudget, setShowAddBudget] = useState(false);
  const [showAddProject, setShowAddProject] = useState(false);
  const [selectedPaymentSource, setSelectedPaymentSource] = useState<CustomPaymentSource | null>(null);
  const [paymentSourceDialogOpen, setPaymentSourceDialogOpen] = useState(false);
  const [selectedBudget, setSelectedBudget] = useState<BudgetWithStats | null>(null);
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<ProjectWithOwnership | null>(null);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);

  const totalBalance = sharedSources.reduce((sum, s) => sum + (s.source_balance || 0), 0);
  const existingSourceIds = new Set(sharedSources.map(s => s.payment_source_id));
  const existingBudgetIds = new Set(sharedBudgets.map(b => b.budget_id));
  const existingProjectIds = new Set(sharedProjects.map(p => p.project_id));

  const availableSources = paymentSources.filter(ps => !existingSourceIds.has(ps.id));
  const availableBudgets = budgets.filter(b => !existingBudgetIds.has(b.id));
  const availableProjects = projects.filter(p => !existingProjectIds.has(p.id));

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
          toast.error('Korisnik s tim emailom nije pronađen u sustavu');
        } else if (data.error === 'already_member') {
          toast.error('Korisnik je već član grupe');
        } else if (data.error === 'already_invited') {
          toast.error('Korisnik već ima aktivnu pozivnicu');
        } else {
          toast.error(data.message || 'Greška pri slanju pozivnice');
        }
        return;
      }

      toast.success(`Pozivnica poslana na ${inviteEmail.trim()}`);
      setInviteEmail('');
      members && fetchMembers();
    } catch (error) {
      console.error('Error sending invitation:', error);
      toast.error('Greška pri slanju pozivnice');
    } finally {
      setInviteLoading(false);
    }
  };

  const fetchMembers = () => {
    // Trigger refetch by calling the hook's refetch
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
              <p className="text-xs text-muted-foreground">{members.length} članova</p>
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
            <p className="text-xs text-muted-foreground mb-1">Ukupno stanje dijeljenih računa</p>
            <p className="text-2xl font-bold">{formatAmount(totalBalance)}</p>
          </div>

          {/* Shared Sources */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold flex items-center gap-2">
                <Wallet className="h-4 w-4 text-muted-foreground" />
                Dijeljeni računi
              </h2>
              {isOwner && (
                <Button variant="ghost" size="sm" onClick={() => setShowAddSource(!showAddSource)} className="h-8 gap-1">
                  <Plus className="h-3.5 w-3.5" />
                  Dodaj
                </Button>
              )}
            </div>

            {showAddSource && availableSources.length > 0 && (
              <div className="mb-3 space-y-1.5 p-3 rounded-lg bg-muted/30 border border-border/50">
                <p className="text-xs text-muted-foreground mb-2">Odaberi račun za dodavanje:</p>
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
              <p className="text-xs text-muted-foreground mb-3 p-3 bg-muted/30 rounded-lg">Svi računi su već dodani u grupu.</p>
            )}

            {sharedSources.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nema dodanih računa</p>
            ) : (
              <div className="space-y-2">
                {sharedSources.map(source => (
                  <div
                    key={source.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border/50 cursor-pointer hover:bg-muted/50 transition-colors"
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
                  >
                    <span className="text-lg">{source.source_icon || '💳'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{source.source_name || 'Račun'}</p>
                    </div>
                    <span className="text-sm font-semibold">{formatAmount(source.source_balance || 0)}</span>
                    {isOwner && (
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
                Dijeljeni budžeti
              </h2>
              {isOwner && (
                <Button variant="ghost" size="sm" onClick={() => setShowAddBudget(!showAddBudget)} className="h-8 gap-1">
                  <Plus className="h-3.5 w-3.5" />
                  Dodaj
                </Button>
              )}
            </div>

            {showAddBudget && availableBudgets.length > 0 && (
              <div className="mb-3 space-y-1.5 p-3 rounded-lg bg-muted/30 border border-border/50">
                <p className="text-xs text-muted-foreground mb-2">Odaberi budžet za dodavanje:</p>
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
              <p className="text-xs text-muted-foreground mb-3 p-3 bg-muted/30 rounded-lg">Svi budžeti su već dodani u grupu.</p>
            )}

            {sharedBudgets.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nema dodanih budžeta</p>
            ) : (
              <div className="space-y-2">
                {sharedBudgets.map(budget => {
                  // Find the full budget from the budgets list, or construct a minimal one
                  const fullBudget = budgets.find(b => b.id === budget.budget_id);
                  return (
                  <div
                    key={budget.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border/50 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => {
                      if (fullBudget) {
                        setSelectedBudget(fullBudget);
                        setBudgetDialogOpen(true);
                      } else {
                        toast.info('Budžet nije dostupan za pregled');
                      }
                    }}
                  >
                    <span className="text-lg">{budget.budget_icon || '💰'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{budget.budget_name || 'Budžet'}</p>
                    </div>
                    <span className="text-sm font-semibold">{formatAmount(budget.budget_total || 0)}</span>
                    {isOwner && (
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

          {/* Shared Projects */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold flex items-center gap-2">
                <FolderKanban className="h-4 w-4 text-muted-foreground" />
                Dijeljeni projekti
              </h2>
              {isOwner && (
                <Button variant="ghost" size="sm" onClick={() => setShowAddProject(!showAddProject)} className="h-8 gap-1">
                  <Plus className="h-3.5 w-3.5" />
                  Dodaj
                </Button>
              )}
            </div>

            {showAddProject && availableProjects.length > 0 && (
              <div className="mb-3 space-y-1.5 p-3 rounded-lg bg-muted/30 border border-border/50">
                <p className="text-xs text-muted-foreground mb-2">Odaberi projekt za dodavanje:</p>
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
              <p className="text-xs text-muted-foreground mb-3 p-3 bg-muted/30 rounded-lg">Svi projekti su već dodani u grupu.</p>
            )}

            {sharedProjects.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nema dodanih projekata</p>
            ) : (
              <div className="space-y-2">
                {sharedProjects.map(project => {
                  const fullProject = projects.find(p => p.id === project.project_id);
                  return (
                  <div
                    key={project.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border/50 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => {
                      if (fullProject) {
                        setSelectedProject(fullProject);
                        setProjectDialogOpen(true);
                      } else {
                        toast.info('Projekt nije dostupan za pregled');
                      }
                    }}
                  >
                    <span className="text-lg">{project.project_icon || '📁'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{project.project_name || 'Projekt'}</p>
                      <p className="text-xs text-muted-foreground capitalize">{project.project_status || ''}</p>
                    </div>
                    <span className="text-sm font-semibold">{formatAmount(project.project_total_budget || 0)}</span>
                    {isOwner && (
                      <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); removeSharedProject(project.id); }} className="h-7 w-7 text-destructive hover:text-destructive">
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
                Članovi ({members.length})
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
                      {member.user_id === user?.id && <span className="text-muted-foreground"> (ti)</span>}
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
                          <SelectItem value="member">Član</SelectItem>
                          <SelectItem value="viewer">Preglednik</SelectItem>
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
                  Pozovi člana putem emaila
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
                      <SelectItem value="member">Član</SelectItem>
                      <SelectItem value="viewer">Preglednik</SelectItem>
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
                  Pošalji pozivnicu
                </Button>
              </div>
            )}
          </section>

          {/* Activity Feed */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                Aktivnost
              </h2>
            </div>

            {activitiesLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : activities.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nema zabilježenih aktivnosti</p>
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
          {/* Chat */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-muted-foreground" />
                Chat
              </h2>
            </div>
            <div className="rounded-xl p-3 bg-card border border-border/50">
              <FamilyChat groupId={group.id} groupColor={group.color || '#3b82f6'} />
            </div>
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
                Obriši grupu
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
            <AlertDialogTitle>Obriši grupu "{group.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Ovo će trajno obrisati grupu i sve njene veze s računima i budžetima. Sami računi i budžeti neće biti obrisani.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Odustani</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Obriši
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
      <ProjectDetailDialog
        open={projectDialogOpen}
        onOpenChange={setProjectDialogOpen}
        project={selectedProject}
        onRefreshExpenses={refetchExpenses}
      />
      <BottomNav />
    </div>
  );
};
