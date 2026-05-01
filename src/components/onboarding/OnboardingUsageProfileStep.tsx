/**
 * OnboardingUsageProfileStep — second onboarding step.
 *
 * Asks the user what they want to track:
 *   - 'finance_only'      → only personal finances (Projects tab is hidden)
 *   - 'finance_projects'  → finances + projects (full app)
 *
 * If the user picks 'finance_projects', a soft plan-comparison panel appears
 * at the bottom (Free / Pro / Business). The user can:
 *   - keep Free and continue (default)
 *   - tap Activate Pro/Business → opens the existing /paywall in a new tab so
 *     onboarding state is preserved; payment can also be done later.
 *
 * The selection is purely informational here — `Onboarding.tsx` reads the
 * value via `selected` and persists it on completion.
 */
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Wallet, FolderKanban, Check, Sparkles, Crown, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { UsageProfile } from '@/contexts/AppStateContext';

interface OnboardingUsageProfileStepProps {
  selected: UsageProfile;
  onSelect: (p: Exclude<UsageProfile, null>) => void;
  selectedPlan: 'free' | 'pro' | 'business';
  onSelectPlan: (p: 'free' | 'pro' | 'business') => void;
  onOpenPaywall: () => void;
}

export const OnboardingUsageProfileStep = ({
  selected,
  onSelect,
  selectedPlan,
  onSelectPlan,
  onOpenPaywall,
}: OnboardingUsageProfileStepProps) => {
  const { t } = useTranslation();

  const profiles: Array<{
    id: Exclude<UsageProfile, null>;
    icon: typeof Wallet;
    title: string;
    desc: string;
    recommended?: boolean;
  }> = [
    {
      id: 'finance_only',
      icon: Wallet,
      title: t('onboarding.usageProfile.financeOnly.label', 'Samo osobne financije'),
      desc: t(
        'onboarding.usageProfile.financeOnly.desc',
        'Praćenje prihoda, rashoda i budžeta. Idealno za osobnu upotrebu.'
      ),
      recommended: true,
    },
    {
      id: 'finance_projects',
      icon: FolderKanban,
      title: t('onboarding.usageProfile.financeProjects.label', 'Financije + projekti'),
      desc: t(
        'onboarding.usageProfile.financeProjects.desc',
        'Sve gore + vođenje projekata, klijenata, radnika i milestoneova. Za freelance, obrt i tvrtke.'
      ),
    },
  ];

  const plans: Array<{
    id: 'free' | 'pro' | 'business';
    icon: typeof Sparkles;
    name: string;
    price: string;
    bullets: string[];
    accent: string;
  }> = [
    {
      id: 'free',
      icon: Sparkles,
      name: t('onboarding.usageProfile.plan.free.name', 'Besplatno'),
      price: t('onboarding.usageProfile.plan.free.price', '0 €'),
      bullets: [
        t('onboarding.usageProfile.plan.free.b1', '1 aktivni projekt'),
        t('onboarding.usageProfile.plan.free.b2', 'Osnovne značajke'),
        t('onboarding.usageProfile.plan.free.b3', 'Bez naplate'),
      ],
      accent: 'border-border',
    },
    {
      id: 'pro',
      icon: Crown,
      name: t('onboarding.usageProfile.plan.pro.name', 'Pro'),
      price: t('onboarding.usageProfile.plan.pro.price', '4,99 €/mj'),
      bullets: [
        t('onboarding.usageProfile.plan.pro.b1', 'Neograničeni projekti'),
        t('onboarding.usageProfile.plan.pro.b2', 'Radnici i dnevnik rada'),
        t('onboarding.usageProfile.plan.pro.b3', 'AI prepoznavanje računa'),
      ],
      accent: 'border-primary/60',
    },
    {
      id: 'business',
      icon: Building2,
      name: t('onboarding.usageProfile.plan.business.name', 'Business'),
      price: t('onboarding.usageProfile.plan.business.price', '9,99 €/mj'),
      bullets: [
        t('onboarding.usageProfile.plan.business.b1', 'Više tvrtki / OIB-a'),
        t('onboarding.usageProfile.plan.business.b2', 'P&L analitika i izvješća'),
        t('onboarding.usageProfile.plan.business.b3', 'Tim i suradnici'),
      ],
      accent: 'border-amber-500/60',
    },
  ];

  return (
    <div className="w-full max-w-2xl space-y-6">
      <div className="text-center space-y-2">
        <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <Sparkles className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-2xl font-bold">
          {t('onboarding.usageProfile.title', 'Što želiš pratiti?')}
        </h1>
        <p className="text-muted-foreground">
          {t(
            'onboarding.usageProfile.subtitle',
            'Aplikaciju ćemo prilagoditi tvojim potrebama. Ovo možeš kasnije promijeniti u Postavkama.'
          )}
        </p>
      </div>

      {/* Profile cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {profiles.map((p) => {
          const isSelected = selected === p.id;
          const Icon = p.icon;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p.id)}
              className={cn(
                'p-4 rounded-2xl border-2 text-left transition-all',
                'min-h-[140px] flex flex-col gap-2',
                isSelected
                  ? 'border-primary bg-primary/5 shadow-sm'
                  : 'border-border hover:border-primary/40'
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className={cn(
                  'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                  isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                )}>
                  <Icon className="w-5 h-5" />
                </div>
                {isSelected && <Check className="w-5 h-5 text-primary" />}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-base">{p.title}</h3>
                  {p.recommended && (
                    <span className="text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                      {t('onboarding.usageProfile.financeOnly.recommended', 'Preporučeno')}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-1">{p.desc}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Plan comparison — only when projects chosen */}
      <AnimatePresence>
        {selected === 'finance_projects' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="pt-2 space-y-3">
              <div className="text-center">
                <h2 className="text-lg font-semibold">
                  {t('onboarding.usageProfile.plan.title', 'Odaberi plan')}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {t(
                    'onboarding.usageProfile.plan.subtitle',
                    'Možeš početi besplatno i nadograditi kasnije.'
                  )}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {plans.map((plan) => {
                  const isSel = selectedPlan === plan.id;
                  const Icon = plan.icon;
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => onSelectPlan(plan.id)}
                      className={cn(
                        'p-3 rounded-xl border-2 text-left transition-all flex flex-col gap-2',
                        isSel ? 'border-primary bg-primary/5' : `${plan.accent} hover:border-primary/40`
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <Icon className="w-4 h-4 text-primary" />
                        {isSel && <Check className="w-4 h-4 text-primary" />}
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{plan.name}</p>
                        <p className="text-xs text-muted-foreground">{plan.price}</p>
                      </div>
                      <ul className="space-y-1 text-[11px] text-muted-foreground">
                        {plan.bullets.map((b, i) => (
                          <li key={i} className="flex gap-1">
                            <Check className="w-3 h-3 text-primary shrink-0 mt-0.5" />
                            <span>{b}</span>
                          </li>
                        ))}
                      </ul>
                    </button>
                  );
                })}
              </div>

              {selectedPlan !== 'free' && (
                <div className="text-center">
                  <Button variant="outline" size="sm" onClick={onOpenPaywall} className="gap-2">
                    <Crown className="w-3.5 h-3.5" />
                    {t('onboarding.usageProfile.plan.activate', 'Aktiviraj odabrani plan')}
                  </Button>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {t(
                      'onboarding.usageProfile.plan.activateHint',
                      'Otvara plaćanje u novoj kartici — onboarding ostaje sačuvan.'
                    )}
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
