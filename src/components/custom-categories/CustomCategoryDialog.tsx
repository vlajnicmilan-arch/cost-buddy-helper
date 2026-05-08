import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CustomCategory, DEFAULT_CATEGORY_ICONS, DEFAULT_CATEGORY_COLORS, DEFAULT_CATEGORY_ICON_GROUPS } from '@/types/customCategory';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useTranslation } from 'react-i18next';

interface CustomCategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: CustomCategory | null;
  onSave: (category: { name: string; icon: string; color: string }) => Promise<void>;
}

export const CustomCategoryDialog = ({
  open,
  onOpenChange,
  category,
  onSave,
}: CustomCategoryDialogProps) => {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('📦');
  const [color, setColor] = useState('#6b7280');
  const [saving, setSaving] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    if (category) {
      setName(category.name);
      setIcon(category.icon);
      setColor(category.color);
    } else {
      setName('');
      setIcon('📦');
      setColor('#6b7280');
    }
  }, [category, open]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({ name: name.trim(), icon, color });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showBackButton={false} className="w-[calc(100vw-1rem)] sm:w-auto max-w-md">
        <DialogHeader>
          <DialogTitle>
            {category ? t('common.editCategory') : t('common.newCustomCategory')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Preview */}
          <div className="flex items-center justify-center p-4 bg-muted rounded-lg">
            <div
              className="flex items-center gap-2 px-4 py-2 rounded-full text-white font-medium"
              style={{ backgroundColor: color }}
            >
              <span className="text-xl">{icon}</span>
              <span>{name || t('common.categoryName')}</span>
            </div>
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">{t('common.categoryName')}</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('categories.pets')}
              maxLength={50}
            />
          </div>

          {/* Icon Selection */}
          <div className="space-y-2">
            <Label>{t('common.chooseIcon')}</Label>
            <ScrollArea className="h-48 border rounded-lg p-2">
              <div className="space-y-2">
                {DEFAULT_CATEGORY_ICON_GROUPS.map((group) => (
                  <div key={group.key} className="space-y-1">
                    <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80 px-0.5">
                      {t(`categoryIcons.groups.${group.key}`, group.fallback)}
                    </div>
                    <div className="grid grid-cols-8 gap-1">
                      {group.icons.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => setIcon(emoji)}
                          className={`p-2 text-xl rounded-md hover:bg-muted transition-colors ${
                            icon === emoji ? 'bg-primary/20 ring-2 ring-primary' : ''
                          }`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Color Selection */}
          <div className="space-y-2">
            <Label>{t('common.chooseColor')}</Label>
            <div className="grid grid-cols-10 gap-1">
              {DEFAULT_CATEGORY_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${
                    color === c ? 'ring-2 ring-offset-2 ring-primary scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Label htmlFor="customColor" className="text-sm text-muted-foreground">
                {t('common.orEnterHex')}:
              </Label>
              <Input
                id="customColor"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-12 h-8 p-0 border-0"
              />
              <Input
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-24 text-sm"
                placeholder="#000000"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || saving}>
            {saving ? t('common.saving') : category ? t('common.save') : t('common.add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
