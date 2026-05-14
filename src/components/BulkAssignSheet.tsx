import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { clickableProps } from '@/lib/a11y';

export interface BulkAssignOption {
  id: string;
  label: string;
  icon?: React.ReactNode;
  hint?: string;
}

interface BulkAssignSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  options: BulkAssignOption[];
  onSelect: (id: string | null) => Promise<void> | void;
  allowClear?: boolean;
  clearLabel?: string;
  emptyLabel?: string;
}

export const BulkAssignSheet = ({
  open,
  onOpenChange,
  title,
  options,
  onSelect,
  allowClear = false,
  clearLabel,
  emptyLabel,
}: BulkAssignSheetProps) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(o => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const handleSelect = async (id: string | null) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onSelect(id);
      onOpenChange(false);
      setQuery('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!submitting) { onOpenChange(o); if (!o) setQuery(''); } }}>
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col z-[70] p-0 gap-0">
        <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="px-4 pb-2 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('bulk.searchPlaceholder', 'Pretraži...')}
              className="pl-9 h-11"
              autoFocus={false}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {allowClear && (
            <button
              type="button"
              onClick={() => handleSelect(null)}
              disabled={submitting}
              className="w-full flex items-center gap-3 min-h-11 px-3 py-2 rounded-lg hover:bg-muted text-left text-sm font-medium text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
            >
              <X className="w-4 h-4" />
              {clearLabel ?? t('bulk.none', 'Bez dodjele')}
            </button>
          )}

          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {emptyLabel ?? t('bulk.noOptions', 'Nema opcija')}
            </div>
          ) : (
            filtered.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleSelect(opt.id)}
                disabled={submitting}
                className="w-full flex items-center gap-3 min-h-11 px-3 py-2 rounded-lg hover:bg-muted text-left focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                {...clickableProps()}
              >
                {opt.icon && <span className="shrink-0 flex items-center justify-center w-7 h-7">{opt.icon}</span>}
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium truncate">{opt.label}</span>
                  {opt.hint && <span className="block text-xs text-muted-foreground truncate">{opt.hint}</span>}
                </span>
              </button>
            ))
          )}
        </div>

        <div className="px-4 py-3 border-t shrink-0">
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {t('common.cancel', 'Odustani')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
