import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Zap, Clock3 } from 'lucide-react';
import {
  deriveEffectiveAccess,
  type ActiveGrantLike,
} from '@/lib/adminAccess';

interface Props {
  userId: string;
  tier: string | null | undefined;
  grants: ActiveGrantLike[];
  /** Sve aktivne grant rows s expires_at; koristi se za ⏳ akcent. */
  expiringSoonGrants?: { user_id: string; module: 'projects' | 'business' }[];
}

/**
 * Lagani tekstualni `Modul · Izvor` badgevi.
 * - Bez `Core` badge-a u retku (Core se podrazumijeva).
 * - Kad nema nijedan modul → indikator `Samo Core` (neutralan).
 * - Tekst primarno, ikone samo kao sekundarni akcent.
 */
export const UserAccessBadges = ({
  userId,
  tier,
  grants,
  expiringSoonGrants = [],
}: Props) => {
  const { t } = useTranslation();
  const access = deriveEffectiveAccess(userId, tier, grants);

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
    const expiringSoon = expiringSoonGrants.some(
      (g) => g.user_id === userId && g.module === module
    );
    return (
      <Badge
        key={module}
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
        {expiringSoon && (
          <Clock3
            className="w-2.5 h-2.5 ml-0.5 opacity-60"
            aria-hidden="true"
          />
        )}
      </Badge>
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
