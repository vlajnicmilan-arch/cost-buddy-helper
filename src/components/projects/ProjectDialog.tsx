import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Project, ProjectStatus, DEFAULT_PROJECT_COLORS, DEFAULT_PROJECT_ICONS, PROJECT_STATUS_LABELS } from '@/types/project';
import { ProjectType, getPreset, isValidProjectType } from '@/lib/projectTypes';
import { useTranslation } from 'react-i18next';
import { useCurrency } from '@/contexts/CurrencyContext';
import { CalendarIcon, Loader2, ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { ProjectTemplatePicker } from './ProjectTemplatePicker';
import { ProjectTemplate, useProjectTemplates } from '@/hooks/useProjectTemplates';
import { ProjectTypePickerStep } from './ProjectTypePickerStep';
import { VoiceInputButton } from '@/components/VoiceInputButton';
import { getDateRange, makeCalendarDisabled } from '@/lib/dateValidation';

interface ProjectDialogPreset {
  name?: string;
  icon?: string;
  color?: string;
  description?: string;
  totalBudget?: number;
}

interface ProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: Project | null;
  preset?: ProjectDialogPreset | null;
  onSave: (
    project: Omit<Project, 'id' | 'user_id' | 'created_at' | 'updated_at'>,
    template?: ProjectTemplate | null,
    addContingency?: boolean
  ) => Promise<void>;
  onUpdate?: (project: Project) => Promise<void>;
}

