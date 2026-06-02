import { Lock, Crown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ProjectReadOnlyBannerProps {
  /** Reason context for analytics/copy, ignored visually for now. */
  reason?: 'owner_downgrade' | 'participant';
  onUpgradeClick?: () => void;
  className?: string;
  compact?: boolean;
}

/**
 * Read-only banner za Projects domenu (PR1 — Module Access Model v2).
 * Prikazuje se kad je owner u downgrade-u ili kad je korisnik participant.
 * CTA "Aktiviraj Projekte" se prikazuje samo za ownera (owner_downgrade).
 */
export function ProjectReadOnlyBanner({
  reason = 'owner_downgrade',
  onUpgradeClick,
  className,
  compact,
}: ProjectReadOnlyBannerProps) {
  const { t } = useTranslation();
  const showCta = reason === 'owner_downgrade';

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border border-amber-200/60 bg-amber-50 p-3 text-amber-900',
        'dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-100',
        compact && 'p-2 text-sm',
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{t('projects.access.readOnlyTitle')}</p>
        {!compact && (
          <p className="mt-1 text-sm opacity-90">{t('projects.access.readOnlyBody')}</p>
        )}
      </div>
      {showCta && onUpgradeClick && (
        <Button
          size="sm"
          onClick={onUpgradeClick}
          className="shrink-0 gap-1.5"
        >
          <Crown className="h-3.5 w-3.5" />
          {t('projects.access.cta')}
        </Button>
      )}
    </div>
  );
}
