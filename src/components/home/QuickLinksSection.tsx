import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { FolderKanban, Target, Grid3X3, FileSpreadsheet } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { CategoryBreakdown } from '@/components/CategoryBreakdown';
import { SavingsGoalsSection } from '@/components/savings';
import { Expense } from '@/types/expense';
import { useModuleGate } from '@/hooks/useModuleGate';
import { useAppState } from '@/contexts/AppStateContext';

interface QuickLinksSectionProps {
  isLocalMode: boolean;
  expensesByCategory: Record<string, number>;
  totalExpenses: number;
  expenses: Expense[];
  onUpdateExpense: (expense: Expense) => Promise<any>;
  onDeleteExpense: (id: string) => Promise<any>;
  /** Visual variant. `monarch` = business dashboard restyle (hairline, muted glow). */
  variant?: 'default' | 'monarch';
}

export const QuickLinksSection = React.memo(({
  isLocalMode,
  expensesByCategory,
  totalExpenses,
  expenses,
  onUpdateExpense,
  onDeleteExpense,
  variant = 'default',
}: QuickLinksSectionProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { requestModule } = useModuleGate();
  const { activeBusinessProfileId } = useAppState();
  const isBusiness = !!activeBusinessProfileId;
  // Monarch restyle is business-only: requires both the explicit variant and business context.
  const monarch = variant === 'monarch' && isBusiness;

  const cardClass = monarch
    ? 'p-3 border-b border-border/40 border-l-[3px] pl-3 cursor-pointer transition-colors duration-200 hover:bg-muted/20 relative'
    : 'p-4 rounded-2xl border border-border/50 backdrop-blur-md cursor-pointer transition-all duration-300 hover:shadow-lg relative overflow-hidden';

  return (
    <div className={monarch ? 'lg:col-span-1 space-y-0' : 'lg:col-span-1 space-y-6'}>
      {/* Quick link to Import */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ scale: 1.01 }}
        onClick={() => navigate('/wallet')}
        className={cardClass}
        style={monarch
          ? { borderLeftColor: 'hsl(220 80% 55% / 0.6)' }
          : { borderLeftWidth: 3, borderLeftColor: 'hsl(220 80% 55%)', background: 'linear-gradient(135deg, hsl(220 80% 55% / 0.06) 0%, hsl(220 80% 55% / 0.02) 50%, transparent 100%)' }}
      >
        {!monarch && <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full opacity-[0.06] pointer-events-none" style={{ background: 'radial-gradient(circle, hsl(220 80% 55%) 0%, transparent 70%)' }} />}
        <div className="relative flex items-center gap-3">
          <div className={`rounded-xl flex items-center justify-center ${monarch ? 'w-8 h-8' : 'w-10 h-10'}`} style={{ backgroundColor: 'hsl(220 80% 55% / 0.1)' }}>
            <FileSpreadsheet className="w-5 h-5" style={{ color: 'hsl(220 80% 55%)' }} />
          </div>
          <div>
            <p className={monarch ? 'text-sm font-medium' : 'font-semibold'}>{t('import.title', 'Uvoz izvoda')}</p>
            <p className="text-xs text-muted-foreground">CSV / PDF →</p>
          </div>
        </div>
      </motion.div>

      {/* Quick link to Projects */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        whileHover={{ scale: 1.01 }}
        onClick={() => requestModule('projects', { onGranted: () => navigate('/projects') })}
        className={cardClass}
        style={monarch
          ? { borderLeftColor: 'hsl(var(--primary) / 0.6)' }
          : { borderLeftWidth: 3, borderLeftColor: 'hsl(var(--primary))', background: 'linear-gradient(135deg, hsl(var(--primary) / 0.06) 0%, hsl(var(--primary) / 0.02) 50%, transparent 100%)' }}
      >
        {!monarch && <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full opacity-[0.06] pointer-events-none" style={{ background: 'radial-gradient(circle, hsl(var(--primary)) 0%, transparent 70%)' }} />}
        <div className="relative flex items-center gap-3">
          <div className={`rounded-xl bg-primary/10 flex items-center justify-center ${monarch ? 'w-8 h-8' : 'w-10 h-10'}`}>
            <FolderKanban className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className={monarch ? 'text-sm font-medium' : 'font-semibold'}>{t('nav.projects', 'Projekti')}</p>
            <p className="text-xs text-muted-foreground">{t('nav.viewAll', 'Pogledaj sve')} →</p>
          </div>
        </div>
      </motion.div>

      {/* Quick link to Budgets — hidden in business mode */}
      {!isLocalMode && !isBusiness && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          whileHover={{ scale: 1.01 }}
          onClick={() => navigate('/budgets')}
          className="p-4 rounded-2xl border border-border/50 backdrop-blur-md cursor-pointer transition-all duration-300 hover:shadow-lg relative overflow-hidden"
          style={{ borderLeftWidth: 3, borderLeftColor: 'hsl(168 80% 50%)', background: 'linear-gradient(135deg, hsl(168 80% 50% / 0.06) 0%, hsl(168 80% 50% / 0.02) 50%, transparent 100%)' }}
        >
          <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full opacity-[0.06] pointer-events-none" style={{ background: 'radial-gradient(circle, hsl(168 80% 50%) 0%, transparent 70%)' }} />
          <div className="relative flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'hsl(168 80% 50% / 0.1)' }}>
              <Target className="w-5 h-5" style={{ color: 'hsl(168 80% 50%)' }} />
            </div>
            <div>
              <p className="font-semibold">{t('nav.budgets', 'Budžeti')}</p>
              <p className="text-xs text-muted-foreground">{t('nav.viewAll', 'Pogledaj sve')} →</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Savings Goals — hidden in business mode */}
      {!isLocalMode && !isBusiness && <SavingsGoalsSection />}

      {/* Category breakdown */}
      <Accordion type="multiple" className={monarch ? 'space-y-0' : 'space-y-4'}>
        <AccordionItem value="categories" className="border-none">
          <AccordionTrigger className={monarch
            ? 'px-0 py-3 border-b border-border/40 hover:no-underline'
            : 'glass-card rounded-2xl px-6 py-4 hover:no-underline [&[data-state=open]]:rounded-b-none'}>
            <div className="flex items-center gap-2">
              <Grid3X3 className="h-5 w-5 text-primary" />
              <span className={monarch ? 'text-[10px] font-medium uppercase tracking-widest text-muted-foreground' : 'text-lg font-semibold'}>{t('common.byCategories', 'Po kategorijama')}</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className={monarch
            ? 'px-0 pb-5 pt-3 border-b border-border/40'
            : 'glass-card rounded-b-2xl px-6 pb-6 pt-0 border-t-0'}>
            <CategoryBreakdown
              expensesByCategory={expensesByCategory}
              total={totalExpenses}
              expenses={expenses}
              onUpdateExpense={onUpdateExpense}
              onDeleteExpense={onDeleteExpense}
              hideHeader
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
});