export const ProjectDialog = ({
  open,
  onOpenChange,
  project,
  preset,
  onSave,
  onUpdate
}: ProjectDialogProps) => {
  const { t } = useTranslation();
  const { currency } = useCurrency();
  const [saving, setSaving] = useState(false);

  // Wizard state — only relevant for create flow.
  const [step, setStep] = useState<1 | 2>(1);
  const [projectType, setProjectType] = useState<ProjectType>('general');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('📁');
  const [color, setColor] = useState('#3b82f6');
  const [status, setStatus] = useState<ProjectStatus>('draft');
  const [totalBudget, setTotalBudget] = useState('');
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [selectedTemplate, setSelectedTemplate] = useState<ProjectTemplate | null>(null);
  const [addContingency, setAddContingency] = useState(true);
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);

  const isEdit = !!project;
  const { templates } = useProjectTemplates();

  const activePreset = useMemo(() => getPreset(projectType), [projectType]);

  useEffect(() => {
    if (open && project) {
      // EDIT — type is locked, jump straight to step 2 with existing values.
      const existingType = (project.project_type && isValidProjectType(String(project.project_type)))
        ? (project.project_type as ProjectType)
        : 'general';
      setProjectType(existingType);
      setStep(2);
      setName(project.name);
      setDescription(project.description || '');
      setIcon(project.icon || '📁');
      setColor(project.color || '#3b82f6');
      setStatus(project.status);
      setTotalBudget(project.total_budget?.toString() || '');
      setStartDate(project.start_date ? new Date(project.start_date) : undefined);
      setEndDate(project.end_date ? new Date(project.end_date) : undefined);
      setSelectedTemplate(null);
    } else if (open) {
      // CREATE — start at step 1 (type picker).
      setStep(1);
      setProjectType('general');
      setName(preset?.name ?? '');
      setDescription(preset?.description ?? '');
      setIcon(preset?.icon ?? '📁');
      setColor(preset?.color ?? '#3b82f6');
      setStatus('draft');
      setTotalBudget(preset?.totalBudget !== undefined ? String(preset.totalBudget) : '');
      setStartDate(undefined);
      setEndDate(undefined);
      setSelectedTemplate(null);
    }
  }, [open, project, preset]);

  // When user picks a project type in step 1, advance to step 2 and pre-populate
  // icon/color/template from the preset.
  const handleTypeSelected = (id: ProjectType) => {
    const p = getPreset(id);
    setProjectType(id);
    if (!preset?.icon) setIcon(p.icon);
    if (!preset?.color) setColor(p.color);

    // Auto pre-select ONLY on exact category match. No "general" fallback,
    // never overwrite fields the user already typed, never overwrite the
    // type-preset icon/color silently.
    if (p.templateCategory && templates.length > 0) {
      const match = templates.find((t) => t.category === p.templateCategory) ?? null;
      setSelectedTemplate(match);
      if (match) {
        if (!name.trim() && match.name) setName(match.name);
        if (!description.trim() && match.description) setDescription(match.description);
      }
    } else {
      setSelectedTemplate(null);
    }
    setStep(2);
  };

  const handleTemplateSelect = (tpl: ProjectTemplate | null) => {
    setSelectedTemplate(tpl);
    if (tpl) {
      if (!name.trim()) setName(tpl.name);
      if (tpl.icon) setIcon(tpl.icon);
      if (tpl.color) setColor(tpl.color);
      if (!description.trim() && tpl.description) setDescription(tpl.description);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    try {
      const projectData = {
        name: name.trim(),
        description: description.trim() || null,
        icon,
        color,
        status,
        total_budget: parseFloat(totalBudget) || 0,
        start_date: startDate ? format(startDate, 'yyyy-MM-dd') : null,
        end_date: endDate ? format(endDate, 'yyyy-MM-dd') : null,
        // project_type only set on create; ignored by updateProject.
        project_type: projectType,
      };

      if (project && onUpdate) {
        await onUpdate({ ...project, ...projectData });
      } else {
        await onSave(projectData, selectedTemplate, addContingency);
      }
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const typeName = t(`projectTypes.${activePreset.id}.name`, activePreset.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showBackButton={false} className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {!isEdit && step === 2 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 -ml-1"
                onClick={() => setStep(1)}
                aria-label={t('projectTypes.step.changeType', '← Promijeni vrstu')}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <span>{project ? t('projects.edit') : t('projects.add')}</span>
            {(isEdit || step === 2) && (
              <Badge variant="secondary" className="gap-1 font-normal">
                <span aria-hidden>{activePreset.icon}</span>
                <span className="text-xs">{typeName}</span>
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* STEP 1 — type picker (create only) */}
        {!isEdit && step === 1 && (
          <ProjectTypePickerStep
            selectedId={projectType}
            onSelect={handleTypeSelected}
          />
        )}

        {/* STEP 2 — project details */}
        {(isEdit || step === 2) && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isEdit && (
              <div className="flex justify-end -mt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setStep(1)}
                >
                  {t('projectTypes.step.changeType', '← Promijeni vrstu')}
                </Button>
              </div>
            )}

            {/* Template picker - only for new projects, filtered by type */}
            {!isEdit && (
              <div className="p-3 rounded-lg border border-dashed bg-muted/30">
                <ProjectTemplatePicker
                  selectedId={selectedTemplate?.id || null}
                  onSelect={handleTemplateSelect}
                  categoryFilter={activePreset.templateCategory}
                />
              </div>
            )}

            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">{t('projects.name')}</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('projects.namePlaceholder')}
                required
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">{t('projects.description')}</Label>
              <div className="relative">
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('projects.descriptionPlaceholder')}
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

            {/* Icon & Color */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('common.icon')}</Label>
                <div className="grid grid-cols-6 gap-1">
                  {DEFAULT_PROJECT_ICONS.map((i) => (
                    <button
                      key={i}
                      type="button"
                      className={cn(
                        "p-2 rounded-lg text-xl hover:bg-muted transition-colors",
                        icon === i && "bg-primary/20 ring-2 ring-primary"
                      )}
                      onClick={() => setIcon(i)}
                    >
                      {i}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t('common.color')}</Label>
                <div className="grid grid-cols-4 gap-1">
                  {DEFAULT_PROJECT_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={cn(
                        "w-8 h-8 rounded-full transition-all",
                        color === c && "ring-2 ring-offset-2 ring-primary"
                      )}
                      style={{ backgroundColor: c }}
                      onClick={() => setColor(c)}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Status */}
            <div className="space-y-2">
              <Label>{t('projects.status')}</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as ProjectStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PROJECT_STATUS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Budget */}
            <div className="space-y-2">
              <Label htmlFor="budget">{t('projects.budget')}</Label>
              <div className="relative">
                <Input
                  id="budget"
                  type="text"
                  inputMode="decimal"
                  value={totalBudget}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.');
                    setTotalBudget(value);
                  }}
                  placeholder="0.00"
                  className="pr-12"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {currency.symbol}
                </span>
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('projects.startDate')}</Label>
                <Popover open={startOpen} onOpenChange={setStartOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate ? format(startDate, 'd. MMM yyyy', { locale: hr }) : t('common.select')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={(d) => {
                        setStartDate(d);
                        if (d) setStartOpen(false);
                      }}
                      disabled={makeCalendarDisabled(getDateRange('budget'))}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>{t('projects.endDate')}</Label>
                <Popover open={endOpen} onOpenChange={setEndOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {endDate ? format(endDate, 'd. MMM yyyy', { locale: hr }) : t('common.select')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={endDate}
                      onSelect={(d) => {
                        setEndDate(d);
                        if (d) setEndOpen(false);
                      }}
                      disabled={(date) => {
                        const r = getDateRange('budget');
                        if (date < r.min || date > r.max) return true;
                        if (startDate && date < startDate) return true;
                        return false;
                      }}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Contingency reserve opt-in (only for new projects with a budget) */}
            {!isEdit && parseFloat(totalBudget) > 0 && (
              <label className="flex items-start gap-2 p-3 rounded-lg border bg-muted/40 cursor-pointer hover:bg-muted/60 transition-colors">
                <input
                  type="checkbox"
                  checked={addContingency}
                  onChange={(e) => setAddContingency(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
                />
                <div className="flex-1 text-xs">
                  <div className="font-medium flex items-center gap-1.5">
                    🛡️ {t('projects.contingency.add', 'Dodaj rezervu za nepredviđeno (10%)')}
                  </div>
                  <div className="text-muted-foreground mt-0.5">
                    {t('projects.contingency.help', 'Posebna faza koja čuva 10% budžeta za nepredviđene troškove. Preporučeno.')}
                  </div>
                </div>
              </label>
            )}

            {/* Preview */}
            <div className="p-3 rounded-lg border bg-muted/50">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
                  style={{ backgroundColor: `${color}20` }}
                >
                  {icon}
                </div>
                <div>
                  <p className="font-medium">{name || t('projects.preview')}</p>
                  <p className="text-xs text-muted-foreground">{description || t('projects.noDescription')}</p>
                </div>
              </div>
              {selectedTemplate && selectedTemplate.default_milestones?.length > 0 && (
                <p className="text-[10px] text-primary mt-2">
                  {t('projects.templates.willCreatePhases', 'Bit će automatski kreirano')}: {selectedTemplate.default_milestones.length} {t('projects.templates.phases', 'faza')}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => onOpenChange(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={saving || !name.trim()}
              >
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {project ? t('common.save') : t('common.create')}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};
