import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, TrendingUp, TrendingDown, AlertTriangle, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCurrency } from '@/contexts/CurrencyContext';
import { Expense } from '@/types/expense';
import { CustomPaymentSource } from '@/types/customPaymentSource';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

interface AIInsightBubbleProps {
  expenses: Expense[];
  totalIncome: number;
  totalExpenses: number;
  balance: number;
  paymentSources: CustomPaymentSource[];
  onOpenAssistant: () => void;
}

type InsightType = 'status' | 'trend' | 'warning' | 'motivation';

interface Insight {
  type: InsightType;
  message: string;
  icon: React.ReactNode;
}

export const AIInsightBubble = ({
  expenses,
  totalIncome,
  totalExpenses,
  balance,
  paymentSources,
  onOpenAssistant,
}: AIInsightBubbleProps) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const isMobile = useIsMobile();
  const [isVisible, setIsVisible] = useState(true);
  const [currentInsightIndex, setCurrentInsightIndex] = useState(0);

  // Generate insights based on financial data
  const insights = useMemo((): Insight[] => {
    const result: Insight[] = [];
    
    // Current balance status
    if (balance > 0) {
      result.push({
        type: 'status',
        message: t('insights.positiveBalance', 'Odlično! Tvoje stanje je {{amount}} u plusu.').replace('{{amount}}', formatAmount(balance)),
        icon: <TrendingUp className="w-4 h-4" />,
      });
    } else if (balance < 0) {
      result.push({
        type: 'status',
        message: t('insights.negativeBalance', 'Pazi! Tvoje stanje je {{amount}} u minusu.').replace('{{amount}}', formatAmount(Math.abs(balance))),
        icon: <TrendingDown className="w-4 h-4" />,
      });
    }

    // Spending trend analysis
    const thisMonth = new Date().getMonth();
    const thisYear = new Date().getFullYear();
    const thisMonthExpenses = expenses.filter(e => 
      e.type === 'expense' && 
      e.date.getMonth() === thisMonth && 
      e.date.getFullYear() === thisYear
    );
    
    const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1;
    const lastMonthYear = thisMonth === 0 ? thisYear - 1 : thisYear;
    const lastMonthExpenses = expenses.filter(e => 
      e.type === 'expense' && 
      e.date.getMonth() === lastMonth && 
      e.date.getFullYear() === lastMonthYear
    );

    const thisMonthTotal = thisMonthExpenses.reduce((sum, e) => sum + e.amount, 0);
    const lastMonthTotal = lastMonthExpenses.reduce((sum, e) => sum + e.amount, 0);

    if (lastMonthTotal > 0) {
      const change = ((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100;
      if (change > 20) {
        result.push({
          type: 'trend',
          message: t('insights.spendingUp', 'Ovaj mjesec trošiš {{percent}}% više nego prošli mjesec.').replace('{{percent}}', Math.round(change).toString()),
          icon: <TrendingUp className="w-4 h-4" />,
        });
      } else if (change < -10) {
        result.push({
          type: 'trend',
          message: t('insights.spendingDown', 'Bravo! Trošiš {{percent}}% manje nego prošli mjesec.').replace('{{percent}}', Math.round(Math.abs(change)).toString()),
          icon: <TrendingDown className="w-4 h-4" />,
        });
      }
    }

    // Warnings
    const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome) * 100 : 0;
    if (savingsRate < 10 && totalIncome > 0) {
      result.push({
        type: 'warning',
        message: t('insights.lowSavings', 'Štediš samo {{percent}}% prihoda. Razmisli o smanjenju troškova.').replace('{{percent}}', Math.round(savingsRate).toString()),
        icon: <AlertTriangle className="w-4 h-4" />,
      });
    }

    // Check for high category spending
    const categoryTotals: Record<string, number> = {};
    thisMonthExpenses.forEach(e => {
      categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount;
    });
    const topCategory = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0];
    if (topCategory && topCategory[1] > thisMonthTotal * 0.4) {
      result.push({
        type: 'warning',
        message: t('insights.highCategorySpending', '{{percent}}% troškova ide na {{category}}. Možda previše?')
          .replace('{{percent}}', Math.round((topCategory[1] / thisMonthTotal) * 100).toString())
          .replace('{{category}}', topCategory[0]),
        icon: <AlertTriangle className="w-4 h-4" />,
      });
    }

    // Motivational messages
    const motivationalMessages = [
      t('insights.motivation1', 'Svaka ušteda danas je sloboda sutra! 💪'),
      t('insights.motivation2', 'Mali koraci vode do velikih ciljeva! 🎯'),
      t('insights.motivation3', 'Kontroliraš svoje financije - to je super! ⭐'),
      t('insights.motivation4', 'Nastavi pratiti troškove, radiš odličan posao! 🌟'),
    ];
    result.push({
      type: 'motivation',
      message: motivationalMessages[Math.floor(Math.random() * motivationalMessages.length)],
      icon: <Heart className="w-4 h-4" />,
    });

    // Add a default if no insights
    if (result.length === 0) {
      result.push({
        type: 'status',
        message: t('insights.default', 'Klikni za AI savjete o tvojim financijama!'),
        icon: <Sparkles className="w-4 h-4" />,
      });
    }

    return result;
  }, [expenses, totalIncome, totalExpenses, balance, formatAmount, t]);

  // Rotate insights every 8 seconds
  useEffect(() => {
    if (insights.length <= 1) return;
    
    const interval = setInterval(() => {
      setCurrentInsightIndex(prev => (prev + 1) % insights.length);
    }, 8000);

    return () => clearInterval(interval);
  }, [insights.length]);

  // Check if user dismissed the bubble today
  useEffect(() => {
    const dismissed = localStorage.getItem('ai_bubble_dismissed');
    if (dismissed) {
      const dismissedDate = new Date(dismissed);
      const today = new Date();
      // Show again after 24 hours
      if (today.getTime() - dismissedDate.getTime() < 24 * 60 * 60 * 1000) {
        setIsVisible(false);
      } else {
        localStorage.removeItem('ai_bubble_dismissed');
      }
    }
  }, []);

  const handleDismiss = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsVisible(false);
    localStorage.setItem('ai_bubble_dismissed', new Date().toISOString());
  }, []);

  const handleClick = useCallback(() => {
    onOpenAssistant();
  }, [onOpenAssistant]);

  const currentInsight = insights[currentInsightIndex];

  const getBackgroundClass = (type: InsightType) => {
    switch (type) {
      case 'status':
        return 'bg-primary/10 border-primary/20';
      case 'trend':
        return 'bg-blue-500/10 border-blue-500/20';
      case 'warning':
        return 'bg-amber-500/10 border-amber-500/20';
      case 'motivation':
        return 'bg-pink-500/10 border-pink-500/20';
      default:
        return 'bg-muted border-border';
    }
  };

  const getIconClass = (type: InsightType) => {
    switch (type) {
      case 'status':
        return 'text-primary';
      case 'trend':
        return 'text-blue-500';
      case 'warning':
        return 'text-amber-500';
      case 'motivation':
        return 'text-pink-500';
      default:
        return 'text-muted-foreground';
    }
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.9 }}
          transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          className="fixed top-20 right-3 sm:right-4 z-40 max-w-[280px] sm:max-w-sm"
        >
          {/* Speech bubble pointer - positioned to point at AI button */}
          <div 
            className={cn(
              "absolute -top-2 w-4 h-4 rotate-45 bg-card border-l border-t border-border",
              isMobile ? "right-[72px]" : "right-[100px]"
            )} 
          />
          
          <motion.div
            onClick={handleClick}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={cn(
              'relative p-3 sm:p-4 rounded-2xl border shadow-lg cursor-pointer backdrop-blur-sm bg-card',
              getBackgroundClass(currentInsight.type)
            )}
          >
            {/* Close button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDismiss}
              className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-background border shadow-sm hover:bg-muted"
            >
              <X className="w-3 h-3" />
            </Button>

            {/* Content */}
            <div className="flex items-start gap-2 sm:gap-3">
              <div className={cn(
                'flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center',
                getBackgroundClass(currentInsight.type)
              )}>
                <span className={getIconClass(currentInsight.type)}>
                  {currentInsight.icon}
                </span>
              </div>
              
              <div className="flex-1 min-w-0">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={currentInsightIndex}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.3 }}
                    className="text-xs sm:text-sm font-medium leading-relaxed"
                  >
                    {currentInsight.message}
                  </motion.p>
                </AnimatePresence>
                <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  {t('insights.tapForMore', 'Klikni za više savjeta')}
                </p>
              </div>
            </div>

            {/* Progress dots */}
            {insights.length > 1 && (
              <div className="flex justify-center gap-1 mt-2 sm:mt-3">
                {insights.map((_, index) => (
                  <div
                    key={index}
                    className={cn(
                      'w-1.5 h-1.5 rounded-full transition-colors',
                      index === currentInsightIndex ? 'bg-foreground/60' : 'bg-foreground/20'
                    )}
                  />
                ))}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
