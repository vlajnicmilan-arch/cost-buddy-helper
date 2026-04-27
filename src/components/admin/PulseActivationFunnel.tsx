import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Users, FolderKanban, Receipt, TrendingUp, Loader2 } from 'lucide-react';
import { useActivationFunnel } from '@/hooks/useActivationFunnel';

const StepCard = ({
  icon,
  label,
  value,
  pct,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  pct?: number;
  color: string;
}) => (
  <div
    className="flex-1 min-w-[120px] p-3 rounded-xl border border-border/50 bg-card relative overflow-hidden"
    style={{ borderLeftWidth: 3, borderLeftColor: color }}
  >
    <div className="flex items-center gap-2 mb-1">
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center"
        style={{ backgroundColor: `${color}1a`, color }}
      >
        {icon}
      </div>
      <p className="text-[11px] text-muted-foreground font-medium leading-tight">{label}</p>
    </div>
    <div className="flex items-baseline gap-2">
      <span className="text-xl font-bold tabular-nums">{value}</span>
      {pct !== undefined && (
        <span className="text-xs text-muted-foreground">({pct}%)</span>
      )}
    </div>
  </div>
);

export const PulseActivationFunnel = () => {
  const { t } = useTranslation();
  const f = useActivationFunnel();

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-3"
    >
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          {t('admin.pulse.activationFunnel', 'Activation funnel — Projekti')}
        </h4>
        {f.loading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
      </div>

      {f.error ? (
        <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-lg p-2">
          {f.error}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <StepCard
              icon={<Users className="w-3.5 h-3.5" />}
              label={t('admin.pulse.funnelRegistered', 'Registriranih')}
              value={f.registeredUsers}
              color="hsl(220 80% 55%)"
            />
            <StepCard
              icon={<FolderKanban className="w-3.5 h-3.5" />}
              label={t('admin.pulse.funnelHasProject', 'Ima projekt')}
              value={f.usersWithProjects}
              pct={f.projectCreationRate}
              color="hsl(var(--primary))"
            />
            <StepCard
              icon={<Receipt className="w-3.5 h-3.5" />}
              label={t('admin.pulse.funnelHasTransaction', 'Ima transakciju')}
              value={f.usersWithProjectTransactions}
              pct={f.projectActivationRate}
              color="hsl(168 80% 50%)"
            />
          </div>

          <div className="mt-2 text-[11px] text-muted-foreground">
            {t(
              'admin.pulse.activationHint',
              'Konverzija: {{create}}% korisnika kreira projekt, od njih {{activate}}% unese transakciju.',
              { create: f.projectCreationRate, activate: f.projectActivationRate }
            )}
          </div>
        </>
      )}
    </motion.div>
  );
};
