import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { useAppState } from '@/contexts/AppStateContext';
import { Sparkles, ChevronRight, ChevronLeft, TrendingDown, TrendingUp, PartyPopper } from 'lucide-react';
import logo from '@/assets/logo.webp';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { supabase } from '@/integrations/supabase/client';
import {
  DEFAULT_INCOME_CATEGORY_ICONS,
  DEFAULT_INCOME_CATEGORY_COLORS,
  CustomIncomeCategory,
} from '@/types/customIncomeCategory';

// Predefinirane kategorije rashoda – ključ se koristi i kao `category` u budget_categories
const EXPENSE_PRESETS = [
  { key: 'rent',          icon: '🏠', color: 'hsl(0 75% 55%)' },
  { key: 'food',          icon: '🛒', color: 'hsl(25 85% 55%)' },
  { key: 'car',           icon: '🚗', color: 'hsl(210 75% 55%)' },
  { key: 'utilities',     icon: '💡', color: 'hsl(45 90% 55%)' },
  { key: 'subscriptions', icon: '📺', color: 'hsl(265 65% 60%)' },
  { key: 'other',         icon: '📦', color: 'hsl(220 10% 55%)' },
] as const;

// Predefinirane kategorije prihoda
const INCOME_PRESETS = [
  { key: 'salary',     icon: '💼', color: 'hsl(160 65% 45%)' },
  { key: 'freelance',  icon: '💻', color: 'hsl(180 60% 45%)' },
  { key: 'rentIncome', icon: '🏘️', color: 'hsl(140 60% 45%)' },
  { key: 'dividends',  icon: '📈', color: 'hsl(200 60% 50%)' },
  { key: 'other',      icon: '✨', color: 'hsl(120 50% 50%)' },
] as const;

interface CategoryAmount {
  selected: boolean;
  amount: string;
}

const initState = (presets: ReadonlyArray<{ key: string }>): Record<string, CategoryAmount> =>
  Object.fromEntries(presets.map(p => [p.key, { selected: false, amount: '' }]));

