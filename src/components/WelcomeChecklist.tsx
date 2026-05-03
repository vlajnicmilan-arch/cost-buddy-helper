import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Wallet, Receipt, Target, X, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

const DISMISS_KEY_PREFIX = 'welcome_checklist_dismissed:';

interface WelcomeChecklistProps {
  hasPaymentSources: boolean;
  hasTransactions: boolean;
  hasBudgets: boolean;
  onAddPaymentSource: () => void;
  onAddTransaction: () => void;
  onAddBudget: () => void;
}

export const WelcomeChecklist = ({
  hasPaymentSources,
  hasTransactions,
  hasBudgets,
  onAddPaymentSource,
  onAddTransaction,
  onAddBudget,
}: WelcomeChecklistProps) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    const wasDismissed = localStorage.getItem(`${DISMISS_KEY_PREFIX}${user.id}`);
    setDismissed(wasDismissed === 'true');
  }, [user?.id]);

  const allDone = hasPaymentSources && hasTransactions && hasBudgets;

  // Auto-dismiss when all done
  useEffect(() => {
    if (allDone && user?.id) {
      const timer = setTimeout(() => {
        setDismissed(true);
        localStorage.setItem(`${DISMISS_KEY_PREFIX}${user.id}`, 'true');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [allDone, user?.id]);

  if (dismissed) return null;

  const steps = [
    {
      key: 'source',
      icon: Wallet,
      label: t('checklist.addPaymentSource', 'Dodaj izvor plaćanja'),
      description: t('checklist.addPaymentSourceDesc', 'Bankovni račun, gotovina ili kartica'),
      done: hasPaymentSources,
      action: onAddPaymentSource,
    },
    {
      key: 'transaction',
      icon: Receipt,
      label: t('checklist.addTransaction', 'Unesi prvu transakciju'),
      description: t('checklist.addTransactionDesc', 'Prihod, rashod ili prijenos'),
      done: hasTransactions,
      action: onAddTransaction,
    },
    {
      key: 'budget',
      icon: Target,
      label: t('checklist.createBudget', 'Postavi budžet'),
      description: t('checklist.createBudgetDesc', 'Kontroliraj potrošnju po kategorijama'),
      done: hasBudgets,
      action: onAddBudget,
    },
  ];

  const completedCount = steps.filter(s => s.done).length;

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('welcome_checklist_dismissed', 'true');
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 16, filter: 'blur(4px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="mb-6 p-4 rounded-2xl border border-primary/20 bg-primary/[0.04] relative overflow-hidden"
      >
        {/* Dismiss */}
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 p-1 rounded-lg hover:bg-muted/60 transition-colors text-muted-foreground"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">
            {allDone
              ? t('checklist.allDone', 'Sve je spremno! 🎉')
              : t('checklist.title', 'Počnite s V&M Balance')}
          </h3>
          <span className="ml-auto text-xs text-muted-foreground mr-6">
            {completedCount}/{steps.length}
          </span>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 rounded-full bg-muted/60 mb-4 overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-primary"
            initial={{ width: 0 }}
            animate={{ width: `${(completedCount / steps.length) * 100}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>

        {/* Steps */}
        <div className="space-y-2">
          {steps.map((step, i) => (
            <motion.div
              key={step.key}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + i * 0.08, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className={cn(
                'flex items-center gap-3 p-2.5 rounded-xl transition-all duration-200',
                step.done
                  ? 'bg-primary/[0.06]'
                  : 'hover:bg-muted/40 cursor-pointer active:scale-[0.98]'
              )}
              onClick={!step.done ? step.action : undefined}
            >
              <div className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors',
                step.done ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              )}>
                {step.done ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <step.icon className="w-4 h-4" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className={cn(
                  'text-sm font-medium',
                  step.done && 'line-through text-muted-foreground'
                )}>
                  {step.label}
                </p>
                <p className="text-xs text-muted-foreground truncate">{step.description}</p>
              </div>
              {!step.done && (
                <Button size="sm" variant="ghost" className="shrink-0 text-xs h-7 px-2 text-primary">
                  {t('checklist.start', 'Započni')}
                </Button>
              )}
            </motion.div>
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
