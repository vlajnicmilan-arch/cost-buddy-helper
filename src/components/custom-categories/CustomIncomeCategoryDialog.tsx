import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CustomIncomeCategory, DEFAULT_INCOME_CATEGORY_ICONS, DEFAULT_INCOME_CATEGORY_COLORS } from '@/types/customIncomeCategory';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface CustomIncomeCategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: CustomIncomeCategory | null;
  onSave: (category: Omit<CustomIncomeCategory, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => Promise<CustomIncomeCategory | null>;
  onUpdate?: (id: string, updates: Partial<Omit<CustomIncomeCategory, 'id' | 'user_id' | 'created_at'>>) => Promise<void>;
}

export const CustomIncomeCategoryDialog = ({
  open,
  onOpenChange,
  category,
  onSave,
  onUpdate
}: CustomIncomeCategoryDialogProps) => {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('💰');
  const [color, setColor] = useState('#22c55e');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && category) {
      setName(category.name);
      setIcon(category.icon);
      setColor(category.color);
    } else if (open) {
      setName('');
      setIcon('💰');
      setColor('#22c55e');
    }
  }, [open, category]);

  const handleSave = async () => {
    if (!name.trim()) return;
    
    setSaving(true);
    try {
      if (category && onUpdate) {
        await onUpdate(category.id, { name, icon, color });
      } else {
        await onSave({ name, icon, color });
      }
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showBackButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {category ? t('incomeCategories.editCategory', 'Uredi kategoriju prihoda') : t('incomeCategories.newCategory', 'Nova kategorija prihoda')}
          </DialogTitle>
          <DialogDescription>
            {t('incomeCategories.dialogDescription', 'Definirajte naziv, ikonu i boju kategorije prihoda.')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Name */}
          <div className="space-y-2">
            <Label>{t('common.categoryName')}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('incomeCategories.namePlaceholder', 'Npr. Dividende, Najam...')}
            />
          </div>

          {/* Icon Selection */}
          <div className="space-y-2">
            <Label>{t('common.chooseIcon')}</Label>
            <div className="grid grid-cols-8 gap-2">
              {DEFAULT_INCOME_CATEGORY_ICONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setIcon(emoji)}
                  className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center text-xl transition-all",
                    icon === emoji 
                      ? "bg-primary text-primary-foreground ring-2 ring-primary" 
                      : "bg-muted hover:bg-muted/80"
                  )}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Color Selection */}
          <div className="space-y-2">
            <Label>{t('common.chooseColor')}</Label>
            <div className="grid grid-cols-8 gap-2">
              {DEFAULT_INCOME_CATEGORY_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    "w-10 h-10 rounded-lg transition-all",
                    color === c ? "ring-2 ring-primary ring-offset-2" : ""
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <div className="flex gap-2 items-center mt-2">
              <span className="text-sm text-muted-foreground">{t('common.orEnterHex')}</span>
              <Input
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-28"
                placeholder="#22c55e"
              />
            </div>
          </div>

          {/* Preview */}
          <div className="space-y-2">
            <Label>{t('common.preview')}</Label>
            <div 
              className="flex items-center gap-3 p-3 rounded-xl"
              style={{ backgroundColor: color + '15' }}
            >
              <span 
                className="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
                style={{ backgroundColor: color + '30', color: color }}
              >
                {icon}
              </span>
              <span className="font-medium" style={{ color: color }}>
                {name || t('incomeCategories.namePlaceholder', 'Npr. Dividende, Najam...')}
              </span>
            </div>
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || saving}>
            {saving ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
