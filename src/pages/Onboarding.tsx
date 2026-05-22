import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { useAppState, type UsageProfile } from '@/contexts/AppStateContext';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import logo from '@/assets/logo.webp';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { supabase } from '@/integrations/supabase/client';
import { useHaptics } from '@/hooks/useHaptics';

import { StepGreeting } from '@/components/onboarding/steps/StepGreeting';
import { StepUsageProfile } from '@/components/onboarding/steps/StepUsageProfile';
import { StepIncome } from '@/components/onboarding/steps/StepIncome';
import {
  StepBudgetSliders,
  SLIDER_PRESETS,
  type PercentMap,
  type SliderKey,
} from '@/components/onboarding/steps/StepBudgetSliders';
import { StepReady } from '@/components/onboarding/steps/StepReady';

const TOTAL_STEPS = 5;

const INITIAL_PERCENTS: PercentMap = {
  rent: 0,
  food: 0,
  car: 0,
  utilities: 0,
  other: 0,
};

const Onboarding = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { setOnboardingCompleted, setDisplayName: setContextDisplayName, setUsageProfile } = useAppState();
  const { lightTap, successVibration } = useHaptics();

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  const initialName = useMemo(
    () => (localStorage.getItem('user_display_name') || '').trim(),
    [],
  );
  const [displayName, setDisplayName] = useState(initialName);
  const [usageProfile, setUsageProfileLocal] = useState<UsageProfile>(null);
  const [income, setIncome] = useState<string>('');
  const [percents, setPercents] = useState<PercentMap>(INITIAL_PERCENTS);

  // Namjerno NE prefillamo iz profiles.display_name — DB trigger handle_new_user
  // automatski upiše ime iz prefiksa maila (npr. "Hr Akrobat"), pa bi async fetch
  // prepisao ono što korisnik upravo tipka u Step 1.

  const incomeNum = parseFloat(income) || 0;
  const hasIncome = incomeNum > 0;

  const selectedCategories = SLIDER_PRESETS.filter((p) => (percents[p.key] || 0) > 0);

  const progress = (step / TOTAL_STEPS) * 100;

  const goBack = () => {
    lightTap().catch(() => {});
    setStep((s) => Math.max(1, s - 1));
  };
  const goNext = () => {
    lightTap().catch(() => {});
    setStep((s) => Math.min(TOTAL_STEPS, s + 1));
  };

  const handleUsageSelect = (p: Exclude<UsageProfile, null>) => {
    setUsageProfileLocal(p);
    lightTap().catch(() => {});
    // Auto-advance
    setTimeout(() => setStep((s) => Math.min(TOTAL_STEPS, s + 1)), 220);
  };

  const handleSkip = () => {
    // Završi kasnije: označi onboarding kao gotov + minimalni defaulti
    setOnboardingCompleted(true);
    localStorage.setItem('onboarding_completed', 'true');
    if (displayName.trim()) {
      localStorage.setItem('user_display_name', displayName.trim());
      setContextDisplayName(displayName.trim());
    }
    const profile: UsageProfile = usageProfile ?? 'finance_only';
    setUsageProfile(profile);
    localStorage.setItem('usage_profile', profile);
    navigate('/home', { replace: true });
  };

  const canAdvance = () => {
    if (step === 1) return displayName.trim().length > 0;
    if (step === 2) return usageProfile !== null;
    return true; // koraci 3 i 4 su opcionalni
  };

  const handleComplete = async () => {
    if (!user) {
      showError(t('errors.generic', 'Došlo je do greške'));
      return;
    }
    setSaving(true);
    try {
      const trimmedName = displayName.trim();
      const profile: UsageProfile = usageProfile ?? 'finance_only';

      // 1) Profile
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

      // 2) Budget + categories (samo ako ima prihoda i barem 1 kategorije s > 0%)
      if (hasIncome && selectedCategories.length > 0) {
        const totalExpense = selectedCategories.reduce(
          (s, p) => s + (incomeNum * percents[p.key]) / 100,
          0,
        );

        const { data: budget, error: budgetErr } = await supabase
          .from('budget_plans')
          .insert({
            user_id: user.id,
            name: t('onboardingV3.defaultBudgetName', 'Mjesečni budžet'),
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
          const rows = selectedCategories.map((p) => ({
            budget_id: budget.id,
            category: p.key as SliderKey,
            limit_amount: (incomeNum * percents[p.key]) / 100,
            icon: p.emoji,
            color: p.color,
          }));
          const { error: catErr } = await supabase.from('budget_categories').insert(rows);
          if (catErr) throw catErr;
        }
      }

      // 3) Lokalno stanje
      localStorage.setItem('onboarding_completed', 'true');
      localStorage.setItem('show_welcome_animation', 'true');
      localStorage.setItem('usage_profile', profile);
      if (trimmedName) {
        localStorage.setItem('user_display_name', trimmedName);
        setContextDisplayName(trimmedName);
      }
      setUsageProfile(profile);
      setOnboardingCompleted(true);

      // 4) Funnel telemetry
      import('@/lib/funnelTracking')
        .then(({ logFunnelEvent }) => logFunnelEvent('onboarding_complete', {
          usage_profile: profile,
          has_income: hasIncome,
          expense_categories: selectedCategories.length,
        }))
        .catch(() => {});

      successVibration().catch(() => {});
      showSuccess(t('onboardingV3.doneToast', 'Aplikacija je spremna!'));
      navigate('/home', { replace: true });
    } catch (err) {
      console.error('Onboarding completion error:', err);
      showError(t('errors.generic', 'Došlo je do greške'));
    } finally {
      setSaving(false);
    }
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
          {/* Step dots */}
          <div className="flex items-center gap-1.5">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i + 1 === step
                    ? 'w-5 bg-primary'
                    : i + 1 < step
                      ? 'w-1.5 bg-primary'
                      : 'w-1.5 bg-muted'
                }`}
              />
            ))}
          </div>
          {step < TOTAL_STEPS && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSkip}
              className="text-xs h-8"
              disabled={saving}
            >
              {t('onboardingV3.finishLater', 'Završi kasnije')}
            </Button>
          )}
        </div>
      </header>

      {/* Progress (slim, ispod headera) */}
      <div className="h-0.5 bg-muted">
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
          {step === 1 && (
            <StepGreeting displayName={displayName} onChange={setDisplayName} />
          )}
          {step === 2 && (
            <StepUsageProfile selected={usageProfile} onSelect={handleUsageSelect} />
          )}
          {step === 3 && (
            <StepIncome income={income} onChange={setIncome} />
          )}
          {step === 4 && (
            <StepBudgetSliders
              percents={percents}
              income={incomeNum}
              onChange={setPercents}
            />
          )}
          {step === 5 && (
            <StepReady
              displayName={displayName}
              hasIncome={hasIncome}
              expenseCategoriesCount={selectedCategories.length}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <footer className="p-4 border-t bg-background/80 backdrop-blur-sm safe-area-bottom">
        <div className="max-w-md mx-auto flex gap-3">
          {step > 1 && (
            <Button variant="outline" onClick={goBack} className="gap-2" disabled={saving}>
              <ChevronLeft className="w-4 h-4" />
              {t('common.back', 'Natrag')}
            </Button>
          )}
          <Button
            onClick={step === TOTAL_STEPS ? handleComplete : goNext}
            className="flex-1 gap-2 min-h-[44px]"
            disabled={saving || !canAdvance()}
          >
            {step === TOTAL_STEPS ? (
              <>
                <Sparkles className="w-4 h-4" />
                {saving
                  ? t('onboardingV3.saving', 'Spremam...')
                  : t('onboardingV3.finish', 'Uđi u aplikaciju')}
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
