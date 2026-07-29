import React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BusinessDashboardSectionProps {
  /** Uppercase label rendered above the section content. */
  label: string;
  /** Optional trailing action (text link on the right of the label row). */
  actionLabel?: string;
  onAction?: () => void;
  /** Optional leading icon next to the label. */
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/**
 * Monarch-style section primitive for the business dashboard.
 *
 * No card frame, no background — just an uppercase micro-label, an optional
 * action and a bottom hairline. Section spacing is handled here so all
 * dashboard blocks share the same vertical rhythm.
 */
export const BusinessDashboardSection = React.memo(({
  label,
  actionLabel,
  onAction,
  icon,
  className,
  children,
}: BusinessDashboardSectionProps) => (
  <section className={cn('mb-6 sm:mb-8 pb-5 border-b border-border/40', className)}>
    <div className="flex items-center justify-between gap-2 mb-3 px-0.5">
      <h2 className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
        {icon}
        {label}
      </h2>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="text-[11px] text-primary hover:underline flex items-center gap-0.5 min-h-[32px]"
        >
          {actionLabel}
          <ChevronRight className="w-3 h-3" />
        </button>
      )}
    </div>
    {children}
  </section>
));

BusinessDashboardSection.displayName = 'BusinessDashboardSection';
