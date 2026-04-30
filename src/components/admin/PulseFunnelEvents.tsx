import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  Download,
  UserPlus,
  CheckCircle2,
  Receipt,
  CalendarCheck,
  CreditCard,
  Loader2,
  TrendingDown,
} from 'lucide-react';
import { useFunnelEventsMetrics, type FunnelEventName } from '@/hooks/useFunnelEventsMetrics';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const ICONS: Record<FunnelEventName, React.ReactNode> = {
  install: <Download className="w-3.5 h-3.5" />,
  signup: <UserPlus className="w-3.5 h-3.5" />,
  onboarding_complete: <CheckCircle2 className="w-3.5 h-3.5" />,
  first_transaction: <Receipt className="w-3.5 h-3.5" />,
  day7_active: <CalendarCheck className="w-3.5 h-3.5" />,
  paid_conversion: <CreditCard className="w-3.5 h-3.5" />,
};

const COLORS: Record<FunnelEventName, string> = {
  install: 'hsl(220 80% 55%)',
  signup: 'hsl(200 80% 50%)',
  onboarding_complete: 'hsl(180 70% 45%)',
  first_transaction: 'hsl(var(--primary))',
  day7_active: 'hsl(150 70% 45%)',
  paid_conversion: 'hsl(45 90% 50%)',
};

export const PulseFunnelEvents = () => {
  const { t } = useTranslation();
  const [rangeDays, setRangeDays] = useState(30);
  const m = useFunnelEventsMetrics(rangeDays);

  const labels: Record<FunnelEventName, string> = {
    install: t('admin.funnel.install', 'Instalacija'),
    signup: t('admin.funnel.signup', 'Registracija'),
    onboarding_complete: t('admin.funnel.onboarding', 'Onboarding'),
    first_transaction: t('admin.funnel.firstTx', 'Prva transakcija'),
    day7_active: t('admin.funnel.day7', 'Aktivni 7. dan'),
    paid_conversion: t('admin.funnel.paid', 'Plaćena pretplata'),
  };

  const maxCount = Math.max(1, ...m.steps.map((s) => s.count));

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-3"
    >
      <div className="flex items-center justify-between mb-3 gap-2">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <TrendingDown className="w-4 h-4 text-primary" />
          {t('admin.funnel.title', 'Acquisition funnel')}
        </h4>
        <div className="flex items-center gap-2">
          {m.loading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
          <Select value={String(rangeDays)} onValueChange={(v) => setRangeDays(Number(v))}>
            <SelectTrigger className="h-7 text-xs w-[110px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">{t('admin.funnel.range7d', '7 dana')}</SelectItem>
              <SelectItem value="30">{t('admin.funnel.range30d', '30 dana')}</SelectItem>
              <SelectItem value="90">{t('admin.funnel.range90d', '90 dana')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {m.error ? (
        <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-lg p-2">
          {m.error}
        </div>
      ) : (
        <div className="space-y-1.5">
          {m.steps.map((s, idx) => {
            const widthPct = (s.count / maxCount) * 100;
            const color = COLORS[s.name];
            return (
              <div key={s.name} className="relative">
                <div
                  className="rounded-lg border border-border/40 overflow-hidden relative"
                  style={{ minHeight: 44 }}
                >
                  <div
                    className="absolute inset-y-0 left-0 transition-all"
                    style={{
                      width: `${Math.max(widthPct, 4)}%`,
                      background: `linear-gradient(90deg, ${color}33, ${color}11)`,
                      borderRight: `2px solid ${color}`,
                    }}
                  />
                  <div className="relative flex items-center justify-between gap-2 px-2.5 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${color}26`, color }}
                      >
                        {ICONS[s.name]}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium leading-tight truncate">
                          {labels[s.name]}
                        </p>
                        <p className="text-[10px] text-muted-foreground leading-tight">
                          {idx === 0
                            ? t('admin.funnel.topStep', 'Početak lijevka')
                            : t('admin.funnel.fromPrev', '{{pct}}% od prethodnog', { pct: s.conversionFromPrev })}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-base font-bold tabular-nums leading-tight">
                        {s.count}
                      </p>
                      {idx > 0 && (
                        <p className="text-[10px] text-muted-foreground leading-tight">
                          {s.conversionFromTop}% {t('admin.funnel.fromTopShort', 'od vrha')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-2 text-[11px] text-muted-foreground">
        {t(
          'admin.funnel.hint',
          'Install = jedinstvene sesije; ostali koraci = jedinstveni korisnici. Razdoblje: zadnjih {{days}} dana.',
          { days: rangeDays }
        )}
      </div>
    </motion.div>
  );
};
