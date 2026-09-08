import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { useAppState, type UsageProfile } from '@/contexts/AppStateContext';
import { Sparkles } from 'lucide-react';
import logo from '@/assets/logo.webp';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { supabase } from '@/integrations/supabase/client';
import { useHaptics } from '@/hooks/useHaptics';
import { logFunnelEvent } from '@/lib/funnelTracking';
import { readAuthEntry } from '@/lib/authFunnel';
import { resolveSignupIntent } from '@/lib/signupIntent';
import { activateModuleTrial } from '@/lib/activateModuleTrial';
import { useSubscription } from '@/contexts/SubscriptionContext';

import { StepGreeting } from '@/components/onboarding/steps/StepGreeting';

// Onboarding skraćen na 1 korak: greeting. Po D1: "Spremni smo" ekran je
// uklonjen — greeting ide ravno u prvi guided event entry preko /home.
// Modul i budget setup ne ulaze u onboarding (vidi mem://features/onboarding-strategy).
const TOTAL_STEPS = 1;

const STEP_NAMES: Record<number, string> = {
  1: 'greeting',
};

const ATTEMPT_KEY = 'onboarding_attempt_count';
const SESSION_KEY = 'onboarding_session_id';

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
  const { checkSubscription } = useSubscription();

  const [step] = useState(1);
  const [saving, setSaving] = useState(false);

  const initialName = useMemo(() => {
    // Račun ima prednost: ime iz user metadata (preživi potvrdu maila) je
    // uvijek ime OVOG računa, dok localStorage može nositi ime prethodnog
    // korisnika na istom uređaju.
    const meta = (user?.user_metadata as { display_name?: unknown } | undefined)?.display_name;
    const fromMeta = typeof meta === 'string' ? meta.trim() : '';
    if (fromMeta) return fromMeta;
    return (localStorage.getItem('user_display_name') || '').trim();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [displayName, setDisplayName] = useState(initialName);

  // --- Telemetry ---
  const telemetryRef = useRef<{ sessionId: string; attempt: number } | null>(null);
  if (telemetryRef.current === null) {
    telemetryRef.current = initTelemetrySession();
  }
  const mountTimeRef = useRef<number>(performance.now());
  const stepEnterTimeRef = useRef<number>(performance.now());
  const outcomeRef = useRef<'completed' | 'skipped' | null>(null);
  const currentStepRef = useRef<number>(1);

  const hasValueForStepRef = useRef<(s: number) => boolean>(() => false);
  hasValueForStepRef.current = (s: number): boolean => {
    if (s === 1) return displayName.trim().length > 0;
    return true;
  };

  const baseMeta = () => ({
    session_id: telemetryRef.current!.sessionId,
    attempt: telemetryRef.current!.attempt,
  });

  useEffect(() => {
    try {
      const FIRED_KEY = 'onboarding_started_fired_' + telemetryRef.current!.sessionId;
      if (sessionStorage.getItem(FIRED_KEY) === '1') return;
      sessionStorage.setItem(FIRED_KEY, '1');
    } catch {
      /* noop */
    }
    logFunnelEvent('onboarding_started', { ...baseMeta(), entry: 'mount' }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const canAdvance = () => displayName.trim().length > 0;

  const handleComplete = async () => {
    if (!user) {
      showError(t('errors.generic', 'Došlo je do greške'));
      return;
    }
    lightTap().catch(() => {});
    setSaving(true);
    try {
      const trimmedName = displayName.trim();
      const profile: UsageProfile = 'finance_only';

      const { error: rpcErr } = await supabase.rpc('complete_onboarding', {
        p_display_name: trimmedName || null,
        p_usage_profile: profile,
        p_income: null,
        p_budget_name: t('onboardingV3.defaultBudgetName', 'Mjesečni budžet'),
        p_categories: [] as any,
      });
      if (rpcErr) throw rpcErr;

      localStorage.setItem('onboarding_completed', 'true');
      localStorage.setItem('usage_profile', profile);
      if (trimmedName) {
        localStorage.setItem('user_display_name', trimmedName);
        setContextDisplayName(trimmedName);
      }
      setUsageProfile(profile);

      // Namjera s prodajne stranice /projekti — račun (user metadata) ili
      // atribucija ulaza u istom tabu (Google/Apple).
      const intent = resolveSignupIntent(user, readAuthEntry());
      let trialAutostarted = false;
      if (intent === 'projects') {
        // VAŽNO redoslijed: proba i osvježavanje pretplate PRIJE
        // setOnboardingCompleted(true) — inače /onboarding ruta odmah
        // preusmjeri na /home i nakratko se montira pogrešan ekran.
        try {
          const payload = await activateModuleTrial('projekti');
          trialAutostarted = !!payload.activated && !payload.already_used;
          await checkSubscription();
        } catch (e) {
          console.warn('[Onboarding] projekti trial activation failed', e);
        }
      }

      outcomeRef.current = 'completed';
      logStepCompleted(currentStepRef.current);
      logFunnelEvent('onboarding_complete', {
        ...baseMeta(),
        usage_profile: profile,
        has_income: false,
        expense_categories: 0,
        intent,
        trial_autostarted: trialAutostarted,
        total_duration_ms: Math.round(performance.now() - mountTimeRef.current),
      }).catch(() => {});

      successVibration().catch(() => {});
      showSuccess(t('onboardingV3.doneToast', 'Aplikacija je spremna!'));
      // setOnboardingCompleted i navigacija u ISTOM sinkronom koraku — bez
      // awaita između, da se /home nikad ne montira za 'projects' namjeru.
      if (intent === 'projects') {
        setOnboardingCompleted(true);
        navigate('/projects', { state: { openNewProject: true }, replace: true });
      } else {
        setOnboardingCompleted(true);
        navigate('/home', { replace: true });
      }
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
          <img src={logo} alt="Centar" className="w-10 h-10 object-contain" />
          <span className="font-semibold text-lg">Centar</span>
        </div>
      </header>

      {/* Content — centriran */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 min-h-0">
        <AnimatePresence mode="wait">
          {step === 1 && (
            <StepGreeting displayName={displayName} onChange={setDisplayName} prefilled={initialName !== ''} />
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <footer className="p-4 border-t bg-background/80 backdrop-blur-sm safe-area-bottom">
        <div className="max-w-md mx-auto">
          <Button
            onClick={handleComplete}
            className="w-full gap-2 min-h-[44px]"
            disabled={saving || !canAdvance()}
          >
            <Sparkles className="w-4 h-4" />
            {saving
              ? t('onboardingV3.saving', 'Spremam...')
              : t('onboardingV3.startCta', 'Krenimo')}
          </Button>
        </div>
      </footer>
    </div>
  );
};

export default Onboarding;
