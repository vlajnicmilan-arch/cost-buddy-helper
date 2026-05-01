import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslation } from 'react-i18next';
import { useStorage } from '@/contexts/StorageContext';
import { useAuth } from '@/hooks/useAuth';
import { useAppState } from '@/contexts/AppStateContext';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import { OnboardingPaymentSourceCard } from '@/components/onboarding/OnboardingPaymentSourceCard';
import { CardScannerDialog } from '@/components/onboarding/CardScannerDialog';
import { OnboardingUsageProfileStep } from '@/components/onboarding/OnboardingUsageProfileStep';
import { CustomPaymentSource, DEFAULT_PAYMENT_ICONS, DEFAULT_PAYMENT_COLORS } from '@/types/customPaymentSource';
import { ChevronRight, ChevronLeft, User, Wallet, CreditCard, Briefcase, Gift, Sparkles, Check, Plus, ScanLine } from 'lucide-react';
import logo from '@/assets/logo.webp';
import { showError } from '@/hooks/useStatusFeedback';
import { supabase } from '@/integrations/supabase/client';
import type { UsageProfile } from '@/contexts/AppStateContext';


interface PaymentSourceSetup {
  name: string;
  icon: string;
  color: string;
  balance: number;
  cards: { card_name: string; last_four_digits: string; card_type?: string }[];
}

const getPresetSources = (t: (key: string) => string) => [
  { id: 'bank', name: t('onboarding.presets.bank'), icon: '🏦', color: '#3b82f6', description: t('onboarding.presets.bankDesc') },
  { id: 'cash', name: t('onboarding.presets.cash'), icon: '💵', color: '#22c55e', description: t('onboarding.presets.cashDesc') },
  { id: 'savings', name: t('onboarding.presets.savings'), icon: '🏧', color: '#8b5cf6', description: t('onboarding.presets.savingsDesc') },
  { id: 'paypal', name: t('onboarding.presets.paypal'), icon: '🅿️', color: '#003087', description: t('onboarding.presets.paypalDesc') },
  { id: 'revolut', name: t('onboarding.presets.revolut'), icon: '💳', color: '#0666eb', description: t('onboarding.presets.revolutDesc') },
];

const getIncomeSources = (t: (key: string) => string) => [
  { id: 'salary', name: t('onboarding.presets.salary'), icon: '💼', color: '#22c55e' },
  { id: 'freelance', name: t('onboarding.presets.freelance'), icon: '💻', color: '#6366f1' },
  { id: 'reward', name: t('onboarding.presets.reward'), icon: '🎁', color: '#f59e0b' },
  { id: 'investment', name: t('onboarding.presets.investment'), icon: '📈', color: '#10b981' },
];

