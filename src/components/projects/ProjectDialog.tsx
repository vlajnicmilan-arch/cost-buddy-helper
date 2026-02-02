import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Project, ProjectStatus, DEFAULT_PROJECT_COLORS, DEFAULT_PROJECT_ICONS, PROJECT_STATUS_LABELS } from '@/types/project';
import { useTranslation } from 'react-i18next';
import { useCurrency } from '@/contexts/CurrencyContext';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface ProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: Project | null;
  onSave: (project: Omit<Project, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => Promise<void>;
  onUpdate?: (project: Project) => Promise<void>;
}

export const ProjectDialog = ({
  open,
  onOpenChange,
  project,
  onSave,
  onUpdate
}: ProjectDialogProps) => {
  const { t } = useTranslation();
  const { currency } = useCurrency();
  const [saving, setSaving] = useState(false);
  
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('📁');
  const [color, setColor] = useState('#3b82f6');
  const [status, setStatus] = useState<ProjectStatus>('draft');
  const [totalBudget, setTotalBudget] = useState('');
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();

  useEffect(() => {
    if (open && project) {
      setName(project.name);
      setDescription(project.description || '');
      setIcon(project.icon || '📁');
      setColor(project.color || '#3b82f6');
      setStatus(project.status);
      setTotalBudget(project.total_budget?.toString() || '');
      setStartDate(project.start_date ? new Date(project.start_date) : undefined);
      setEndDate(project.end_date ? new Date(project.end_date) : undefined);
    } else if (open) {
      setName('');
      setDescription('');
      setIcon('📁');
      setColor('#3b82f6');
      setStatus('draft');
      setTotalBudget('');
      setStartDate(undefined);
      setEndDate(undefined);
    }
  }, [open, project]);

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
        end_date: endDate ? format(endDate, 'yyyy-MM-dd') : null
      };

      if (project && onUpdate) {
        await onUpdate({ ...project, ...projectData });
      } else {
        await onSave(projectData);
      }
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showBackButton={false} className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {project ? t('projects.edit') : t('projects.add')}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
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
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('projects.descriptionPlaceholder')}
              rows={2}
            />
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
              <Popover>
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
                    onSelect={setStartDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>{t('projects.endDate')}</Label>
              <Popover>
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
                    onSelect={setEndDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

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
      </DialogContent>
    </Dialog>
  );
};
