import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { TrendingUp, Coins } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  income: string;
  onChange: (v: string) => void;
}

const QUICK_AMOUNTS = [700, 1000, 1500, 2500];

export const StepIncome = ({ income, onChange }: Props) => {
  const { t } = useTranslation();
  const parsed = parseFloat(income) || 0;

  return (
    <motion.div
      key="step-income"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      className="w-full max-w-md mt-4 space-y-6"
    >
      <div className="text-center space-y-3">
        <div className="w-14 h-14 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
          <TrendingUp className="w-7 h-7 text-primary" />
        </div>
        <h2 className="text-xl font-bold">
          {t('onboardingV3.income.title', 'Krenimo od onog dobrog — koliko otprilike zaradiš mjesečno?')}
        </h2>
        <p className="text-xs text-muted-foreground">
          {t('onboardingV3.income.hint', 'Ne mora biti točno — sve iznose možeš kasnije promijeniti.')}
        </p>
      </div>

      <div className="relative">
        <Input
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          placeholder="0"
          value={income}
          onChange={(e) => onChange(e.target.value)}
          className="h-16 text-3xl font-bold text-center pr-12"
          autoFocus
        />
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-2xl text-muted-foreground font-semibold pointer-events-none">€</span>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {QUICK_AMOUNTS.map((amt) => {
          const isActive = parsed === amt;
          return (
            <button
              key={amt}
              type="button"
              onClick={() => onChange(String(amt))}
              className={cn(
                'h-11 rounded-xl border-2 text-sm font-medium transition-all',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isActive
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border hover:border-primary/40 active:scale-95',
              )}
            >
              {amt} €
            </button>
          );
        })}
      </div>

      {parsed > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-center gap-2 text-sm text-primary"
        >
          <Coins className="w-4 h-4" />
          <span>{t('onboardingV3.income.saved', 'Prihod spremljen')}</span>
        </motion.div>
      )}
    </motion.div>
  );
};
