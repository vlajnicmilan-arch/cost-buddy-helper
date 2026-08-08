/**
 * CollapsibleSection — zajednički obrazac za arhivske sekcije.
 *
 * Pravilo ekrana: što traži akciju — otvoreno; što je arhiva — zatvoreno.
 * Stanje je sesijsko (u memoriji komponente ili roditelja), NIKAD se ne
 * perzistira — svako otvaranje ekrana kreće od `defaultOpen`.
 *
 * Podržava i nekontrolirani (interni state) i kontrolirani način rada
 * (`open` + `onOpenChange`) — kontrolirani se koristi kad deep-link iz
 * obavijesti mora automatski otvoriti zatvorenu sekciju.
 *
 * Chevron animacija je diskretna i poštuje `prefers-reduced-motion`.
 */
import { ReactNode, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { LucideIcon } from 'lucide-react';

interface Props {
  title: string;
  /** Ukupan broj stavki (ne samo učitanih). Skriveno kad je 0/undefined. */
  count?: number;
  icon?: LucideIcon;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
  /** Stabilan identifikator za testove i deep-link. */
  testId?: string;
}

export function CollapsibleSection({
  title,
  count,
  icon: Icon,
  defaultOpen = false,
  open,
  onOpenChange,
  children,
  testId,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? !!open : internalOpen;

  const toggle = () => {
    const next = !isOpen;
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  return (
    <section className="space-y-2" data-testid={testId}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isOpen}
        data-testid={testId ? `${testId}-toggle` : undefined}
        className="w-full min-h-[44px] flex items-center justify-between gap-2 text-sm font-medium text-module-muted"
      >
        <span className="flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4" />}
          {title}
          {typeof count === 'number' && count > 0 && (
            <span className="text-xs text-muted-foreground">({count})</span>
          )}
        </span>
        <ChevronDown
          className={
            'w-4 h-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none ' +
            (isOpen ? 'rotate-180' : '')
          }
        />
      </button>
      {isOpen && children}
    </section>
  );
}

export default CollapsibleSection;
