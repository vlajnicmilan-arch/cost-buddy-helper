import { useTranslation } from 'react-i18next';
import { SmilePlus } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useFamilyReactions } from '@/hooks/useFamilyReactions';
import { clickableProps } from '@/lib/a11y';
import { cn } from '@/lib/utils';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '🙏', '🔥', '💸'];

interface Props {
  groupId: string;
  expenseId: string;
}

export function FamilyReactionsBar({ groupId, expenseId }: Props) {
  const { t } = useTranslation();
  const { grouped, toggle } = useFamilyReactions({ groupId, expenseId });

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {grouped.map((g) => (
        <button
          key={g.emoji}
          type="button"
          onClick={() => toggle(g.emoji)}
          className={cn(
            'inline-flex items-center gap-1 h-7 px-2 rounded-full border text-xs',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            g.mine
              ? 'bg-primary/15 border-primary/40 text-primary'
              : 'bg-muted/40 border-border/60 text-foreground hover:bg-muted/60',
          )}
        >
          <span className="text-sm leading-none">{g.emoji}</span>
          <span className="font-mono">{g.count}</span>
        </button>
      ))}

      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={t('family.reactions.add', 'Dodaj reakciju')}
            className="inline-flex items-center justify-center h-7 w-7 rounded-full border border-dashed border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <SmilePlus className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-2">
          <div className="flex gap-1">
            {QUICK_EMOJIS.map((e) => (
              <div
                key={e}
                {...clickableProps(() => toggle(e))}
                className="h-8 w-8 flex items-center justify-center text-lg rounded-md hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={e}
              >
                {e}
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
