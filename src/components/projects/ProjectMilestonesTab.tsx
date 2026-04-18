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
import { Plus, Pencil, Trash2, CalendarIcon, GripVertical, Loader2, Target, Link2, Bell, AlertTriangle, List, Columns3 } from 'lucide-react';
import { MilestoneKanban } from './MilestoneKanban';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { showError } from '@/hooks/useStatusFeedback';

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
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<ProjectMilestone | null>(null);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  
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
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;

    // Validate dependency: can't start if dependency not completed
    if (status === 'in_progress' && dependsOn) {
      const depMilestone = milestones.find(m => m.id === dependsOn);
      if (depMilestone && depMilestone.status !== 'completed') {
        const { toast } = await import('sonner');
        showError(t('projects.dependencyNotCompleted', 'Prethodna faza mora biti završena prije pokretanja ove faze'));
        return;
      }
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
        await updateMilestone({ ...editingMilestone, ...milestoneData });
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
      {isManager && (
        <div className="flex justify-end">
          <Button onClick={() => openDialog()} size="sm">
            <Plus className="w-4 h-4 mr-2" />
            {t('projects.addMilestone')}
          </Button>
        </div>
      )}

      {milestones.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Target className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>{t('projects.noMilestones')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {milestones.map((milestone) => {
            const budgetUsed = milestone.budget > 0 
              ? ((milestone.spent || 0) / milestone.budget) * 100 
              : 0;
            const isOverBudget = milestone.budget > 0 && (milestone.spent || 0) > milestone.budget;
            const overAmount = isOverBudget ? (milestone.spent || 0) - milestone.budget : 0;

            return (
              <div 
                key={milestone.id}
                className={cn(
                  "p-4 rounded-lg border bg-card hover:shadow-sm transition-shadow",
                  isOverBudget && "border-destructive/40 bg-destructive/5"
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="w-3 h-3 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: milestone.color || '#3b82f6' }} />
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h4 className="font-medium truncate">{milestone.name}</h4>
                      <Badge variant="outline" className="text-xs">
                        {MILESTONE_STATUS_LABELS[milestone.status]}
                      </Badge>
                      {isOverBudget && (
                        <Badge variant="destructive" className="text-xs gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          +{formatAmount(overAmount)}
                        </Badge>
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
      )}

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
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('projects.startDate')}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate ? format(startDate, 'd. MMM', { locale: hr }) : t('common.select')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={startDate} onSelect={setStartDate} />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>{t('projects.dueDate')}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dueDate ? format(dueDate, 'd. MMM', { locale: hr }) : t('common.select')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={dueDate} onSelect={setDueDate} />
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
    </div>
  );
};