const Onboarding = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { storageMode } = useStorage();
  const { user } = useAuth();
  const PRESET_SOURCES = getPresetSources(t);
  const INCOME_SOURCES = getIncomeSources(t);
  const { addCustomPaymentSource, addCard } = useCustomPaymentSources();
  const { setOnboardingCompleted, setDisplayName: setContextDisplayName, setUsageProfile } = useAppState();

  const [step, setStep] = useState(1);
  const [usageProfileChoice, setUsageProfileChoice] = useState<UsageProfile>(null);
  const [planChoice, setPlanChoice] = useState<'free' | 'pro' | 'business'>('free');
  const [displayName, setDisplayName] = useState(() => {
    // Pre-fill from context if user entered name during signup
    return localStorage.getItem('user_display_name') || '';
  });
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [customSources, setCustomSources] = useState<PaymentSourceSetup[]>([]);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [currentScanTarget, setCurrentScanTarget] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const isLocalMode = storageMode === 'local' && !user;

  // Auto-skip step 1 if name is already known from signup
  useEffect(() => {
    if (displayName.trim() && step === 1) {
      setStep(2);
    }
  }, []); // Only on mount

  // Onboarding gate is now handled centrally by App.tsx.
  // If onboardingCompleted is true, App.tsx will redirect to /home before rendering this page.

  const handleNext = () => {
    if (step === 1 && !displayName.trim()) {
      showError(t('onboarding.nameRequired', 'Molimo unesite svoje ime'));
      return;
    }
    if (step === 2 && !usageProfileChoice) {
      showError(t('onboarding.usageProfile.required', 'Molimo odaberi što želiš pratiti'));
      return;
    }
    setStep(step + 1);
  };

  const handleBack = () => {
    setStep(step - 1);
  };

  const handleOpenPaywall = () => {
    // Open paywall in a new tab so onboarding state is preserved.
    window.open('/paywall', '_blank');
  };

  const toggleSource = (sourceId: string) => {
    setSelectedSources(prev => 
      prev.includes(sourceId) 
        ? prev.filter(id => id !== sourceId)
        : [...prev, sourceId]
    );
  };

  const addCustomSource = () => {
    setCustomSources([...customSources, {
      name: '',
      icon: '💳',
      color: DEFAULT_PAYMENT_COLORS[Math.floor(Math.random() * DEFAULT_PAYMENT_COLORS.length)],
      balance: 0,
      cards: []
    }]);
  };

  const updateCustomSource = (index: number, updates: Partial<PaymentSourceSetup>) => {
    const newSources = [...customSources];
    newSources[index] = { ...newSources[index], ...updates };
    setCustomSources(newSources);
  };

  const removeCustomSource = (index: number) => {
    setCustomSources(customSources.filter((_, i) => i !== index));
  };

  const openCardScanner = (sourceIndex: number) => {
    setCurrentScanTarget(sourceIndex);
    setScannerOpen(true);
  };

  const handleCardScanned = (cardType: string) => {
    if (currentScanTarget !== null) {
      const source = customSources[currentScanTarget];
      const newCards = [...source.cards, { card_name: cardType, last_four_digits: '', card_type: cardType }];
      updateCustomSource(currentScanTarget, { cards: newCards });
    }
    setScannerOpen(false);
    setCurrentScanTarget(null);
  };

  const handleComplete = async () => {
    setSaving(true);
    try {
      // Save display name
      if (isLocalMode) {
        localStorage.setItem('user_display_name', displayName.trim());
      } else if (user) {
        await supabase
          .from('profiles')
          .upsert({
            user_id: user.id,
            display_name: displayName.trim(),
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id' });
      }

      // Create preset payment sources
      for (const sourceId of selectedSources) {
        const preset = PRESET_SOURCES.find(s => s.id === sourceId);
        if (preset) {
          await addCustomPaymentSource({
            name: preset.name,
            icon: preset.icon,
            color: preset.color,
            balance: 0,
            description: preset.description
          });
        }
      }

      // Create custom payment sources with cards
      for (const source of customSources) {
        if (source.name.trim()) {
          const newSource = await addCustomPaymentSource({
            name: source.name.trim(),
            icon: source.icon,
            color: source.color,
            balance: source.balance,
            description: undefined
          });

          // Add cards to the source
          if (newSource && source.cards.length > 0) {
            for (const card of source.cards) {
              if (card.last_four_digits) {
                await addCard(newSource.id, {
                  card_name: card.card_name,
                  last_four_digits: card.last_four_digits,
                  card_type: card.card_type
                });
              }
            }
          }
        }
      }

      localStorage.setItem('onboarding_completed', 'true');
      localStorage.setItem('show_welcome_animation', 'true');
      localStorage.setItem('pwa-auto-update', 'true');
      // Persist usage profile (default to finance_only if user somehow skipped step 2)
      const profileToSave = usageProfileChoice ?? 'finance_only';
      localStorage.setItem('usage_profile', profileToSave);
      setUsageProfile(profileToSave);
      if (displayName.trim()) setContextDisplayName(displayName.trim());
      setOnboardingCompleted(true);
      // Funnel: log onboarding completion (best-effort)
      import('@/lib/funnelTracking')
        .then(({ logFunnelEvent }) => logFunnelEvent('onboarding_complete', {
          selected_sources: selectedSources.length,
          custom_sources: customSources.length,
          usage_profile: profileToSave,
          plan_choice: planChoice,
        }))
        .catch(() => {});
      navigate('/home', { replace: true });
    } catch (error) {
      console.error('Onboarding error:', error);
      showError(t('errors.generic', 'Došlo je do greške'));
    } finally {
      setSaving(false);
    }
  };

  const totalSteps = 4;
  const progress = (step / totalSteps) * 100;

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      {/* Header */}
      <header className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={logo} alt="V&M Balance" className="w-10 h-10 object-contain" />
          <span className="font-semibold text-lg">V&M Balance</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{step}/{totalSteps}</span>
        </div>
      </header>

      {/* Progress bar */}
      <div className="h-1 bg-muted">
        <motion.div 
          className="h-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="w-full max-w-md space-y-8"
            >
              <div className="text-center space-y-2">
                <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <User className="w-8 h-8 text-primary" />
                </div>
                <h1 className="text-2xl font-bold">{t('onboarding.welcomeTitle', 'Dobrodošli!')}</h1>
                <p className="text-muted-foreground">
                  {t('onboarding.welcomeDescription', 'Kako vas možemo zvati?')}
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">{t('onboarding.yourName', 'Vaše ime')}</Label>
                  <Input
                    id="name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder={t('onboarding.namePlaceholder', 'npr. Marko')}
                    className="text-lg h-12"
                    autoFocus
                  />
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  {t('onboarding.nameUsage', 'Ovo ime će se koristiti za personalizirane poruke u aplikaciji.')}
                </p>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="w-full max-w-lg space-y-6"
            >
              <div className="text-center space-y-2">
                <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Wallet className="w-8 h-8 text-primary" />
                </div>
                <h1 className="text-2xl font-bold">{t('onboarding.sourcesTitle', 'Postavite izvore plaćanja')}</h1>
                <p className="text-muted-foreground">
                  {t('onboarding.sourcesDescription', 'Odaberite uobičajene izvore ili dodajte vlastite')}
                </p>
              </div>

              {/* Preset sources */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {PRESET_SOURCES.map((source) => (
                  <button
                    key={source.id}
                    onClick={() => toggleSource(source.id)}
                    className={`p-3 rounded-xl border-2 transition-all text-left ${
                      selectedSources.includes(source.id)
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span 
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm"
                        style={{ backgroundColor: source.color }}
                      >
                        {source.icon}
                      </span>
                      {selectedSources.includes(source.id) && (
                        <Check className="w-4 h-4 text-primary ml-auto" />
                      )}
                    </div>
                    <p className="font-medium text-sm">{source.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{source.description}</p>
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-center">
                <Button variant="outline" onClick={addCustomSource} className="gap-2">
                  <Plus className="w-4 h-4" />
                  {t('onboarding.addCustomSource', 'Dodaj vlastiti izvor')}
                </Button>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="w-full max-w-lg space-y-6"
            >
              <div className="text-center space-y-2">
                <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <CreditCard className="w-8 h-8 text-primary" />
                </div>
                <h1 className="text-2xl font-bold">{t('onboarding.cardsTitle', 'Dodajte kartice')}</h1>
                <p className="text-muted-foreground">
                  {t('onboarding.cardsDescription', 'Skenirajte karticu za automatsko prepoznavanje ili unesite ručno')}
                </p>
              </div>

              {customSources.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">
                    {t('onboarding.noCustomSources', 'Nemate prilagođenih izvora s karticama.')}
                  </p>
                  <Button variant="outline" onClick={addCustomSource} className="gap-2">
                    <Plus className="w-4 h-4" />
                    {t('onboarding.addSourceWithCard', 'Dodaj izvor s karticom')}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4 max-h-[50vh] overflow-y-auto">
                  {customSources.map((source, index) => (
                    <OnboardingPaymentSourceCard
                      key={index}
                      source={source}
                      onUpdate={(updates) => updateCustomSource(index, updates)}
                      onRemove={() => removeCustomSource(index)}
                      onScanCard={() => openCardScanner(index)}
                    />
                  ))}
                  <Button variant="ghost" onClick={addCustomSource} className="w-full gap-2">
                    <Plus className="w-4 h-4" />
                    {t('onboarding.addAnotherSource', 'Dodaj još jedan izvor')}
                  </Button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer navigation */}
      <footer className="p-4 border-t bg-background/80 backdrop-blur-sm">
        <div className="max-w-md mx-auto flex gap-3">
          {step > 1 && (
            <Button variant="outline" onClick={handleBack} className="gap-2">
              <ChevronLeft className="w-4 h-4" />
              {t('common.back', 'Natrag')}
            </Button>
          )}
          <Button 
            onClick={step === totalSteps ? handleComplete : handleNext} 
            className="flex-1 gap-2"
            disabled={saving}
          >
            {step === totalSteps ? (
              <>
                <Sparkles className="w-4 h-4" />
                {saving ? t('common.saving', 'Spremanje...') : t('onboarding.startUsing', 'Započni koristiti')}
              </>
            ) : (
              <>
                {t('common.next', 'Dalje')}
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </Button>
        </div>
        {step < totalSteps && (
          <div className="max-w-md mx-auto mt-2">
            <button 
              onClick={async () => {
                setSaving(true);
                try {
                  // Save a default name if none provided
                  const nameToSave = displayName.trim() || 'Korisnik';
                  if (isLocalMode) {
                    localStorage.setItem('user_display_name', nameToSave);
                  } else if (user) {
                    await supabase
                      .from('profiles')
                      .upsert({
                        user_id: user.id,
                        display_name: nameToSave,
                        updated_at: new Date().toISOString()
                      }, { onConflict: 'user_id' });
                  }
                  localStorage.setItem('onboarding_completed', 'true');
                  localStorage.setItem('show_welcome_animation', 'true');
                  localStorage.setItem('pwa-auto-update', 'true');
                  setOnboardingCompleted(true);
                  navigate('/home', { replace: true });
                } catch (error) {
                  console.error('Skip error:', error);
                  // Still complete onboarding even if save fails
                  localStorage.setItem('onboarding_completed', 'true');
                  localStorage.setItem('show_welcome_animation', 'true');
                  localStorage.setItem('pwa-auto-update', 'true');
                  setOnboardingCompleted(true);
                  navigate('/home', { replace: true });
                } finally {
                  setSaving(false);
                }
              }}
              disabled={saving}
              className="text-xs text-muted-foreground hover:text-foreground w-full text-center disabled:opacity-50"
            >
              {saving ? t('common.loading', 'Učitavanje...') : t('onboarding.skipForNow', 'Preskoči za sada')}
            </button>
          </div>
        )}
      </footer>

      {/* Card Scanner Dialog */}
      <CardScannerDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onCardDetected={handleCardScanned}
      />
    </div>
  );
};

export default Onboarding;
