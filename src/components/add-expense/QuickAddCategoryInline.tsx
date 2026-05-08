import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, X } from 'lucide-react';
import {
  DEFAULT_CATEGORY_ICONS,
  DEFAULT_CATEGORY_COLORS,
  DEFAULT_CATEGORY_ICON_GROUPS,
} from '@/types/customCategory';
import {
  DEFAULT_INCOME_CATEGORY_ICONS,
  DEFAULT_INCOME_CATEGORY_COLORS,
} from '@/types/customIncomeCategory';

export interface QuickAddCategoryInlineProps {
  mode: 'expense' | 'income';
  /** All known category display names (custom + standard, already translated) used for duplicate detection. */
  existingNames: string[];
  /** Called when user confirms. Returns the newly created id (or null on failure). */
  onCreate: (data: { name: string; icon: string; color: string }) => Promise<string | null>;
  onCancel: () => void;
}

export const QuickAddCategoryInline = ({
  mode,
  existingNames,
  onCreate,
  onCancel,
}: QuickAddCategoryInlineProps) => {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  const ICONS = mode === 'income' ? DEFAULT_INCOME_CATEGORY_ICONS : DEFAULT_CATEGORY_ICONS;
  const COLORS = mode === 'income' ? DEFAULT_INCOME_CATEGORY_COLORS : DEFAULT_CATEGORY_COLORS;
  const QUICK_ICONS = ICONS.slice(0, 12);
  const QUICK_COLORS = COLORS.slice(0, 8);

  const [name, setName] = useState('');
  const [icon, setIcon] = useState(QUICK_ICONS[0]);
  const [color, setColor] = useState(QUICK_COLORS[0]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(id);
  }, []);

  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();
  const duplicateMatch = lower
    ? existingNames.find((n) => n === lower || (lower.length >= 3 && (n.includes(lower) || lower.includes(n))))
    : undefined;

  const handleSave = async () => {
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      const id = await onCreate({ name: trimmed, icon, color });
      if (id) {
        // Parent will close the panel via onCreated -> reset
        setName('');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="space-y-3 p-3 rounded-xl bg-muted/40 border border-border/60 mt-2"
      role="region"
      aria-label={t('categories.quickAdd.title', 'Brzo dodaj kategoriju')}
    >
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">
          {mode === 'income'
            ? t('categories.quickAdd.titleIncome', 'Nova kategorija prihoda')
            : t('categories.quickAdd.titleExpense', 'Nova kategorija troška')}
        </Label>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onCancel}
          aria-label={t('common.close', 'Zatvori')}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      <Input
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t('categories.quickAdd.namePlaceholder', 'Naziv kategorije')}
        className="h-10 rounded-lg"
        maxLength={40}
      />

      {duplicateMatch && (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-snug">
            {t('categories.quickAdd.duplicateWarning', 'Slična kategorija već postoji: "{{name}}". Svejedno dodaj?', { name: duplicateMatch })}
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-[11px] text-muted-foreground">{t('categories.quickAdd.icon', 'Ikona')}</Label>
        {mode === 'expense' ? (
          <div className="max-h-64 overflow-y-auto pr-1 space-y-2">
            {DEFAULT_CATEGORY_ICON_GROUPS.map((group) => (
              <div key={group.key} className="space-y-1">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80 px-0.5">
                  {t(`categoryIcons.groups.${group.key}`, group.fallback)}
                </div>
                <div className="grid grid-cols-6 gap-1.5">
                  {group.icons.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setIcon(emoji)}
                      className={cn(
                        'h-9 rounded-lg flex items-center justify-center text-lg transition-all',
                        icon === emoji
                          ? 'bg-primary/15 ring-2 ring-primary'
                          : 'bg-background hover:bg-muted'
                      )}
                      aria-label={emoji}
                      aria-pressed={icon === emoji}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-6 gap-1.5">
            {QUICK_ICONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => setIcon(emoji)}
                className={cn(
                  'h-9 rounded-lg flex items-center justify-center text-lg transition-all',
                  icon === emoji
                    ? 'bg-primary/15 ring-2 ring-primary'
                    : 'bg-background hover:bg-muted'
                )}
                aria-label={emoji}
                aria-pressed={icon === emoji}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="text-[11px] text-muted-foreground">{t('categories.quickAdd.color', 'Boja')}</Label>
        <div className="grid grid-cols-8 gap-1.5">
          {QUICK_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={cn(
                'h-8 rounded-lg transition-all',
                color === c ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''
              )}
              style={{ backgroundColor: c }}
              aria-label={c}
              aria-pressed={color === c}
            />
          ))}
        </div>
      </div>

      {/* Preview */}
      <div
        className="flex items-center gap-2 p-2 rounded-lg"
        style={{ backgroundColor: color + '15' }}
      >
        <span
          className="w-7 h-7 rounded-md flex items-center justify-center text-base"
          style={{ backgroundColor: color + '30' }}
        >
          {icon}
        </span>
        <span className="text-sm font-medium" style={{ color }}>
          {trimmed || t('categories.quickAdd.namePlaceholder', 'Naziv kategorije')}
        </span>
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1 h-10"
          onClick={onCancel}
          disabled={saving}
        >
          {t('common.cancel', 'Odustani')}
        </Button>
        <Button
          type="button"
          className="flex-1 h-10"
          onClick={handleSave}
          disabled={!trimmed || saving}
        >
          {saving
            ? t('common.saving', 'Spremam...')
            : t('categories.quickAdd.save', 'Spremi i odaberi')}
        </Button>
      </div>
    </div>
  );
};
