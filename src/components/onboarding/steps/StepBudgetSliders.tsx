import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Slider } from '@/components/ui/slider';
import { useHaptics } from '@/hooks/useHaptics';

export const SLIDER_PRESETS = [
  { key: 'rent',      emoji: '🏠', color: 'hsl(0 75% 55%)'  },
  { key: 'food',      emoji: '🛒', color: 'hsl(25 85% 55%)' },
  { key: 'car',       emoji: '🚗', color: 'hsl(210 75% 55%)' },
  { key: 'utilities', emoji: '💡', color: 'hsl(45 90% 55%)' },
  { key: 'other',     emoji: '📦', color: 'hsl(265 65% 60%)' },
] as const;

export type SliderKey = typeof SLIDER_PRESETS[number]['key'];
export type PercentMap = Record<SliderKey, number>;

interface Props {
  percents: PercentMap;
  income: number; // 0 if skipped
  onChange: (next: PercentMap) => void;
}

export const StepBudgetSliders = ({ percents, income, onChange }: Props) => {
  const { t } = useTranslation();
  const { mediumTap } = useHaptics();
  const overWarnedRef = useRef(false);

  const totalPct = SLIDER_PRESETS.reduce((s, p) => s + (percents[p.key] || 0), 0);
  const hasIncome = income > 0;

  useEffect(() => {
    if (totalPct > 100 && !overWarnedRef.current) {
      overWarnedRef.current = true;
      mediumTap().catch(() => {});
    } else if (totalPct <= 100 && overWarnedRef.current) {
      overWarnedRef.current = false;
    }
  }, [totalPct, mediumTap]);

  const chartData = SLIDER_PRESETS
    .filter((p) => (percents[p.key] || 0) > 0)
    .map((p) => ({
      name: t(`onboardingV3.sliders.cats.${p.key}`),
      value: percents[p.key],
      color: p.color,
    }));

  const expenseEur = hasIncome ? (income * totalPct) / 100 : 0;
  const savingsEur = hasIncome ? income - expenseEur : 0;
  const savingsPositive = savingsEur >= 0;

  return (
    <motion.div
      key="step-sliders"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      className="w-full max-w-md mt-4 space-y-5"
    >
      <div className="text-center space-y-2">
        <h2 className="text-xl font-bold">
          {t('onboardingV3.sliders.title', 'Pomakni klizače na grube postotke')}
        </h2>
        <p className="text-xs text-muted-foreground">
          {hasIncome
            ? t('onboardingV3.sliders.hintWithIncome', 'Eurski iznos se računa iz tvog prihoda.')
            : t('onboardingV3.sliders.hintNoIncome', 'Bez prihoda spremamo samo postotke. Iznose dodaj kasnije.')}
        </p>
      </div>

      <div className="space-y-4">
        {SLIDER_PRESETS.map((p) => {
          const pct = percents[p.key] || 0;
          const eur = hasIncome ? (income * pct) / 100 : 0;
          return (
            <div key={p.key} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xl shrink-0" aria-hidden>{p.emoji}</span>
                  <span className="text-sm font-medium truncate">
                    {t(`onboardingV3.sliders.cats.${p.key}`)}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0 text-sm tabular-nums">
                  <span className="text-muted-foreground">{pct}%</span>
                  {hasIncome && (
                    <span className="font-semibold w-20 text-right">{eur.toFixed(0)} €</span>
                  )}
                </div>
              </div>
              <Slider
                value={[pct]}
                min={0}
                max={100}
                step={1}
                onValueChange={(v) => onChange({ ...percents, [p.key]: v[0] })}
                aria-label={t(`onboardingV3.sliders.cats.${p.key}`)}
              />
            </div>
          );
        })}
      </div>

      {chartData.length > 0 && (
        <div className="rounded-2xl border border-border p-4 bg-card space-y-3">
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={75}
                  paddingAngle={2}
                  isAnimationActive={false}
                >
                  {chartData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip
                  formatter={(v: number) => hasIncome ? `${((income * v) / 100).toFixed(0)} €` : `${v}%`}
                  contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 gap-2 text-center text-xs">
            <div className="rounded-lg bg-muted/50 p-2">
              <div className="text-muted-foreground">
                {t('onboardingV3.sliders.totalExpense', 'Ukupno troškovi')}
              </div>
              <div className="text-base font-semibold">
                {hasIncome ? `${expenseEur.toFixed(0)} €` : `${totalPct}%`}
              </div>
            </div>
            <div className="rounded-lg bg-muted/50 p-2">
              <div className="text-muted-foreground">
                {t('onboardingV3.sliders.savings', 'Ostaje za štednju')}
              </div>
              <div
                className={`text-base font-semibold ${
                  savingsPositive ? 'text-primary' : 'text-destructive'
                }`}
              >
                {hasIncome
                  ? `${savingsEur.toFixed(0)} €`
                  : `${Math.max(0, 100 - totalPct)}%`}
              </div>
            </div>
          </div>

          {totalPct > 100 && (
            <p className="text-xs text-destructive text-center">
              {t('onboardingV3.sliders.over100', 'Prešao si 100% prihoda.')}
            </p>
          )}
        </div>
      )}
    </motion.div>
  );
};
