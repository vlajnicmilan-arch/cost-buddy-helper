import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { parseLocaleAmount } from '@/lib/money';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Project,
  ProjectStatus,
  DEFAULT_PROJECT_COLORS,
  DEFAULT_PROJECT_ICONS,
  PROJECT_STATUS_LABELS,
} from '@/types/project';
import { ProjectType, getPreset, isValidProjectType } from '@/lib/projectTypes';
import { useTranslation } from 'react-i18next';
import { useCurrency } from '@/contexts/CurrencyContext';
import { CalendarIcon, Loader2, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { cn } from '@/lib/utils';

import { ProjectTemplate, useProjectTemplates } from '@/hooks/useProjectTemplates';
import { ProjectTypePickerStep } from './ProjectTypePickerStep';
import { VoiceInputButton } from '@/components/VoiceInputButton';
import { getDateRange, makeCalendarDisabled } from '@/lib/dateValidation';
import { useProjectAccessLevel, isReadOnlyAccess } from '@/hooks/useProjectAccessLevel';
import { LocalStorage } from '@/hooks/useLocalStorage';
import { useProjectContractAmendments } from '@/hooks/useProjectContractAmendments';
import { Lock } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';


const ADVANCED_OPEN_KEY = 'projectDialog_advancedOpen';

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
  isReadOnly?: boolean;
}

