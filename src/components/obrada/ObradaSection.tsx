import { ReactNode, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface ObradaSectionProps {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  testId?: string;
}

/** Sklopiva sekcija Mjesečnog pogleda (min 44px dodirna meta). */
export const ObradaSection = ({
  title,
  subtitle,
  defaultOpen = false,
  children,
  testId,
}: ObradaSectionProps) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <section className="rounded-xl border border-border bg-card" data-testid={testId}>
        <CollapsibleTrigger className="flex min-h-[44px] w-full items-center justify-between gap-2 px-4 py-3 text-left">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-foreground">{title}</h2>
            {subtitle ? (
              <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-border px-4 py-3">{children}</div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
};
