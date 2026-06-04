import { useTranslation } from 'react-i18next';
import { Users, FolderKanban, Building2 } from 'lucide-react';
import {
  summarizeModuleAccess,
  type ActiveGrantLike,
} from '@/lib/adminAccess';
import { clickableProps } from '@/lib/a11y';

export type DrilldownIntent = {
  module: 'projects' | 'business';
  source?: 'billing' | 'override';
};

interface Props {
  userIds: string[];
  subscriptions: Record<string, string>;
  grants: ActiveGrantLike[];
  onDrilldown?: (intent: DrilldownIntent) => void;
}

const Stat = ({
  primary,
  label,
  value,
  onClick,
  ariaLabel,
}: {
  primary?: boolean;
  label: string;
  value: number;
  onClick?: () => void;
  ariaLabel?: string;
}) => {
  if (!onClick) {
    return (
      <div className="flex justify-between">
        <span>{label}</span>
        <span className="font-medium text-foreground">{value}</span>
      </div>
    );
  }
  if (primary) {
    return (
      <div
        {...clickableProps(onClick, {
          label: ariaLabel,
          className:
            'rounded -m-1 p-1 cursor-pointer hover:bg-muted/60 transition-colors',
        })}
      >
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
          {label}
        </p>
        <p className="text-2xl font-bold leading-tight underline decoration-dotted decoration-muted-foreground/40 underline-offset-2">
          {value}
        </p>
      </div>
    );
  }
  return (
    <div
      {...clickableProps(onClick, {
        label: ariaLabel,
        className:
          'flex justify-between rounded px-1 -mx-1 cursor-pointer hover:bg-muted/60 transition-colors',
      })}
    >
      <span className="underline decoration-dotted decoration-muted-foreground/40 underline-offset-2">
        {label}
      </span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
};

const ModuleCard = ({
  icon,
  label,
  module,
  total,
  billing,
  override,
  intersection,
  billingLabel,
  overrideLabel,
  intersectionLabel,
  totalLabel,
  onDrilldown,
}: {
  icon: React.ReactNode;
  label: string;
  module: 'projects' | 'business';
  total: number;
  billing: number;
  override: number;
  intersection: number;
  billingLabel: string;
  overrideLabel: string;
  intersectionLabel: string;
  totalLabel: string;
  onDrilldown?: (intent: DrilldownIntent) => void;
}) => (
  <div className="bg-card border rounded-xl p-4 space-y-2">
    <div className="flex items-center gap-2">
      {icon}
      <h4 className="text-sm font-semibold">{label}</h4>
    </div>
    <Stat
      primary
      label={totalLabel}
      value={total}
      onClick={onDrilldown ? () => onDrilldown({ module }) : undefined}
      ariaLabel={`${label} — ${totalLabel}`}
    />
    <div className="text-[11px] text-muted-foreground space-y-0.5 pt-1 border-t">
      <Stat
        label={billingLabel}
        value={billing}
        onClick={onDrilldown ? () => onDrilldown({ module, source: 'billing' }) : undefined}
        ariaLabel={`${label} — ${billingLabel}`}
      />
      <Stat
        label={overrideLabel}
        value={override}
        onClick={onDrilldown ? () => onDrilldown({ module, source: 'override' }) : undefined}
        ariaLabel={`${label} — ${overrideLabel}`}
      />
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
  onDrilldown,
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
          module="projects"
          total={summary.projects.total}
          billing={summary.projects.billing}
          override={summary.projects.override}
          intersection={summary.projects.intersection}
          billingLabel={billingLabel}
          overrideLabel={overrideLabel}
          intersectionLabel={intersectionLabel}
          totalLabel={totalLabel}
          onDrilldown={onDrilldown}
        />

        <ModuleCard
          icon={<Building2 className="w-4 h-4 text-primary" />}
          label={t('settings.modules.business.title', 'Business')}
          module="business"
          total={summary.business.total}
          billing={summary.business.billing}
          override={summary.business.override}
          intersection={summary.business.intersection}
          billingLabel={billingLabel}
          overrideLabel={overrideLabel}
          intersectionLabel={intersectionLabel}
          totalLabel={totalLabel}
          onDrilldown={onDrilldown}
        />
      </div>
    </div>
  );
};
