import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useProjectCollaborators } from '@/hooks/useProjectCollaborators';
import { ProjectCollaborator, ProjectCollaboratorInput } from '@/types/projectCollaborator';
import { ProjectCollaboratorDialog } from './ProjectCollaboratorDialog';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil, Trash2, Handshake, Building2, Loader2, Target, Search } from 'lucide-react';

interface Milestone {
  id: string;
  name: string;
}

interface ProjectCollaboratorsTabProps {
  projectId: string;
  milestones: Milestone[];
  isManager: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  completed: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  cancelled: 'bg-red-500/10 text-red-700 dark:text-red-400',
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Aktivan',
  completed: 'Završen',
  cancelled: 'Otkazan',
};

type StatusFilter = 'all' | 'active' | 'completed' | 'cancelled';
type SortKey = 'newest' | 'oldest' | 'name' | 'agreed' | 'paid' | 'remaining';

export const ProjectCollaboratorsTab = ({ projectId, milestones, isManager }: ProjectCollaboratorsTabProps) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const { collaborators, loading, addCollaborator, updateCollaborator, deleteCollaborator } = useProjectCollaborators(projectId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectCollaborator | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [toDelete, setToDelete] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [milestoneFilter, setMilestoneFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('newest');
  const [search, setSearch] = useState('');

  const handleSave = async (data: ProjectCollaboratorInput) => {
    if (editing) {
      await updateCollaborator({ ...editing, ...data });
    } else {
      await addCollaborator(data);
    }
  };

  const getMilestoneName = (id: string | null | undefined) => {
    if (!id) return null;
    return milestones.find(m => m.id === id)?.name || null;
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let arr = collaborators.filter(c => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (milestoneFilter === 'none') {
        if (c.milestone_id) return false;
      } else if (milestoneFilter !== 'all') {
        if (c.milestone_id !== milestoneFilter) return false;
      }
      if (q) {
        const hay = [
          c.first_name, c.last_name, c.company_name || '', c.service_description || '',
        ].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    arr = [...arr].sort((a, b) => {
      switch (sortKey) {
        case 'oldest':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'name':
          return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
        case 'agreed':
          return b.total_price - a.total_price;
        case 'paid':
          return b.paid_amount - a.paid_amount;
        case 'remaining':
          return (b.total_price - b.paid_amount) - (a.total_price - a.paid_amount);
        case 'newest':
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

    return arr;
  }, [collaborators, statusFilter, milestoneFilter, sortKey, search]);

  const totals = useMemo(() => {
    const agreed = filtered.reduce((s, c) => s + c.total_price, 0);
    const paid = filtered.reduce((s, c) => s + c.paid_amount, 0);
    const activeCount = filtered.filter(c => c.status === 'active').length;
    const completedCount = filtered.filter(c => c.status === 'completed').length;
    return { agreed, paid, remaining: agreed - paid, activeCount, completedCount };
  }, [filtered]);

  const resetFilters = () => {
    setStatusFilter('all');
    setMilestoneFilter('all');
    setSortKey('newest');
    setSearch('');
  };

  const filtersActive = statusFilter !== 'all' || milestoneFilter !== 'all' || sortKey !== 'newest' || search.trim() !== '';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Handshake className="w-5 h-5 text-muted-foreground" />
          <h3 className="font-semibold">{t('collaborators.title', 'Vanjski suradnici')}</h3>
          <Badge variant="secondary">{collaborators.length}</Badge>
        </div>
        {isManager && (
          <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="w-4 h-4 mr-1" />
            {t('collaborators.add', 'Dodaj')}
          </Button>
        )}
      </div>

      {collaborators.length > 0 && (
        <>
          {/* Filters */}
          <Card className="p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder={t('collaboratorsFilters.filterStatus')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('collaboratorsFilters.allStatuses')}</SelectItem>
                  <SelectItem value="active">{t('collaboratorsFilters.statusActive')}</SelectItem>
                  <SelectItem value="completed">{t('collaboratorsFilters.statusCompleted')}</SelectItem>
                  <SelectItem value="cancelled">{t('collaboratorsFilters.statusCancelled')}</SelectItem>
                </SelectContent>
              </Select>

              <Select value={milestoneFilter} onValueChange={setMilestoneFilter}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder={t('collaboratorsFilters.filterMilestone')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('collaboratorsFilters.allMilestones')}</SelectItem>
                  <SelectItem value="none">{t('collaboratorsFilters.noMilestone')}</SelectItem>
                  {milestones.map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                <SelectTrigger className="h-9 text-xs col-span-2">
                  <SelectValue placeholder={t('collaboratorsFilters.sortBy')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">{t('collaboratorsFilters.sortNewest')}</SelectItem>
                  <SelectItem value="oldest">{t('collaboratorsFilters.sortOldest')}</SelectItem>
                  <SelectItem value="name">{t('collaboratorsFilters.sortName')}</SelectItem>
                  <SelectItem value="agreed">{t('collaboratorsFilters.sortAgreed')}</SelectItem>
                  <SelectItem value="paid">{t('collaboratorsFilters.sortPaid')}</SelectItem>
                  <SelectItem value="remaining">{t('collaboratorsFilters.sortRemaining')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('collaboratorsFilters.search')}
                className="h-9 text-xs pl-8"
              />
            </div>
          </Card>

          {/* Summary */}
          {filtered.length > 0 && (
            <Card className="p-4 bg-muted/50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t('collaborators.agreedTotal', 'Dogovoreno ukupno')}:</span>
                <span className="text-base font-bold text-muted-foreground">{formatAmount(totals.agreed)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t('collaborators.paidTotal', 'Isplaćeno ukupno')}:</span>
                <span className="text-base font-bold text-primary">{formatAmount(totals.paid)}</span>
              </div>
              <div className="border-t pt-2 flex items-center justify-between">
                <span className="text-sm font-medium">{t('collaboratorsFilters.remainingTotal')}:</span>
                <span className="text-lg font-bold text-orange-600 dark:text-orange-400">{formatAmount(totals.remaining)}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {t('collaboratorsFilters.activeCount')}: {totals.activeCount} · {t('collaboratorsFilters.completedCount')}: {totals.completedCount}
              </div>
            </Card>
          )}
        </>
      )}

      {/* List */}
      {collaborators.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Handshake className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>{t('collaborators.noCollaborators', 'Nema vanjskih suradnika')}</p>
          <p className="text-sm">{t('collaborators.noCollaboratorsHint', 'Dodajte vanjske suradnike za praćenje troškova i sudjelovanja.')}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground space-y-3">
          <Handshake className="w-12 h-12 mx-auto opacity-50" />
          <p className="text-sm">{t('collaboratorsFilters.noResults')}</p>
          {filtersActive && (
            <Button variant="outline" size="sm" onClick={resetFilters}>
              {t('collaboratorsFilters.resetFilters')}
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(c => {
            const milestoneName = getMilestoneName(c.milestone_id);
            const remaining = c.total_price - c.paid_amount;
            const pct = c.total_price > 0 ? Math.min(100, Math.round((c.paid_amount / c.total_price) * 100)) : 0;
            const isComplete = pct >= 100;
            return (
              <Card key={c.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-medium">{c.first_name} {c.last_name}</h4>
                      <Badge className={STATUS_COLORS[c.status] || ''} variant="secondary">
                        {t(`collaborators.status${c.status.charAt(0).toUpperCase() + c.status.slice(1)}`, STATUS_LABELS[c.status] || c.status)}
                      </Badge>
                    </div>

                    {c.company_name && (
                      <div className="flex items-center gap-1 mt-1 text-sm text-muted-foreground">
                        <Building2 className="w-3.5 h-3.5" />
                        <span>{c.company_name}</span>
                      </div>
                    )}

                    <p className="text-sm text-muted-foreground mt-1">{c.service_description}</p>

                    {milestoneName && (
                      <div className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground">
                        <Target className="w-3.5 h-3.5" />
                        <span>{milestoneName}</span>
                      </div>
                    )}

                    <div className="mt-2 text-sm space-y-0.5">
                      <div className="font-medium">
                        {t('collaborators.agreed', 'Dogovoreno')}: <span className="text-muted-foreground">{formatAmount(c.total_price)}</span>
                      </div>
                      <div className="font-medium">
                        {t('collaborators.paid', 'Isplaćeno')}: <span className="text-primary">{formatAmount(c.paid_amount)}</span>
                      </div>
                      <div className="font-medium">
                        {t('collaboratorsFilters.remaining')}: <span className={remaining > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-emerald-600 dark:text-emerald-400'}>{formatAmount(remaining)}</span>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${isComplete ? 'bg-blue-500' : 'bg-emerald-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground tabular-nums w-9 text-right">{pct}%</span>
                    </div>

                    {c.contact_info && (
                      <p className="text-xs text-muted-foreground mt-1.5">{c.contact_info}</p>
                    )}
                  </div>

                  {isManager && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" onClick={() => { setEditing(c); setDialogOpen(true); }}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => { setToDelete(c.id); setDeleteConfirmOpen(true); }}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog */}
      <ProjectCollaboratorDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        collaborator={editing}
        milestones={milestones}
        onSave={handleSave}
      />

      {/* Delete Confirm */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('collaborators.deleteTitle', 'Ukloni suradnika?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('collaborators.deleteDescription', 'Ova radnja je nepovratna.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={async () => {
                if (toDelete) {
                  await deleteCollaborator(toDelete);
                  setDeleteConfirmOpen(false);
                  setToDelete(null);
                }
              }}
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
