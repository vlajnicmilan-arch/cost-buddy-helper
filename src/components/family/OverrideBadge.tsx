import { SplitSquareVertical } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { clickableProps } from '@/lib/a11y';

interface OverrideBadgeProps {
  onClick?: () => void;
  className?: string;
}

/**
 * Visual marker shown next to a transaction whenever it carries a custom
 * per-transaction split (split_overrides is set). Optionally clickable to
 * open the SplitOverrideDialog.
 */
export function OverrideBadge({ onClick, className }: OverrideBadgeProps) {
  const { t } = useTranslation();
  const label = t('family.split.override.badge');

  if (onClick) {
    return (
      <Badge
        variant="secondary"
        className={`gap-1 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring ${className ?? ''}`}
        {...clickableProps(onClick, { label })}
      >
        <SplitSquareVertical className="h-3 w-3" />
        {label}
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" className={`gap-1 ${className ?? ''}`} aria-label={label}>
      <SplitSquareVertical className="h-3 w-3" />
      {label}
    </Badge>
  );
}