const Onboarding = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { setOnboardingCompleted, setDisplayName: setContextDisplayName, setUsageProfile } = useAppState();

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  const initialName = useMemo(
    () => (localStorage.getItem('user_display_name') || '').trim(),
    [],
  );
  const [displayName, setDisplayName] = useState(initialName);

  const [expenses, setExpenses] = useState<Record<string, CategoryAmount>>(() => initState(EXPENSE_PRESETS));
  const [incomes, setIncomes] = useState<Record<string, CategoryAmount>>(() => initState(INCOME_PRESETS));

  // Pre-fill display name iz profila ako nije već u localStorage
  useEffect(() => {
    let cancelled = false;
    if (!initialName && user) {
      supabase
        .from('profiles')
        .select('display_name')
        .eq('user_id', user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (!cancelled && data?.display_name) {
            setDisplayName(data.display_name);
          }
        });
    }
    return () => { cancelled = true; };
  }, [user, initialName]);

  const totalSteps = 4;
  const progress = (step / totalSteps) * 100;

  const handleBack = () => setStep(s => Math.max(1, s - 1));
  const handleNext = () => setStep(s => Math.min(totalSteps, s + 1));

  // "Završi kasnije" – vodi na home BEZ označavanja onboardinga kao završenog,
  // tako da se wizard može ponovno otvoriti pri sljedećem ulasku.
  const handleSkip = () => {
    setOnboardingCompleted(true); // privremeno – sprječava redirect loop u App.tsx
    localStorage.setItem('onboarding_completed', 'true');
    if (displayName.trim()) {
      localStorage.setItem('user_display_name', displayName.trim());
      setContextDisplayName(displayName.trim());
    }
    setUsageProfile('finance_only');
    localStorage.setItem('usage_profile', 'finance_only');
    navigate('/home', { replace: true });
  };

  const toggleExpense = (key: string) =>
    setExpenses(prev => ({ ...prev, [key]: { ...prev[key], selected: !prev[key].selected } }));

  const setExpenseAmount = (key: string, amount: string) =>
    setExpenses(prev => ({ ...prev, [key]: { ...prev[key], amount } }));

  const toggleIncome = (key: string) =>
    setIncomes(prev => ({ ...prev, [key]: { ...prev[key], selected: !prev[key].selected } }));

  const setIncomeAmount = (key: string, amount: string) =>
    setIncomes(prev => ({ ...prev, [key]: { ...prev[key], amount } }));

  const selectedExpenseEntries = EXPENSE_PRESETS
    .map(p => ({ ...p, ...expenses[p.key] }))
    .filter(e => e.selected);

  const selectedIncomeEntries = INCOME_PRESETS
    .map(p => ({ ...p, ...incomes[p.key] }))
    .filter(e => e.selected);

  const totalExpense = selectedExpenseEntries.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
  const totalIncome  = selectedIncomeEntries.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

  const chartData = selectedExpenseEntries
    .filter(e => parseFloat(e.amount) > 0)
    .map(e => ({
      name: t(`onboardingV2.expenseCategories.${e.key}`),
      value: parseFloat(e.amount),
      color: e.color,
    }));

  const handleComplete = async () => {
    if (!user) {
      showError(t('errors.generic', 'Došlo je do greške'));
      return;
    }
    setSaving(true);
    try {
      const trimmedName = displayName.trim();

      // 1) Update profile – ime + onboarding_completed flag
      await supabase
        .from('profiles')
        .upsert(
          {
            user_id: user.id,
            display_name: trimmedName || null,
            onboarding_completed: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        );

      // 2) Kreiraj jedan budget_plan + budget_categories za svaku odabranu stavku rashoda
      if (selectedExpenseEntries.length > 0) {
        const { data: budget, error: budgetErr } = await supabase
          .from('budget_plans')
          .insert({
            user_id: user.id,
            name: t('onboardingV2.defaultBudgetName', 'Mjesečni budžet'),
            period_type: 'monthly',
            is_active: true,
            is_recurring: true,
            total_amount: totalExpense,
            icon: '💰',
            color: 'hsl(172 66% 40%)',
          })
          .select('id')
          .single();

        if (budgetErr) throw budgetErr;
        if (budget?.id) {
          const rows = selectedExpenseEntries.map(e => ({
            budget_id: budget.id,
            category: e.key,
            limit_amount: parseFloat(e.amount) || 0,
            icon: e.icon,
            color: e.color,
          }));
          const { error: catErr } = await supabase.from('budget_categories').insert(rows);
          if (catErr) throw catErr;
        }
      }

      // 3) Custom income kategorije (još uvijek su localStorage-only u ovom projektu)
      if (selectedIncomeEntries.length > 0) {
        const STORAGE_KEY = 'customIncomeCategories';
        const existingRaw = localStorage.getItem(STORAGE_KEY);
        const existing: CustomIncomeCategory[] = existingRaw ? JSON.parse(existingRaw) : [];
        const now = new Date().toISOString();
        const newCats: CustomIncomeCategory[] = selectedIncomeEntries.map((e, idx) => ({
          id: `custom_income_${crypto.randomUUID()}`,
          user_id: user.id,
          name: t(`onboardingV2.incomeCategories.${e.key}`),
          icon: e.icon || DEFAULT_INCOME_CATEGORY_ICONS[idx % DEFAULT_INCOME_CATEGORY_ICONS.length],
          color: e.color || DEFAULT_INCOME_CATEGORY_COLORS[idx % DEFAULT_INCOME_CATEGORY_COLORS.length],
          created_at: now,
          updated_at: now,
        }));
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...newCats, ...existing]));
      }

      // 4) Lokalno stanje
      localStorage.setItem('onboarding_completed', 'true');
      localStorage.setItem('show_welcome_animation', 'true');
      localStorage.setItem('usage_profile', 'finance_only');
      if (trimmedName) {
        localStorage.setItem('user_display_name', trimmedName);
        setContextDisplayName(trimmedName);
      }
      setUsageProfile('finance_only');
      setOnboardingCompleted(true);

      // Funnel telemetry (best-effort)
      import('@/lib/funnelTracking')
        .then(({ logFunnelEvent }) => logFunnelEvent('onboarding_complete', {
          expense_categories: selectedExpenseEntries.length,
          income_categories: selectedIncomeEntries.length,
        }))
        .catch(() => {});

      showSuccess(t('onboardingV2.doneToast', 'Aplikacija je spremna!'));
      navigate('/home', { replace: true });
    } catch (err) {
      console.error('Onboarding completion error:', err);
      showError(t('errors.generic', 'Došlo je do greške'));
    } finally {
      setSaving(false);
    }
  };

  // Validacija po koraku
  const canAdvance = () => {
    if (step === 1) return displayName.trim().length > 0;
    return true; // koraci 2 i 3 su opcionalni
  };

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      {/* Header */}
      <header className="p-4 flex items-center justify-between safe-area-top">
        <div className="flex items-center gap-3">
          <img src={logo} alt="V&M Balance" className="w-10 h-10 object-contain" />
          <span className="font-semibold text-lg">V&M Balance</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{step}/{totalSteps}</span>
          {step < totalSteps && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSkip}
              className="text-xs h-8"
              disabled={saving}
            >
              {t('onboardingV2.finishLater', 'Završi kasnije')}
            </Button>
          )}
        </div>
      </header>

      {/* Progress */}
      <div className="h-1 bg-muted">
        <motion.div
          className="h-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-start p-4 overflow-y-auto">
        <AnimatePresence mode="wait">
          {/* === STEP 1: GREETING === */}
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="w-full max-w-md mt-4 space-y-6"
            >
              <div className="text-center space-y-3">
                <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                  <Sparkles className="w-8 h-8 text-primary" />
                </div>
                <h1 className="text-2xl font-bold">
                  {displayName.trim()
                    ? t('onboardingV2.step1.greetingNamed', { name: displayName.trim(), defaultValue: 'Pozdrav, {{name}}!' })
                    : t('onboardingV2.step1.greeting', 'Pozdrav!')}
                </h1>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {t(
                    'onboardingV2.step1.intro',
                    'V&M Balance pomaže ti da u 15 sekundi postaviš osnovni budžet — odabereš najvažnije mjesečne troškove i prihode i odmah dobiješ jasan pregled.',
                  )}
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="onb-name">
                  {t('onboardingV2.step1.nameLabel', 'Tvoje ime')}
                </label>
                <Input
                  id="onb-name"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder={t('onboardingV2.step1.namePlaceholder', 'npr. Marko')}
                  className="h-12 text-base"
                  autoFocus
                />
              </div>
            </motion.div>
          )}

          {/* === STEP 2: EXPENSES === */}
          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="w-full max-w-md mt-4 space-y-5"
            >
              <div className="text-center space-y-2">
                <div className="w-14 h-14 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
                  <TrendingDown className="w-7 h-7 text-destructive" />
                </div>
                <h2 className="text-xl font-bold">
                  {t('onboardingV2.step2.title', 'Koji su tvoji glavni mjesečni troškovi?')}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {t('onboardingV2.step2.hint', 'Odaberi i upiši okvirne iznose. Možeš preskočiti.')}
                </p>
              </div>

              <div className="space-y-2">
                {EXPENSE_PRESETS.map(p => {
                  const state = expenses[p.key];
                  return (
                    <div
                      key={p.key}
                      className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-colors ${
                        state.selected ? 'border-primary bg-primary/5' : 'border-border'
                      }`}
                    >
                      <Checkbox
                        id={`exp-${p.key}`}
                        checked={state.selected}
                        onCheckedChange={() => toggleExpense(p.key)}
                      />
                      <span className="text-2xl shrink-0" aria-hidden>{p.icon}</span>
                      <label htmlFor={`exp-${p.key}`} className="flex-1 text-sm font-medium cursor-pointer">
                        {t(`onboardingV2.expenseCategories.${p.key}`)}
                      </label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="any"
                        placeholder="€"
                        value={state.amount}
                        onChange={e => setExpenseAmount(p.key, e.target.value)}
                        onFocus={() => { if (!state.selected) toggleExpense(p.key); }}
                        className="w-24 h-10 text-right shrink-0"
                      />
                    </div>
                  );
                })}
              </div>

              {totalExpense > 0 && (
                <p className="text-center text-sm text-muted-foreground">
                  {t('onboardingV2.step2.totalLabel', 'Ukupno mjesečno')}:{' '}
                  <span className="font-semibold text-foreground">{totalExpense.toFixed(2)} €</span>
                </p>
              )}
            </motion.div>
          )}

          {/* === STEP 3: INCOME === */}
          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="w-full max-w-md mt-4 space-y-5"
            >
              <div className="text-center space-y-2">
                <div className="w-14 h-14 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                  <TrendingUp className="w-7 h-7 text-primary" />
                </div>
                <h2 className="text-xl font-bold">
                  {t('onboardingV2.step3.title', 'Koji su tvoji glavni prihodi?')}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {t('onboardingV2.step3.hint', 'Odaberi i upiši okvirne iznose. Možeš preskočiti.')}
                </p>
              </div>

              <div className="space-y-2">
                {INCOME_PRESETS.map(p => {
                  const state = incomes[p.key];
                  return (
                    <div
                      key={p.key}
                      className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-colors ${
                        state.selected ? 'border-primary bg-primary/5' : 'border-border'
                      }`}
                    >
                      <Checkbox
                        id={`inc-${p.key}`}
                        checked={state.selected}
                        onCheckedChange={() => toggleIncome(p.key)}
                      />
                      <span className="text-2xl shrink-0" aria-hidden>{p.icon}</span>
                      <label htmlFor={`inc-${p.key}`} className="flex-1 text-sm font-medium cursor-pointer">
                        {t(`onboardingV2.incomeCategories.${p.key}`)}
                      </label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="any"
                        placeholder="€"
                        value={state.amount}
                        onChange={e => setIncomeAmount(p.key, e.target.value)}
                        onFocus={() => { if (!state.selected) toggleIncome(p.key); }}
                        className="w-24 h-10 text-right shrink-0"
                      />
                    </div>
                  );
                })}
              </div>

              {totalIncome > 0 && (
                <p className="text-center text-sm text-muted-foreground">
                  {t('onboardingV2.step3.totalLabel', 'Ukupno mjesečno')}:{' '}
                  <span className="font-semibold text-foreground">{totalIncome.toFixed(2)} €</span>
                </p>
              )}
            </motion.div>
          )}

          {/* === STEP 4: SUMMARY + CHART === */}
          {step === 4 && (
            <motion.div
              key="step4"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="w-full max-w-md mt-4 space-y-5"
            >
              <div className="text-center space-y-2">
                <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                  <PartyPopper className="w-8 h-8 text-primary" />
                </div>
                <h2 className="text-2xl font-bold">
                  {t('onboardingV2.step4.title', 'Tvoja aplikacija je spremna')}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {t('onboardingV2.step4.subtitle', 'Evo prvog pregleda tvog budžeta.')}
                </p>
              </div>

              {chartData.length > 0 ? (
                <div className="rounded-2xl border border-border p-4 bg-card">
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={chartData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={45}
                          outerRadius={85}
                          paddingAngle={2}
                        >
                          {chartData.map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(v: number) => `${v.toFixed(2)} €`}
                          contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3 text-center">
                    <div className="rounded-lg bg-muted/50 p-2">
                      <div className="text-xs text-muted-foreground">{t('onboardingV2.step4.income', 'Prihodi')}</div>
                      <div className="text-base font-semibold text-primary">{totalIncome.toFixed(2)} €</div>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-2">
                      <div className="text-xs text-muted-foreground">{t('onboardingV2.step4.expense', 'Rashodi')}</div>
                      <div className="text-base font-semibold text-destructive">{totalExpense.toFixed(2)} €</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  {t('onboardingV2.step4.empty', 'Nisi unio iznose — možeš ih dodati kasnije u Budžetu.')}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <footer className="p-4 border-t bg-background/80 backdrop-blur-sm safe-area-bottom">
        <div className="max-w-md mx-auto flex gap-3">
          {step > 1 && (
            <Button variant="outline" onClick={handleBack} className="gap-2" disabled={saving}>
              <ChevronLeft className="w-4 h-4" />
              {t('common.back', 'Natrag')}
            </Button>
          )}
          <Button
            onClick={step === totalSteps ? handleComplete : handleNext}
            className="flex-1 gap-2"
            disabled={saving || !canAdvance()}
          >
            {step === totalSteps ? (
              <>
                <Sparkles className="w-4 h-4" />
                {saving
                  ? t('onboardingV2.saving', 'Spremam...')
                  : t('onboardingV2.finish', 'Pokreni aplikaciju')}
              </>
            ) : (
              <>
                {t('common.next', 'Dalje')}
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </Button>
        </div>
      </footer>
    </div>
  );
};

export default Onboarding;