export const ProjectDialog = ({
  open,
  onOpenChange,
  project,
  preset,
  onSave,
  onUpdate,
  isReadOnly: isReadOnlyProp,
}: ProjectDialogProps) => {
  const { t } = useTranslation();
  const { currency } = useCurrency();
  const [saving, setSaving] = useState(false);
  const derivedAccessLevel = useProjectAccessLevel(
    project ? { user_id: (project as any).user_id, isParticipant: !(project as any).isOwner } : null
  );
  const isReadOnly = isReadOnlyProp ?? (project ? isReadOnlyAccess(derivedAccessLevel) : false);

  const [projectType, setProjectType] = useState<ProjectType>('general');
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState<string>('');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('📁');
  const [color, setColor] = useState('#3b82f6');
  const [status, setStatus] = useState<ProjectStatus>('draft');
  const [totalBudget, setTotalBudget] = useState('');
  const [contractValue, setContractValue] = useState('');
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [selectedTemplate, setSelectedTemplate] = useState<ProjectTemplate | null>(null);
  const [addContingency, setAddContingency] = useState(true);
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);

  const isEdit = !!project;
  const { templates } = useProjectTemplates();
  // WS1/1.3 — baseline contract_value is locked when the project has any
  // amendments. UI mirrors the DB guard trigger so the user gets a friendly
  // tooltip instead of a raw 42501.
  const { hasAmendments } = useProjectContractAmendments(isEdit && project ? project.id : null);
  const contractValueLocked = isEdit && hasAmendments;


  const activePreset = useMemo(() => getPreset(projectType), [projectType]);

  // Restore last advanced-open preference (persisted across sessions / devices).
  useEffect(() => {
    if (!open) return;
    LocalStorage.get(ADVANCED_OPEN_KEY).then((v) => {
      // In edit mode we always expand so the user can see all fields.
      if (isEdit) setAdvancedOpen('advanced');
      else setAdvancedOpen(v === '1' ? 'advanced' : '');
    });
  }, [open, isEdit]);

  useEffect(() => {
    if (open && project) {
      const existingType =
        project.project_type && isValidProjectType(String(project.project_type))
          ? (project.project_type as ProjectType)
          : 'general';
      setProjectType(existingType);
      setName(project.name);
      setDescription(project.description || '');
      setIcon(project.icon || '📁');
      setColor(project.color || '#3b82f6');
      setStatus(project.status);
      setTotalBudget(project.total_budget?.toString() || '');
      setContractValue(project.contract_value != null ? String(project.contract_value) : '');
      setStartDate(project.start_date ? new Date(project.start_date) : undefined);
      setEndDate(project.end_date ? new Date(project.end_date) : undefined);
      setSelectedTemplate(null);
    } else if (open) {
      // CREATE — Lite default: type = general, name empty, no template auto-apply.
      setProjectType('general');
      const gen = getPreset('general');
      setName(preset?.name ?? '');
      setDescription(preset?.description ?? '');
      setIcon(preset?.icon ?? gen.icon);
      setColor(preset?.color ?? gen.color);
      setStatus('draft');
      setTotalBudget(preset?.totalBudget !== undefined ? String(preset.totalBudget) : '');
      setContractValue('');
      setStartDate(undefined);
      setEndDate(undefined);
      setSelectedTemplate(null);
    }
  }, [open, project, preset]);

  // Persist advanced-open changes (create flow only)
  const handleAdvancedChange = (v: string) => {
    setAdvancedOpen(v);
    if (!isEdit) {
      LocalStorage.set(ADVANCED_OPEN_KEY, v === 'advanced' ? '1' : '0').catch(() => {});
    }
  };

  // User picked type from the bottom-sheet picker.
  const handleTypeSelected = (id: ProjectType) => {
    const p = getPreset(id);
    setProjectType(id);
    if (!preset?.icon) setIcon(p.icon);
    if (!preset?.color) setColor(p.color);

    if (p.templateCategory && templates.length > 0) {
      const match = templates.find((tpl) => tpl.category === p.templateCategory) ?? null;
      setSelectedTemplate(match);
      if (match) {
        if (!name.trim() && match.name) setName(match.name);
        if (!description.trim() && match.description) setDescription(match.description);
      }
    } else {
      setSelectedTemplate(null);
    }
    setTypePickerOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (isEdit && isReadOnly) {
      const { showError } = await import('@/hooks/useStatusFeedback');
      showError(t('projects.access.readOnlyBlockedToast'));
      return;
    }

    setSaving(true);
    try {
      const parsedContract = parseLocaleAmount(contractValue).value;
      const projectData = {
        name: name.trim(),
        description: description.trim() || null,
        icon,
        color,
        status,
        total_budget: parseLocaleAmount(totalBudget).value || 0,
        contract_value:
          Number.isFinite(parsedContract) && parsedContract > 0 ? parsedContract : null,
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
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent showBackButton={false} className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{project ? t('projects.edit') : t('projects.add')}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Type chip (compact). Edit: locked. Create: tap to change. */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">
                {t('projects.typeLabel', 'Vrsta')}
              </span>
              {isEdit ? (
                <Badge variant="secondary" className="gap-1 font-normal h-7 px-2">
                  <span aria-hidden>{activePreset.icon}</span>
                  <span className="text-xs">{typeName}</span>
                </Badge>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-7 px-2 gap-1"
                  onClick={() => setTypePickerOpen(true)}
                >
                  <span aria-hidden>{activePreset.icon}</span>
                  <span className="text-xs">{typeName}</span>
                  <ChevronRight className="w-3 h-3 ml-0.5 opacity-70" />
                </Button>
              )}
            </div>

            {/* Name (required) */}
            <div className="space-y-2">
              <Label htmlFor="name">{t('projects.name')}</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('projects.namePlaceholder')}
                required
                autoFocus
              />
            </div>

            {/* ADVANCED OPTIONS — accordion (collapsed by default in create) */}
            <Accordion type="single" collapsible value={advancedOpen} onValueChange={handleAdvancedChange}>
              <AccordionItem value="advanced" className="border-0">
                <AccordionTrigger className="py-2 text-sm font-medium hover:no-underline">
                  {t('projects.advancedOptions', 'Napredne opcije')}
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pt-2">
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
                              'p-2 rounded-lg text-xl hover:bg-muted transition-colors',
                              icon === i && 'bg-primary/20 ring-2 ring-primary'
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
                              'w-8 h-8 rounded-full transition-all',
                              color === c && 'ring-2 ring-offset-2 ring-primary'
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
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Budget */}
                  <div className="space-y-2">
                    <Label htmlFor="budget">{t('projects.budget')}</Label>
                    <div className="relative">
                      <MoneyInput
                        id="budget"
                        value={totalBudget}
                        onChange={(e) => setTotalBudget(e.target.value)}
                        placeholder="0,00"
                        className="pr-12"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        {currency.symbol}
                      </span>
                    </div>
                  </div>

                  {/* Contract value */}
                  <div className="space-y-2">
                    <Label htmlFor="contractValue" className="flex items-center gap-1.5">
                      {t('projects.contractValue', 'Ugovorena vrijednost')}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        ({t('common.optional', 'opcionalno')})
                      </span>
                      {contractValueLocked && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Lock className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-[260px] z-[70]">
                              <p className="text-xs">
                                {t(
                                  'projects.contractValueLockedTooltip',
                                  'Baseline je zaključan jer postoje aneksi ugovora. Umjesto izmjene ove vrijednosti, dodaj novi aneks.',
                                )}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </Label>
                    <div className="relative">
                      <Input
                        id="contractValue"
                        type="text"
                        inputMode="decimal"
                        value={contractValue}
                        onChange={(e) => {
                          const value = e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.');
                          setContractValue(value);
                        }}
                        placeholder="0.00"
                        className="pr-12"
                        disabled={contractValueLocked}
                        aria-describedby={contractValueLocked ? 'contractValueLockedHint' : undefined}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        {currency.symbol}
                      </span>
                    </div>
                    <p
                      id={contractValueLocked ? 'contractValueLockedHint' : undefined}
                      className="text-xs text-muted-foreground"
                    >
                      {contractValueLocked
                        ? t(
                            'projects.contractValueLockedHint',
                            'Baseline zaključan — postoje aneksi ugovora. Dodaj novi aneks za izmjenu.',
                          )
                        : t(
                            'projects.contractValueHint',
                            'Iznos koji naplaćuješ kupcu. Ako prazno, koristi se ukupan budžet kao očekivani prihod.',
                          )}

                    </p>
                  </div>

                  {/* Dates */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t('projects.startDate')}</Label>
                      <Popover open={startOpen} onOpenChange={setStartOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full justify-start text-left font-normal">
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {startDate
                              ? format(startDate, 'd. MMM yyyy', { locale: hr })
                              : t('common.select')}
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
                            {endDate
                              ? format(endDate, 'd. MMM yyyy', { locale: hr })
                              : t('common.select')}
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

                  {/* Contingency reserve (only when creating with a budget) */}
                  {!isEdit && parseLocaleAmount(totalBudget).value > 0 && (
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
                          {t(
                            'projects.contingency.help',
                            'Posebna faza koja čuva 10% budžeta za nepredviđene troškove. Preporučeno.'
                          )}
                        </div>
                      </div>
                    </label>
                  )}

                  {/* Template preview (only on create when preset matched) */}
                  {!isEdit && selectedTemplate?.default_milestones?.length ? (
                    <p className="text-[10px] text-primary">
                      {t('projects.templates.willCreatePhases', 'Bit će automatski kreirano')}:{' '}
                      {selectedTemplate.default_milestones.length}{' '}
                      {t('projects.templates.phases', 'faza')}
                    </p>
                  ) : null}
                </AccordionContent>
              </AccordionItem>
            </Accordion>

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
                  <p className="text-xs text-muted-foreground">
                    {description || t('projects.noDescription')}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => onOpenChange(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" className="flex-1" disabled={saving || !name.trim()}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {project ? t('common.save') : t('common.create')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Type picker as bottom sheet — opens from chip in create mode */}
      <Sheet open={typePickerOpen} onOpenChange={setTypePickerOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto">
          <SheetHeader className="text-left">
            <SheetTitle>{t('projectTypes.step.title', 'Odaberi vrstu projekta')}</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <ProjectTypePickerStep selectedId={projectType} onSelect={handleTypeSelected} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};
