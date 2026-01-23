import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { IncomeSource, DEFAULT_INCOME_SOURCE_COLORS, DEFAULT_INCOME_SOURCE_ICONS } from '@/types/incomeSource';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface IncomeSourceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source?: IncomeSource | null;
  onSave: (source: Omit<IncomeSource, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => Promise<void>;
  onUpdate?: (source: IncomeSource) => Promise<void>;
}

export const IncomeSourceDialog = ({
  open,
  onOpenChange,
  source,
  onSave,
  onUpdate
}: IncomeSourceDialogProps) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('💼');
  const [color, setColor] = useState('#22c55e');
  const [saving, setSaving] = useState(false);
  const { t } = useTranslation();

  const isEditing = !!source;

  useEffect(() => {
    if (source) {
      setName(source.name);
      setDescription(source.description || '');
      setIcon(source.icon || '💼');
      setColor(source.color || '#22c55e');
    } else {
      setName('');
      setDescription('');
      setIcon('💼');
      setColor('#22c55e');
    }
  }, [source, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    try {
      if (isEditing && source && onUpdate) {
        await onUpdate({
          ...source,
          name: name.trim(),
          description: description.trim() || null,
          icon,
          color
        });
      } else {
        await onSave({
          name: name.trim(),
          description: description.trim() || null,
          icon,
          color
        });
      }
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? t('common.edit') : t('common.add')} {t('incomeSources.title').toLowerCase()}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="source-name">{t('common.name')} *</Label>
            <Input
              id="source-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 rounded-xl"
              required
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="source-description">{t('common.description')}</Label>
            <Textarea
              id="source-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="rounded-xl resize-none"
              rows={2}
            />
          </div>

          {/* Icon Selection */}
          <div className="space-y-2">
            <Label>{t('common.icon')}</Label>
            <div className="grid grid-cols-6 gap-2">
              {DEFAULT_INCOME_SOURCE_ICONS.map((ico) => (
                <button
                  key={ico}
                  type="button"
                  onClick={() => setIcon(ico)}
                  className={cn(
                    "h-10 rounded-lg text-xl transition-all",
                    icon === ico 
                      ? "bg-primary/20 ring-2 ring-primary" 
                      : "bg-muted/50 hover:bg-muted"
                  )}
                >
                  {ico}
                </button>
              ))}
            </div>
          </div>

          {/* Color Selection */}
          <div className="space-y-2">
            <Label>{t('common.color')}</Label>
            <div className="grid grid-cols-8 gap-2">
              {DEFAULT_INCOME_SOURCE_COLORS.map((col) => (
                <button
                  key={col}
                  type="button"
                  onClick={() => setColor(col)}
                  className={cn(
                    "h-8 rounded-lg transition-all",
                    color === col && "ring-2 ring-offset-2 ring-foreground"
                  )}
                  style={{ backgroundColor: col }}
                />
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="space-y-2">
            <Label>{t('common.preview')}</Label>
            <div 
              className="p-3 rounded-xl border flex items-center gap-3"
              style={{ borderLeftColor: color, borderLeftWidth: 4 }}
            >
              <div 
                className="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
                style={{ backgroundColor: `${color}20` }}
              >
                {icon}
              </div>
              <div>
                <p className="font-medium">{name || t('common.name')}</p>
                {description && (
                  <p className="text-sm text-muted-foreground">{description}</p>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1 rounded-xl"
              onClick={() => onOpenChange(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              className="flex-1 rounded-xl"
              disabled={saving || !name.trim()}
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {isEditing ? t('common.save') : t('common.add')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
