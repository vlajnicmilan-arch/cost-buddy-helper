import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { Check, Minus } from 'lucide-react';
import {
  deriveEffectiveAccess,
  type ActiveGrantLike,
} from '@/lib/adminAccess';

interface Props {
  userId: string;
  tier: string | null | undefined;
  grants: ActiveGrantLike[];
}

export const EffectiveAccessSummary = ({ userId, tier, grants }: Props) => {
  const { t } = useTranslation();
  const access = deriveEffectiveAccess(userId, tier, grants);

  const summaryParts: string[] = ['Core'];
  if (access.projects.has) summaryParts.push(t('settings.modules.projects.title', 'Projekti'));
  if (access.business.has) summaryParts.push(t('settings.modules.business.title', 'Business'));
  const summary =
    summaryParts.length === 1
      ? t('admin.user.effectiveAccess.coreOnly', 'Samo Core')
      : summaryParts.join(' + ');

  const userGrants = grants.filter((g) => g.user_id === userId);
  const grantFor = (module: 'projects' | 'business') =>
    userGrants.find((g) => g.module === module);

  const formatSources = (
    sources: ('billing' | 'override')[],
    grant: ActiveGrantLike | undefined
  ): string => {
    const parts: string[] = [];
    if (sources.includes('billing')) {
      parts.push(t('admin.users.accessSource.billing', 'Naplata'));
    }
    if (sources.includes('override')) {
      const expires = grant?.expires_at
        ? ` (${t('admin.user.until', 'do')} ${format(new Date(grant.expires_at), 'dd.MM.yyyy.', { locale: hr })})`
        : ` (${t('admin.moduleAccess.permanent', 'Trajno')})`;
      parts.push(`${t('admin.users.accessSource.override', 'Override')}${expires}`);
    }
    return parts.join(', ');
  };

  const Row = ({
    label,
    has,
    sourcesText,
    alwaysOn,
  }: {
    label: string;
    has: boolean;
    sourcesText?: string;
    alwaysOn?: boolean;
  }) => (
    <div className="flex items-baseline justify-between gap-3 py-1 text-xs">
      <div className="flex items-center gap-2 min-w-0">
        {has ? (
          <Check className="w-3.5 h-3.5 text-primary shrink-0" />
        ) : (
          <Minus className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
        )}
        <span className="font-medium">{label}</span>
        {alwaysOn && (
          <span className="text-[10px] text-muted-foreground">
            ({t('admin.user.effectiveAccess.always', 'uvijek')})
          </span>
        )}
      </div>
      {sourcesText && (
        <span className="text-[11px] text-muted-foreground text-right">
          {t('admin.user.effectiveAccess.from', 'iz')}: {sourcesText}
        </span>
      )}
    </div>
  );

  return (
    <div className="bg-card border rounded-lg p-3 space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          {t('admin.user.effectiveAccess.title', 'Efektivni pristup')}
        </p>
        <p className="text-sm font-semibold text-foreground">{summary}</p>
      </div>
      <div className="border-t pt-1">
        <Row label="Core" has alwaysOn />
        <Row
          label={t('settings.modules.projects.title', 'Projekti')}
          has={access.projects.has}
          sourcesText={
            access.projects.has
              ? formatSources(access.projects.sources, grantFor('projects'))
              : undefined
          }
        />
        <Row
          label={t('settings.modules.business.title', 'Business')}
          has={access.business.has}
          sourcesText={
            access.business.has
              ? formatSources(access.business.sources, grantFor('business'))
              : undefined
          }
        />
      </div>
    </div>
  );
};
