/**
 * ProjectOnboardingHint — first-time activation banner shown above the
 * EmptyState when a user has zero projects. Offers 3 quick-start templates
 * that pre-populate the ProjectDialog. Dismissible (per-user, localStorage).
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, Wrench, Briefcase, Home, ChevronRight } from 'lucide-react';

export interface QuickStartSuggestion {
  id: 'renovation' | 'client' | 'personal';
  icon: React.ReactNode;
  name: string;
  description: string;
  color: string;
  emoji: string;
  defaultBudget: number;
}

interface ProjectOnboardingHintProps {
  onPickSuggestion: (s: QuickStartSuggestion) => void;
}

const STORAGE_KEY = 'project_onboarding_hint_dismissed';

export const ProjectOnboardingHint = ({ onPickSuggestion }: ProjectOnboardingHintProps) => {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(STORAGE_KEY) === '1');

  if (dismissed) return null;

  const suggestions: QuickStartSuggestion[] = [
    {
      id: 'renovation',
      icon: <Wrench className="w-5 h-5" />,
      name: t('projects.quickStart.renovation', 'Renoviranje'),
      description: t('projects.quickStart.renovationDesc', 'Praćenje troškova radova'),
      color: 'hsl(25 90% 55%)',
      emoji: '🏗️',
      defaultBudget: 10000,
    },
    {
      id: 'client',
      icon: <Briefcase className="w-5 h-5" />,
      name: t('projects.quickStart.client', 'Klijent / Posao'),
      description: t('projects.quickStart.clientDesc', 'Prihodi i izdaci po klijentu'),
      color: 'hsl(220 80% 55%)',
      emoji: '💼',
      defaultBudget: 5000,
    },
    {
      id: 'personal',
      icon: <Home className="w-5 h-5" />,
      name: t('projects.quickStart.personal', 'Osobni cilj'),
      description: t('projects.quickStart.personalDesc', 'Putovanje, vjenčanje, kupnja'),
      color: 'hsl(280 70% 55%)',
      emoji: '🎯',
      defaultBudget: 2000,
    },
  ];

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, '1');
    setDismissed(true);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8, height: 0 }}
        animate={{ opacity: 1, y: 0, height: 'auto' }}
        exit={{ opacity: 0, y: -8, height: 0 }}
        className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/8 via-primary/3 to-transparent p-4 mb-4 relative overflow-hidden"
      >
        <button
          onClick={handleDismiss}
          aria-label={t('common.close', 'Zatvori')}
          className="absolute top-3 right-3 w-6 h-6 rounded-full hover:bg-muted/50 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">
            {t('projects.onboarding.title', 'Brzi početak')}
          </h3>
        </div>
        <p className="text-xs text-muted-foreground mb-3 pr-6">
          {t(
            'projects.onboarding.subtitle',
            'Odaberi tip projekta — ime i budžet možeš promijeniti u sljedećem koraku.'
          )}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {suggestions.map((s, idx) => (
            <motion.button
              key={s.id}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onPickSuggestion(s)}
              className="p-3 rounded-xl border border-border/50 bg-card hover:border-primary/40 hover:shadow-sm transition-all text-left flex items-center gap-3 group"
              style={{ borderLeftWidth: 3, borderLeftColor: s.color }}
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${s.color}1a`, color: s.color }}
              >
                {s.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{s.name}</p>
                <p className="text-[11px] text-muted-foreground truncate">{s.description}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
            </motion.button>
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
