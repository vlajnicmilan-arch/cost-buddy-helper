import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Wallet, FolderKanban, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UsageProfile } from '@/contexts/AppStateContext';

type Profile = Exclude<UsageProfile, null>;

interface Props {
  selected: UsageProfile;
  onSelect: (p: Profile) => void;
}

export const StepUsageProfile = ({ selected, onSelect }: Props) => {
  const { t } = useTranslation();

  const profiles: Array<{
    id: Profile;
    icon: typeof Wallet;
    emoji: string;
    title: string;
    desc: string;
  }> = [
    {
      id: 'finance_only',
      icon: Wallet,
      emoji: '💰',
      title: t('onboardingV3.usage.financeOnly.title', 'Samo moje financije'),
      desc: t(
        'onboardingV3.usage.financeOnly.desc',
        'Pratim plaću, troškove i štednju.',
      ),
    },
    {
      id: 'finance_projects',
      icon: FolderKanban,
      emoji: '🧰',
      title: t('onboardingV3.usage.financeProjects.title', 'Financije + projekti'),
      desc: t(
        'onboardingV3.usage.financeProjects.desc',
        'Imam obrt, renoviram stan, vodim klijente...',
      ),
    },
  ];

  return (
    <motion.div
      key="step-usage"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      className="w-full max-w-md mt-4 space-y-6"
    >
      <div className="text-center space-y-2">
        <h2 className="text-xl font-bold">
          {t('onboardingV3.usage.title', 'Za što ćeš koristiti aplikaciju?')}
        </h2>
        <p className="text-xs text-muted-foreground">
          {t('onboardingV3.usage.subtitle', 'Prilagodit ću ti izgled aplikacije. Možeš promijeniti kasnije.')}
        </p>
      </div>

      <div className="space-y-3">
        {profiles.map((p) => {
          const isSelected = selected === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p.id)}
              className={cn(
                'w-full p-4 rounded-2xl border-2 text-left transition-all min-h-[88px] flex items-center gap-4',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isSelected
                  ? 'border-primary bg-primary/5 shadow-sm scale-[1.01]'
                  : 'border-border hover:border-primary/40 active:scale-[0.99]',
              )}
            >
              <div className="text-3xl shrink-0" aria-hidden>{p.emoji}</div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-base">{p.title}</h3>
                <p className="text-sm text-muted-foreground mt-0.5">{p.desc}</p>
              </div>
              {isSelected && <Check className="w-5 h-5 text-primary shrink-0" />}
            </button>
          );
        })}
      </div>
    </motion.div>
  );
};
