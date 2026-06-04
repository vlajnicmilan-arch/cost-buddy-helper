import { useTranslation } from 'react-i18next';
import { Users, FolderKanban, Building2 } from 'lucide-react';
import {
  summarizeModuleAccess,
  type ActiveGrantLike,
} from '@/lib/adminAccess';

interface Props {
  userIds: string[];
  subscriptions: Record<string, string>;
  grants: ActiveGrantLike[];
}

const ModuleCard = ({
  icon,
  label,
  total,
  billing,
  override,
  intersection,
  billingLabel,
  overrideLabel,
  intersectionLabel,
  totalLabel,
}: {
  icon: React.ReactNode;
  label: string;
  total: number;
  billing: number;
  override: number;
  intersection: number;
  billingLabel: string;
  overrideLabel: string;
  intersectionLabel: string;
  totalLabel: string;
}) => (
  <div className="bg-card border rounded-xl p-4 space-y-2">
    <div className="flex items-center gap-2">
      {icon}
      <h4 className="text-sm font-semibold">{label}</h4>
    </div>
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
        {totalLabel}
      </p>
      <p className="text-2xl font-bold leading-tight">{total}</p>
    </div>
    <div className="text-[11px] text-muted-foreground space-y-0.5 pt-1 border-t">
      <div className="flex justify-between">
        <span>{billingLabel}</span>
        <span className="font-medium text-foreground">{billing}</span>
      </div>
      <div className="flex justify-between">
        <span>{overrideLabel}</span>
        <span className="font-medium text-foreground">{override}</span>
      </div>
      {intersection > 0 && (
        <div className="flex justify-between pt-0.5 text-muted-foreground/80">
          <span className="italic">{intersectionLabel}</span>
          <span className="font-medium">{intersection}</span>
        </div>
      )}
    </div>
  </div>
);

export const ModuleAccessOverview = ({
  userIds,
  subscriptions,
  grants,
}: Props) => {
  const { t } = useTranslation();
  const summary = summarizeModuleAccess(userIds, subscriptions, grants);

  const billingLabel = t('admin.access.overview.viaBilling', 'kroz Naplatu');
  const overrideLabel = t('admin.access.overview.viaOverride', 'kroz Override');
  const intersectionLabel = t(
    'admin.access.overview.intersection',
    'i jedno i drugo'
  );
  const totalLabel = t('admin.access.overview.totalWithAccess', 'Ukupno s pristupom');

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        {t('admin.access.overview.title', 'Stanje pristupa po modulima')}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-card border rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            <h4 className="text-sm font-semibold">Core</h4>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
              {t('admin.access.overview.totalUsers', 'Ukupno korisnika')}
            </p>
            <p className="text-2xl font-bold leading-tight">{summary.coreTotal}</p>
          </div>
          <p className="text-[11px] text-muted-foreground italic">
            {t('admin.access.overview.coreAlwaysOn', 'Core je dostupan svima.')}
          </p>
        </div>

        <ModuleCard
          icon={<FolderKanban className="w-4 h-4 text-primary" />}
          label={t('settings.modules.projects.title', 'Projekti')}
          total={summary.projects.total}
          billing={summary.projects.billing}
          override={summary.projects.override}
          intersection={summary.projects.intersection}
          billingLabel={billingLabel}
          overrideLabel={overrideLabel}
          intersectionLabel={intersectionLabel}
          totalLabel={totalLabel}
        />

        <ModuleCard
          icon={<Building2 className="w-4 h-4 text-primary" />}
          label={t('settings.modules.business.title', 'Business')}
          total={summary.business.total}
          billing={summary.business.billing}
          override={summary.business.override}
          intersection={summary.business.intersection}
          billingLabel={billingLabel}
          overrideLabel={overrideLabel}
          intersectionLabel={intersectionLabel}
          totalLabel={totalLabel}
        />
      </div>
    </div>
  );
};
