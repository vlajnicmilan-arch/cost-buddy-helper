import { useState, useEffect, useMemo, useRef } from 'react';
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
import { logFunnelEvent } from '@/lib/funnelTracking';

import { StepGreeting } from '@/components/onboarding/steps/StepGreeting';
import { StepReady } from '@/components/onboarding/steps/StepReady';

// Onboarding skraćen na 2 koraka: greeting + ready. usage_profile / income /
// budget sliders su namjerno izvan ranog flowa — moduli i budžet dolaze kroz
// app tek nakon prvog stvarnog unosa (guided home). Vidi mem://features/onboarding-strategy.
const TOTAL_STEPS = 2;

const STEP_NAMES: Record<number, string> = {
  1: 'greeting',
  2: 'ready',
};

const ATTEMPT_KEY = 'onboarding_attempt_count';
const SESSION_KEY = 'onboarding_session_id';

const INITIAL_PERCENTS: PercentMap = {
  rent: 0,
  food: 0,
  car: 0,
  utilities: 0,
  other: 0,
};

const initTelemetrySession = (): { sessionId: string; attempt: number } => {
  let sessionId = '';
  let attempt = 1;
  try {
    sessionId = sessionStorage.getItem(SESSION_KEY) || '';
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      sessionStorage.setItem(SESSION_KEY, sessionId);
      const prev = parseInt(localStorage.getItem(ATTEMPT_KEY) || '0', 10);
      attempt = (Number.isFinite(prev) ? prev : 0) + 1;
      localStorage.setItem(ATTEMPT_KEY, String(attempt));
    } else {
      const stored = parseInt(localStorage.getItem(ATTEMPT_KEY) || '1', 10);
      attempt = Number.isFinite(stored) && stored > 0 ? stored : 1;
    }
  } catch {
    sessionId = crypto.randomUUID();
  }
  return { sessionId, attempt };
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

  // --- Telemetry refs (stabilne kroz cijeli mount) ---
  const telemetryRef = useRef<{ sessionId: string; attempt: number } | null>(null);
  if (telemetryRef.current === null) {
    telemetryRef.current = initTelemetrySession();
  }
  const mountTimeRef = useRef<number>(performance.now());
  const stepEnterTimeRef = useRef<number>(performance.now());
  const outcomeRef = useRef<'completed' | 'skipped' | null>(null);
  const currentStepRef = useRef<number>(1);

  // has_value po koraku — koristi najsvježije vrijednosti
  const hasValueForStepRef = useRef<(s: number) => boolean>(() => false);
  hasValueForStepRef.current = (s: number): boolean => {
    if (s === 1) return displayName.trim().length > 0;
    if (s === 2) return usageProfile !== null;
    if (s === 3) return incomeNum > 0;
    if (s === 4) return selectedCategories.length > 0;
    return true;
  };

  const baseMeta = () => ({
    session_id: telemetryRef.current!.sessionId,
    attempt: telemetryRef.current!.attempt,
  });

  // onboarding_started — jednom po mountu (sessionStorage flag spriječi dvostruko firanje pri remountu unutar iste sesije)
  useEffect(() => {
    try {
      const FIRED_KEY = 'onboarding_started_fired_' + telemetryRef.current!.sessionId;
      if (sessionStorage.getItem(FIRED_KEY) === '1') return;
      sessionStorage.setItem(FIRED_KEY, '1');
    } catch {
      /* noop — sve-jedno emitiramo */
    }
    logFunnelEvent('onboarding_started', { ...baseMeta(), entry: 'mount' }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // step_viewed — pri svakom ulasku u korak (uključujući Back)
  useEffect(() => {
    currentStepRef.current = step;
    stepEnterTimeRef.current = performance.now();
    logFunnelEvent('onboarding_step_viewed', {
      ...baseMeta(),
      step,
      step_name: STEP_NAMES[step] ?? String(step),
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // unmount → abandoned (samo ako nije bio completed/skipped)
  useEffect(() => {
    return () => {
      if (outcomeRef.current !== null) return;
      logFunnelEvent('onboarding_abandoned', {
        ...baseMeta(),
        last_step: currentStepRef.current,
        last_step_name: STEP_NAMES[currentStepRef.current] ?? String(currentStepRef.current),
        time_spent_ms: Math.round(performance.now() - mountTimeRef.current),
      }).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logStepCompleted = (fromStep: number) => {
    const duration_ms = Math.round(performance.now() - stepEnterTimeRef.current);
    logFunnelEvent('onboarding_step_completed', {
      ...baseMeta(),
      step: fromStep,
      step_name: STEP_NAMES[fromStep] ?? String(fromStep),
      duration_ms,
      has_value: hasValueForStepRef.current(fromStep),
    }).catch(() => {});
  };

  const goBack = () => {
    lightTap().catch(() => {});
    setStep((s) => Math.max(1, s - 1));
  };
  const goNext = () => {
    lightTap().catch(() => {});
    logStepCompleted(currentStepRef.current);
    setStep((s) => Math.min(TOTAL_STEPS, s + 1));
  };

  const handleSkip = () => {
    outcomeRef.current = 'skipped';
    logFunnelEvent('onboarding_step_skipped', {
      ...baseMeta(),
      step: currentStepRef.current,
      step_name: STEP_NAMES[currentStepRef.current] ?? String(currentStepRef.current),
      reason: 'finish_later',
      time_spent_ms: Math.round(performance.now() - mountTimeRef.current),
    }).catch(() => {});
    // Završi kasnije: označi onboarding kao gotov + minimalni defaulti.
    // usage_profile = 'finance_only' default (modul gate zamijenjen u Settings).
    setOnboardingCompleted(true);
    localStorage.setItem('onboarding_completed', 'true');
    if (displayName.trim()) {
      localStorage.setItem('user_display_name', displayName.trim());
      setContextDisplayName(displayName.trim());
    }
    const profile: UsageProfile = 'finance_only';
    setUsageProfile(profile);
    localStorage.setItem('usage_profile', profile);
    navigate('/home', { replace: true });
  };

  const canAdvance = () => {
    if (step === 1) return displayName.trim().length > 0;
    return true;
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

      // Atomic RPC — profile upsert + (opcionalno) budget + kategorije u jednoj transakciji.
      // Sprječava polu-stanje kada bi neki od 3 zasebna upita pao (profil označen kao
      // completed, ali budžet ostao nestvoren — ili budžet bez kategorija).
      const categoriesPayload =
        hasIncome && selectedCategories.length > 0
          ? selectedCategories.map((p) => ({
              category: p.key as SliderKey,
              limit_amount: (incomeNum * percents[p.key]) / 100,
              icon: p.emoji,
              color: p.color,
            }))
          : [];

      const { error: rpcErr } = await supabase.rpc('complete_onboarding', {
        p_display_name: trimmedName || null,
        p_usage_profile: profile,
        p_income: hasIncome ? incomeNum : null,
        p_budget_name: t('onboardingV3.defaultBudgetName', 'Mjesečni budžet'),
        p_categories: categoriesPayload as any,
      });
      if (rpcErr) throw rpcErr;


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

      // 4) Funnel telemetry — označi outcome PRIJE async loga da unmount handler ne ispali abandoned
      outcomeRef.current = 'completed';
      // step_completed za zadnji korak (Ready) — finish CTA
      logStepCompleted(currentStepRef.current);
      logFunnelEvent('onboarding_complete', {
        ...baseMeta(),
        usage_profile: profile,
        has_income: hasIncome,
        expense_categories: selectedCategories.length,
        total_duration_ms: Math.round(performance.now() - mountTimeRef.current),
      }).catch(() => {});

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
            <StepReady
              displayName={displayName}
              hasIncome={false}
              expenseCategoriesCount={0}
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
