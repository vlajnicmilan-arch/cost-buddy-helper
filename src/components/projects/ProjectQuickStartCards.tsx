import { Target, FileText, Wallet, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { clickableProps } from '@/lib/a11y';

interface ProjectQuickStartCardsProps {
  /** Hide cards whose action has been completed */
  hasMilestones: boolean;
  hasTransactions: boolean;
  hasBudget: boolean;
  hasTeam: boolean;
  onAddMilestone: () => void;
  onAddTransaction: () => void;
  onSetBudget: () => void;
  onInviteTeam: () => void;
  onDismiss: () => void;
  isManager: boolean;
}

/**
 * Post-creation guided empty state inside the Pregled tab.
 * Each CTA card disappears once the user completes that action.
 */
export const ProjectQuickStartCards = ({
  hasMilestones,
  hasTransactions,
  hasBudget,
  hasTeam,
  onAddMilestone,
  onAddTransaction,
  onSetBudget,
  onInviteTeam,
  onDismiss,
  isManager,
}: ProjectQuickStartCardsProps) => {
  const { t } = useTranslation();

  const cards = [
    !hasMilestones && {
      key: 'milestone',
      title: t('projects.quickStartCards.addMilestone', 'Dodaj prvu fazu'),
      desc: t('projects.quickStartCards.addMilestoneDesc', 'Razbij projekt na korake'),
      icon: Target,
      onClick: onAddMilestone,
      tint: 'bg-primary/10 text-primary',
    },
    !hasTransactions && {
      key: 'transaction',
      title: t('projects.quickStartCards.addTransaction', 'Dodaj prvu transakciju'),
      desc: t('projects.quickStartCards.addTransactionDesc', 'Zabilježi trošak ili prihod'),
      icon: FileText,
      onClick: onAddTransaction,
      tint: 'bg-expense/10 text-expense',
    },
    !hasBudget && isManager && {
      key: 'budget',
      title: t('projects.quickStartCards.setBudget', 'Postavi budžet'),
      desc: t('projects.quickStartCards.setBudgetDesc', 'Prati maržu i naplatu'),
      icon: Wallet,
      onClick: onSetBudget,
      tint: 'bg-income/10 text-income',
    },
    !hasTeam && isManager && {
      key: 'team',
      title: t('projects.quickStartCards.inviteTeam', 'Pozovi tim'),
      desc: t('projects.quickStartCards.inviteTeamDesc', 'Surađuj na projektu'),
      icon: Users,
      onClick: onInviteTeam,
      tint: 'bg-secondary text-secondary-foreground',
    },
  ].filter(Boolean) as Array<{
    key: string;
    title: string;
    desc: string;
    icon: typeof Target;
    onClick: () => void;
    tint: string;
  }>;

  if (cards.length === 0) return null;

  return (
    <div className="p-4 rounded-2xl border border-border/50 bg-gradient-to-br from-primary/[0.03] to-transparent space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-sm">
            {t('projects.quickStartCards.title', 'Brzi početak')}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('projects.quickStartCards.subtitle', 'Postavi projekt u nekoliko klikova.')}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground"
          onClick={onDismiss}
          aria-label={t('common.dismiss', 'Sakrij')}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <AnimatePresence>
          {cards.map((c) => {
            const Icon = c.icon;
            return (
              <motion.div
                key={c.key}
                layout
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.18 }}
              >
                <div
                  {...clickableProps(c.onClick, {
                    label: c.title,
                    className: cn(
                      'flex items-center gap-3 p-3 rounded-xl border border-border/40',
                      'bg-background/60 hover:bg-muted/60 active:bg-muted transition-colors cursor-pointer h-full'
                    ),
                  })}
                >
                  <div
                    className={cn(
                      'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
                      c.tint
                    )}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{c.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{c.desc}</p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
};
