import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ProjectMilestone, MilestoneStatus, MILESTONE_STATUS_LABELS } from '@/types/project';
import { useProjectMilestones } from '@/hooks/useProjectMilestones';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Plus, Pencil, Trash2, CalendarIcon, GripVertical, Loader2, Target, Link2, Bell, AlertTriangle, List, Columns3, ListChecks, Shield, History } from 'lucide-react';
import { MilestoneKanban } from './MilestoneKanban';
import { MilestoneChecklist } from './MilestoneChecklist';
import { MilestoneBudgetChangeSection } from './MilestoneBudgetChangeSection';
import { MilestoneRevisionsDialog } from './MilestoneRevisionsDialog';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { showError } from '@/hooks/useStatusFeedback';
import { VoiceInputButton } from '@/components/VoiceInputButton';
import { getDateRange, makeCalendarDisabled } from '@/lib/dateValidation';
import { MilestoneRevisionType, MilestoneRevisionCoverage } from '@/types/milestoneRevision';
import { useMilestoneRevisions } from '@/hooks/useMilestoneRevisions';
import { MilestoneRevisionTrendBadge } from './MilestoneRevisionTrendBadge';

interface ProjectMilestonesTabProps {
  projectId: string;
  milestones: ProjectMilestone[];
  isManager: boolean;
  loading: boolean;
  onRefetch: () => void;
}

