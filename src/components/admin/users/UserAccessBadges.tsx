import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Zap } from 'lucide-react';
import {
  deriveEffectiveAccess,
  formatExpiryBadge,
  type ActiveGrantLike,
} from '@/lib/adminAccess';

export interface ExpiringSoonEntry {
  user_id: string;
  module: 'projects' | 'business';
  expires_at: string;
}

interface Props {
  userId: string;
  tier: string | null | undefined;
  grants: ActiveGrantLike[];
  /** Aktivni grantovi s `expires_at` koji ulaze u rolling < 7d prozor. */
  expiringSoonGrants?: ExpiringSoonEntry[];
}

/**
 * Lagani tekstualni `Modul · Izvor` badgevi + zaseban tekstualni expiry badge
 * (PR2) za module čiji override grant ističe < 7 dana.
 */
export const UserAccessBadges = ({
  userId,
  tier,
  grants,
  expiringSoonGrants = [],
}: Props) => {
  const { t } = useTranslation();
  const access = deriveEffectiveAccess(userId, tier, grants);

  const earliestPerModule = (module: 'projects' | 'business'): Date | null => {
    let min: number | null = null;
    for (const g of expiringSoonGrants) {
      if (g.user_id !== userId || g.module !== module) continue;
      const t = new Date(g.expires_at).getTime();
      if (Number.isNaN(t)) continue;
      if (min === null || t < min) min = t;
    }
    return min === null ? null : new Date(min);
  };

  const renderModule = (
    module: 'projects' | 'business',
    label: string
  ) => {
    const ma = access[module];
    if (!ma.has) return null;
    const hasOverride = ma.sources.includes('override');
    const hasBilling = ma.sources.includes('billing');
    const sourceText =
      hasBilling && hasOverride
        ? t('admin.users.accessSource.both', 'Naplata + Override')
        : hasBilling
          ? t('admin.users.accessSource.billing', 'Naplata')
          : t('admin.users.accessSource.override', 'Override');

    const earliest = earliestPerModule(module);
    const expiryBadge = earliest ? formatExpiryBadge(earliest) : null;

    return (
      <div key={module} className="inline-flex items-center gap-1">
        <Badge
          variant="secondary"
          className="text-[10px] px-1.5 py-0 font-normal bg-muted/60 text-foreground/80 border-border/60"
        >
          <span className="font-medium">{label}</span>
          <span className="mx-1 opacity-50">·</span>
          <span>{sourceText}</span>
          {hasOverride && (
            <Zap
              className="w-2.5 h-2.5 ml-1 opacity-60"
              aria-hidden="true"
            />
          )}
        </Badge>
        {expiryBadge && (
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 py-0 font-normal border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
          >
            {t(expiryBadge.i18nKey, expiryBadge.params)}
          </Badge>
        )}
      </div>
    );
  };

  const projectsLabel = t('settings.modules.projects.title', 'Projekti');
  const businessLabel = t('settings.modules.business.title', 'Business');

  if (!access.projects.has && !access.business.has) {
    return (
      <span className="text-[11px] text-muted-foreground">
        {t('admin.users.accessBadge.coreOnly', 'Samo Core')}
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {renderModule('projects', projectsLabel)}
      {renderModule('business', businessLabel)}
    </div>
  );
};
