import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useCurrency } from '@/contexts/CurrencyContext';
import { RecurringMatch } from '@/hooks/useRecurringMatcher';
import { RefreshCw, CheckCircle2, Sparkles, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matches: RecurringMatch[];
  onConfirm: (selectedRecurringIds: string[]) => Promise<void>;
}

export const RecurringMatchDialog = ({ open, onOpenChange, matches, onConfirm }: Props) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const [selected, setSelected] = useState<Set<string>>(
    new Set(matches.filter(m => m.confidence === 'high').map(m => m.recurring.id))
  );
  const [saving, setSaving] = useState(false);

  const toggleSelection = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = async () => {
    if (selected.size === 0) {
      onOpenChange(false);
      return;
    }
    setSaving(true);
    try {
      await onConfirm(Array.from(selected));
      onOpenChange(false);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  if (matches.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <RefreshCw className="w-4 h-4 text-primary" />
            {t('recurring.matchFound', 'Plaćene obveze')}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {t('recurring.matchDescription', 'Pronašli smo transakcije koje odgovaraju ponavljajućim obvezama. Označite koje želite pomaknuti na sljedeći rok.')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 mt-2">
          {matches.map((match) => {
            const isSelected = selected.has(match.recurring.id);
            return (
              <div
                key={match.recurring.id}
                role="checkbox"
                tabIndex={0}
                aria-checked={isSelected}
                aria-label={match.recurring.description}
                className={cn(
                  "p-3 rounded-xl border cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  isSelected ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
                )}
                onClick={() => toggleSelection(match.recurring.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleSelection(match.recurring.id);
                  }
                }}
              >
                <div className="flex items-start gap-2.5">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleSelection(match.recurring.id)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-sm font-medium truncate">{match.recurring.description}</span>
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 flex-shrink-0">
                        {match.confidence === 'high' ? (
                          <><CheckCircle2 className="w-2.5 h-2.5 mr-0.5 text-green-500" />Točan</>
                        ) : (
                          <><Search className="w-2.5 h-2.5 mr-0.5 text-amber-500" />Moguć</>
                        )}
                      </Badge>
                      {match.source === 'ai' && (
                        <Sparkles className="w-3 h-3 text-primary/60 flex-shrink-0" />
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      <div>
                        <span className="opacity-60">Obveza:</span>{' '}
                        <span className="font-medium">{formatAmount(match.recurring.amount)}</span>
                        <span className="mx-1">·</span>
                        <span>{match.recurring.frequency === 'monthly' ? 'mjesečno' : match.recurring.frequency === 'weekly' ? 'tjedno' : match.recurring.frequency}</span>
                      </div>
                      <div>
                        <span className="opacity-60">Transakcija:</span>{' '}
                        <span className="font-medium">{match.transaction.description}</span>
                        <span className="mx-1">·</span>
                        <span>{formatAmount(match.transaction.amount)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-2 mt-3">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('common.skip', 'Preskoči')}
          </Button>
          <Button className="flex-1" onClick={handleConfirm} disabled={saving}>
            {saving ? '...' : t('recurring.markPaid', `Označi plaćeno (${selected.size})`)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
