import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { FolderKanban, Target, Grid3X3, FileSpreadsheet } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { CategoryBreakdown } from '@/components/CategoryBreakdown';
import { SavingsGoalsSection } from '@/components/savings';
import { Expense, Category } from '@/types/expense';

interface QuickLinksSectionProps {
  simpleModeEnabled: boolean;
  isLocalMode: boolean;
  expensesByCategory: Record<string, number>;
  totalExpenses: number;
  expenses: Expense[];
  onUpdateExpense: (expense: Expense) => Promise<any>;
  onDeleteExpense: (id: string) => Promise<any>;
}

export const QuickLinksSection = ({
  simpleModeEnabled,
  isLocalMode,
  expensesByCategory,
  totalExpenses,
  expenses,
  onUpdateExpense,
  onDeleteExpense,
}: QuickLinksSectionProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  if (simpleModeEnabled) return null;

  return (
    <div className="lg:col-span-1 space-y-6">
      {/* Quick link to Projects */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ scale: 1.01 }}
        onClick={() => navigate('/projects')}
        className="p-4 rounded-2xl border border-border/50 backdrop-blur-md cursor-pointer transition-all duration-300 hover:shadow-lg relative overflow-hidden"
        style={{ borderLeftWidth: 3, borderLeftColor: 'hsl(var(--primary))', background: 'linear-gradient(135deg, hsl(var(--primary) / 0.06) 0%, hsl(var(--primary) / 0.02) 50%, transparent 100%)' }}
      >
        <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full opacity-[0.06] pointer-events-none" style={{ background: 'radial-gradient(circle, hsl(var(--primary)) 0%, transparent 70%)' }} />
        <div className="relative flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <FolderKanban className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="font-semibold">{t('nav.projects', 'Projekti')}</p>
            <p className="text-xs text-muted-foreground">{t('nav.viewAll', 'Pogledaj sve')} →</p>
          </div>
        </div>
      </motion.div>

      {/* Quick link to Budgets */}
      {!isLocalMode && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
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

      {/* Savings Goals */}
      {!isLocalMode && <SavingsGoalsSection />}

      {/* Category breakdown */}
      <Accordion type="multiple" className="space-y-4">
        <AccordionItem value="categories" className="border-none">
          <AccordionTrigger className="glass-card rounded-2xl px-6 py-4 hover:no-underline [&[data-state=open]]:rounded-b-none">
            <div className="flex items-center gap-2">
              <Grid3X3 className="h-5 w-5 text-primary" />
              <span className="text-lg font-semibold">{t('common.byCategories', 'Po kategorijama')}</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="glass-card rounded-b-2xl px-6 pb-6 pt-0 border-t-0">
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
};