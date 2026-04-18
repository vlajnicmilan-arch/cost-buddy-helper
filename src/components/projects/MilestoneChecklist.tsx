import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Trash2, Sparkles, Loader2 } from 'lucide-react';
import { useMilestoneChecklist, suggestChecklistTemplate } from '@/hooks/useMilestoneChecklist';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface MilestoneChecklistProps {
  milestoneId: string;
  milestoneName: string;
  canEdit: boolean;
}

export const MilestoneChecklist = ({ milestoneId, milestoneName, canEdit }: MilestoneChecklistProps) => {
  const { t } = useTranslation();
  const { items, loading, addItem, addItemsBulk, toggleItem, deleteItem } = useMilestoneChecklist(milestoneId);
  const [newTitle, setNewTitle] = useState('');
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    if (!newTitle.trim()) return;
    setAdding(true);
    await addItem(newTitle);
    setNewTitle('');
    setAdding(false);
  };

  const handleSuggest = async () => {
    const tpl = suggestChecklistTemplate(milestoneName);
    if (tpl.length > 0) {
      await addItemsBulk(tpl);
    }
  };

  const completedCount = items.filter(i => i.is_done).length;
  const progress = items.length > 0 ? (completedCount / items.length) * 100 : 0;

  if (loading) {
    return <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-2 mt-2">
      {items.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
          <span>{t('projects.checklist.progress', 'Napredak')}: {completedCount}/{items.length}</span>
          <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {items.length === 0 && canEdit && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleSuggest}
          className="w-full gap-2"
        >
          <Sparkles className="w-3.5 h-3.5" />
          {t('projects.checklist.useTemplate', 'Koristi predložak za "{{name}}"', { name: milestoneName })}
        </Button>
      )}

      <div className="space-y-1">
        {items.map(it => (
          <div
            key={it.id}
            className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 group"
          >
            <Checkbox
              checked={it.is_done}
              onCheckedChange={(v) => toggleItem(it.id, !!v)}
              disabled={!canEdit}
            />
            <span className={cn('flex-1 text-sm', it.is_done && 'line-through text-muted-foreground')}>
              {it.title}
            </span>
            {canEdit && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100"
                onClick={() => deleteItem(it.id)}
              >
                <Trash2 className="w-3 h-3 text-destructive" />
              </Button>
            )}
          </div>
        ))}
      </div>

      {canEdit && (
        <div className="flex gap-2">
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
            placeholder={t('projects.checklist.placeholder', 'Dodaj korak...')}
            className="h-8 text-sm"
          />
          <Button size="sm" className="h-8" onClick={handleAdd} disabled={!newTitle.trim() || adding}>
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
};
