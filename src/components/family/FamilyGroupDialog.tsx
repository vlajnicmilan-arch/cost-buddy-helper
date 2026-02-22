import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FamilyGroup, DEFAULT_FAMILY_ICONS, DEFAULT_FAMILY_COLORS } from '@/types/family';
import { useTranslation } from 'react-i18next';

interface FamilyGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: FamilyGroup | null;
  onSave: (data: { name: string; icon: string; color: string }) => Promise<void>;
}

export const FamilyGroupDialog = ({ open, onOpenChange, group, onSave }: FamilyGroupDialogProps) => {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('👨‍👩‍👧‍👦');
  const [color, setColor] = useState('#3b82f6');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(group?.name || '');
      setIcon(group?.icon || '👨‍👩‍👧‍👦');
      setColor(group?.color || '#3b82f6');
    }
  }, [open, group]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({ name: name.trim(), icon, color });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{group ? t('family.editGroup') : t('family.newFamilyGroup')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>{t('family.name')}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('family.namePlaceholder')}
              className="mt-1"
            />
          </div>

          <div>
            <Label>{t('family.icon')}</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {DEFAULT_FAMILY_ICONS.map((i) => (
                <button
                  key={i}
                  onClick={() => setIcon(i)}
                  className={`w-10 h-10 rounded-lg text-xl flex items-center justify-center border-2 transition-colors ${
                    icon === i ? 'border-primary bg-primary/10' : 'border-transparent bg-muted/50'
                  }`}
                >
                  {i}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>{t('family.color')}</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {DEFAULT_FAMILY_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${
                    color === c ? 'border-foreground scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <Button onClick={handleSave} disabled={!name.trim() || saving} className="w-full">
            {saving ? t('family.saving') : group ? t('family.save') : t('family.createGroup')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