export const ProjectMilestonesTab = ({
  projectId,
  milestones,
  isManager,
  loading,
  onRefetch
}: ProjectMilestonesTabProps) => {
  const { t } = useTranslation();
  const { formatAmount, currency } = useCurrency();
  const { addMilestone, updateMilestone, deleteMilestone } = useProjectMilestones(projectId);
  const { getRevisionCount, getRecentTrend } = useMilestoneRevisions(projectId);
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<ProjectMilestone | null>(null);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [revisionsDialogOpen, setRevisionsDialogOpen] = useState(false);
  const [revisionsTarget, setRevisionsTarget] = useState<ProjectMilestone | null>(null);
  
  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [budget, setBudget] = useState('');
  const [status, setStatus] = useState<MilestoneStatus>('pending');
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [color, setColor] = useState('#3b82f6');
  const [dependsOn, setDependsOn] = useState<string>('');
  const [reminderDays, setReminderDays] = useState('3');
  const [startOpen, setStartOpen] = useState(false);
  const [dueOpen, setDueOpen] = useState(false);
  // Budget revision state (only relevant when editing)
  const [revisionReason, setRevisionReason] = useState('');
  const [revisionType, setRevisionType] = useState<MilestoneRevisionType | null>(null);
  const [revisionCoverage, setRevisionCoverage] = useState<MilestoneRevisionCoverage>('increase_total');
  const [revisionLinkedId, setRevisionLinkedId] = useState<string | null>(null);

  const contingencyMilestone = milestones.find((m) => m.is_contingency) || null;
  const previousBudget = editingMilestone ? editingMilestone.budget : 0;
  const newBudgetNum = parseFloat(budget) || 0;
  const budgetChanged = !!editingMilestone && Math.abs(newBudgetNum - previousBudget) > 0.001;

  const MILESTONE_COLORS = [
    '#3b82f6', '#22c55e', '#8b5cf6', '#f59e0b', 
    '#ec4899', '#06b6d4', '#ef4444', '#84cc16',
    '#f97316', '#6366f1', '#14b8a6', '#a855f7',
    '#ffffff'
  ];

  const openDialog = (milestone?: ProjectMilestone) => {
    if (milestone) {
      setEditingMilestone(milestone);
      setName(milestone.name);
      setDescription(milestone.description || '');
      setBudget(milestone.budget.toString());
      setStatus(milestone.status);
      setColor(milestone.color || '#3b82f6');
      setStartDate(milestone.start_date ? new Date(milestone.start_date) : undefined);
      setDueDate(milestone.due_date ? new Date(milestone.due_date) : undefined);
      setDependsOn(milestone.depends_on_milestone_id || '');
      setReminderDays((milestone.reminder_days_before ?? 3).toString());
    } else {
      setEditingMilestone(null);
      setName('');
      setDescription('');
      setBudget('');
      setStatus('pending');
      setColor('#3b82f6');
      setStartDate(undefined);
      setDueDate(undefined);
      setDependsOn('');
      setReminderDays('3');
    }
    // Reset revision form on every dialog open
    setRevisionReason('');
    setRevisionType(null);
    setRevisionCoverage('increase_total');
    setRevisionLinkedId(null);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;

    // Validate dependency: can't start if dependency not completed
    if (status === 'in_progress' && dependsOn) {
      const depMilestone = milestones.find(m => m.id === dependsOn);
      if (depMilestone && depMilestone.status !== 'completed') {
        showError(t('projects.dependencyNotCompleted', 'Prethodna faza mora biti završena prije pokretanja ove faze'));
        return;
      }
    }

    // If editing and budget changed, require a reason
    if (budgetChanged && !revisionReason.trim()) {
      showError(t('projects.revisions.reasonRequired', 'Razlog promjene budžeta je obavezan.'));
      return;
    }
    // For increases via transfer, require source selection
    if (
      budgetChanged &&
      newBudgetNum > previousBudget &&
      revisionCoverage === 'transfer' &&
      !revisionLinkedId
    ) {
      showError(t('projects.revisions.selectSourceRequired', 'Odaberite izvornu fazu za prijenos sredstava.'));
      return;
    }
    
    setSaving(true);
    try {
      const milestoneData = {
        project_id: projectId,
        name: name.trim(),
        description: description.trim() || null,
        budget: parseFloat(budget) || 0,
        status,
        color,
        start_date: startDate ? format(startDate, 'yyyy-MM-dd') : null,
        due_date: dueDate ? format(dueDate, 'yyyy-MM-dd') : null,
        sort_order: editingMilestone?.sort_order ?? milestones.length,
        depends_on_milestone_id: dependsOn && dependsOn !== 'none' ? dependsOn : null,
        reminder_days_before: parseInt(reminderDays) || 3,
      };

      if (editingMilestone) {
        const revisionInput = budgetChanged
          ? {
              reason: revisionReason.trim(),
              change_type: revisionType,
              coverage: revisionCoverage,
              linked_milestone_id: revisionCoverage === 'transfer' ? revisionLinkedId : null,
            }
          : undefined;
        await updateMilestone({ ...editingMilestone, ...milestoneData }, revisionInput, previousBudget);
      } else {
        await addMilestone(milestoneData);
      }
      
      setDialogOpen(false);
      onRefetch();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm(t('projects.confirmDeleteMilestone'))) {
      await deleteMilestone(id);
      onRefetch();
    }
  };

  const getStatusColor = (status: MilestoneStatus) => {
    switch (status) {
      case 'completed': return 'bg-green-500';
      case 'in_progress': return 'bg-blue-500';
      case 'overdue': return 'bg-red-500';
      default: return 'bg-gray-400';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <ToggleGroup type="single" value={viewMode} onValueChange={(v) => v && setViewMode(v as any)} size="sm">
          <ToggleGroupItem value="list" className="h-8 px-2.5 gap-1.5 text-xs">
            <List className="w-3.5 h-3.5" />
            {t('projects.kanban.list', 'Lista')}
          </ToggleGroupItem>
          <ToggleGroupItem value="kanban" className="h-8 px-2.5 gap-1.5 text-xs">
            <Columns3 className="w-3.5 h-3.5" />
            {t('projects.kanban.board', 'Ploča')}
          </ToggleGroupItem>
        </ToggleGroup>
        {isManager && (
          <Button onClick={() => openDialog()} size="sm">
            <Plus className="w-4 h-4 mr-2" />
            {t('projects.addMilestone')}
          </Button>
        )}
      </div>

      {viewMode === 'kanban' && milestones.length > 0 && (
        <MilestoneKanban
          milestones={milestones}
          isManager={isManager}
          projectId={projectId}
          onEdit={(m) => openDialog(m)}
          onDelete={handleDelete}
          onShowRevisions={(m) => { setRevisionsTarget(m); setRevisionsDialogOpen(true); }}
          onStatusChange={async (m, newStatus) => {
            await updateMilestone({ ...m, status: newStatus });
            onRefetch();
          }}
        />
      )}

      {milestones.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Target className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>{t('projects.noMilestones')}</p>
        </div>
      ) : viewMode === 'list' ? (
        <div className="space-y-3">
          {[...milestones].sort((a, b) => Number(!!b.is_contingency) - Number(!!a.is_contingency)).map((milestone) => {
            const budgetUsed = milestone.budget > 0 
              ? ((milestone.spent || 0) / milestone.budget) * 100 
              : 0;
            const isOverBudget = milestone.budget > 0 && (milestone.spent || 0) > milestone.budget;
            const overAmount = isOverBudget ? (milestone.spent || 0) - milestone.budget : 0;
            const isContingency = !!milestone.is_contingency;

            return (
              <div 
                key={milestone.id}
                className={cn(
                  "p-4 rounded-lg border bg-card hover:shadow-sm transition-shadow",
                  isOverBudget && "border-destructive/40 bg-destructive/5",
                  isContingency && "border-dashed border-muted-foreground/40 bg-muted/20"
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="w-3 h-3 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: milestone.color || '#3b82f6' }} />
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {isContingency && <Shield className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                      <h4 className="font-medium truncate">{milestone.name}</h4>
                      {isContingency ? (
                        <Badge variant="secondary" className="text-[10px]">
                          {t('projects.contingency.badge', 'Rezerva')}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          {MILESTONE_STATUS_LABELS[milestone.status]}
                        </Badge>
                      )}
                      {isOverBudget && !isContingency && (
                        <Badge variant="destructive" className="text-xs gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          +{formatAmount(overAmount)}
                        </Badge>
                      )}
                      {isManager && (
                        <div className="ml-auto">
                          <MilestoneRevisionTrendBadge
                            revisionCount={getRevisionCount(milestone.id)}
                            recentTrend={getRecentTrend(milestone.id, 30)}
                            isContingency={isContingency}
                            contingencyOriginal={isContingency ? milestone.budget + (milestone.spent || 0) : undefined}
                            contingencyRemaining={isContingency ? milestone.budget : undefined}
                            onClick={(e) => { e.stopPropagation(); setRevisionsTarget(milestone); setRevisionsDialogOpen(true); }}
                          />
                        </div>
                      )}
                    </div>
                    
                    {milestone.description && (
                      <p className="text-sm text-muted-foreground mb-2">{milestone.description}</p>
                    )}

                    {milestone.budget > 0 && (
                      <div className="mb-2">
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="font-medium text-primary">
                            {formatAmount(milestone.budget)}
                          </span>
                          {(milestone.spent || 0) > 0 && (
                            <span className={cn("text-xs", isOverBudget ? "text-destructive" : "text-muted-foreground")}>
                              {formatAmount(milestone.spent || 0)} ({budgetUsed.toFixed(0)}%)
                            </span>
                          )}
                        </div>
                        {(milestone.spent || 0) > 0 && (
                          <Progress 
                            value={Math.min(budgetUsed, 100)} 
                            className={cn("h-1.5", isOverBudget && "[&>div]:bg-destructive")} 
                          />
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                      {milestone.start_date && (
                        <span>{t('projects.start')}: {format(new Date(milestone.start_date), 'd. MMM', { locale: hr })}</span>
                      )}
                      {milestone.due_date && (
                        <span>{t('projects.due')}: {format(new Date(milestone.due_date), 'd. MMM', { locale: hr })}</span>
                      )}
                      {milestone.depends_on_milestone_id && (
                        <span className="flex items-center gap-1 text-primary">
                          <Link2 className="w-3 h-3" />
                          {milestones.find(m => m.id === milestone.depends_on_milestone_id)?.name || '?'}
                        </span>
                      )}
                      {milestone.reminder_days_before && milestone.due_date && (
                        <span className="flex items-center gap-1">
                          <Bell className="w-3 h-3" />
                          {milestone.reminder_days_before}d
                        </span>
                      )}
                    </div>

                    <details className="mt-3 group/check">
                      <summary className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer hover:text-foreground select-none">
                        <ListChecks className="w-3.5 h-3.5" />
                        {t('projects.checklist.title', 'Koraci za izvođenje')}
                      </summary>
                      <MilestoneChecklist
                        milestoneId={milestone.id}
                        milestoneName={milestone.name}
                        canEdit={isManager}
                      />
                    </details>
                  </div>

                  {isManager && (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openDialog(milestone)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-destructive" 
                        onClick={() => handleDelete(milestone.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent showBackButton={false}>
          <DialogHeader>
            <DialogTitle>
              {editingMilestone ? t('projects.editMilestone') : t('projects.addMilestone')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('projects.milestoneName')}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('projects.milestoneNamePlaceholder')} />
            </div>

            <div className="space-y-2">
              <Label>{t('projects.description')}</Label>
              <div className="relative">
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="pr-12"
                />
                <VoiceInputButton
                  value={description}
                  onChange={setDescription}
                  className="absolute bottom-2 right-2"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('projects.budget')}</Label>
                <div className="relative">
                  <Input 
                    type="number" 
                    value={budget} 
                    onChange={(e) => setBudget(e.target.value)} 
                    className="pr-12"
                    min="0"
                    step="0.01"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {currency.symbol}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t('projects.status')}</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as MilestoneStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(MILESTONE_STATUS_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {budgetChanged && editingMilestone && !editingMilestone.is_contingency && (
              <MilestoneBudgetChangeSection
                previousAmount={previousBudget}
                newAmount={newBudgetNum}
                reason={revisionReason}
                onReasonChange={setRevisionReason}
                changeType={revisionType}
                onChangeTypeChange={setRevisionType}
                coverage={revisionCoverage}
                onCoverageChange={setRevisionCoverage}
                linkedMilestoneId={revisionLinkedId}
                onLinkedMilestoneChange={setRevisionLinkedId}
                siblingMilestones={milestones}
                contingencyMilestone={contingencyMilestone}
                currentMilestoneId={editingMilestone.id}
              />
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('projects.startDate')}</Label>
                <Popover open={startOpen} onOpenChange={setStartOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate ? format(startDate, 'd. MMM', { locale: hr }) : t('common.select')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={(d) => { setStartDate(d); if (d) setStartOpen(false); }}
                      disabled={makeCalendarDisabled(getDateRange('budget'))}
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>{t('projects.dueDate')}</Label>
                <Popover open={dueOpen} onOpenChange={setDueOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dueDate ? format(dueDate, 'd. MMM', { locale: hr }) : t('common.select')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dueDate}
                      onSelect={(d) => { setDueDate(d); if (d) setDueOpen(false); }}
                      disabled={(date) => {
                        const r = getDateRange('budget');
                        if (date < r.min || date > r.max) return true;
                        if (startDate && date < startDate) return true;
                        return false;
                      }}
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Dependency */}
            <div className="space-y-2">
              <Label>{t('projects.dependsOn', 'Ovisi o fazi')}</Label>
              <Select value={dependsOn} onValueChange={setDependsOn}>
                <SelectTrigger>
                  <SelectValue placeholder={t('projects.noDependency', 'Nema ovisnosti')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('projects.noDependency', 'Nema ovisnosti')}</SelectItem>
                  {milestones
                    .filter(m => m.id !== editingMilestone?.id)
                    .map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))
                  }
                </SelectContent>
              </Select>
            </div>

            {/* Reminder days */}
            <div className="space-y-2">
              <Label>{t('projects.reminderDays', 'Podsjetnik (dana prije roka)')}</Label>
              <Input 
                type="number" 
                value={reminderDays} 
                onChange={(e) => setReminderDays(e.target.value)} 
                min="0" 
                max="30"
              />
            </div>

            <div className="space-y-2">
              <Label>{t('projects.color', 'Boja')}</Label>
              <div className="flex flex-wrap gap-2">
                {MILESTONE_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={cn(
                      "w-7 h-7 rounded-full border-2 transition-transform",
                      color === c ? "border-foreground scale-110" : c === '#ffffff' ? "border-muted-foreground/40" : "border-transparent"
                    )}
                    style={{ backgroundColor: c }}
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button className="flex-1" onClick={handleSave} disabled={saving || !name.trim()}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {t('common.save')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <MilestoneRevisionsDialog
        open={revisionsDialogOpen}
        onOpenChange={(o) => { setRevisionsDialogOpen(o); if (!o) setRevisionsTarget(null); }}
        projectId={projectId}
        milestone={revisionsTarget}
        allMilestones={milestones}
      />
    </div>
  );
};
