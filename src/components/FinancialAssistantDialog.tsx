import { useState, useRef, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bot, Send, Loader2, Trash2, Sparkles, FileText, TrendingUp, TrendingDown, PiggyBank, Download, Printer } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useFinancialAssistant, ChatMessage } from '@/hooks/useFinancialAssistant';
import { useCurrency } from '@/contexts/CurrencyContext';
import { Expense } from '@/types/expense';
import { CustomPaymentSource } from '@/types/customPaymentSource';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import { format, subMonths, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { hr } from 'date-fns/locale';
import { motion } from 'framer-motion';
import aiAvatarImage from '@/assets/ai-avatar.png';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { UpgradePrompt } from '@/components/UpgradePrompt';

interface BudgetInfo {
  name: string;
  total_amount: number;
  spent?: number;
  period_type?: string;
  is_active?: boolean;
  categories?: Array<{ category: string; limit_amount: number; spent?: number }>;
}

interface ProjectInfo {
  name: string;
  total_budget: number;
  spent?: number;
  status?: string;
  description?: string | null;
  milestones?: Array<{ name: string; budget: number; spent?: number; status?: string }>;
}

interface FinancialAssistantDialogProps {
  expenses: Expense[];
  totalIncome: number;
  totalExpenses: number;
  balance: number;
  paymentSources: CustomPaymentSource[];
  budgets?: BudgetInfo[];
  projects?: ProjectInfo[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}

export const FinancialAssistantDialog = ({
  expenses,
  totalIncome,
  totalExpenses,
  balance,
  paymentSources,
  budgets = [],
  projects = [],
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
}: FinancialAssistantDialogProps) => {
  const { hasAccess, getRequiredTier } = useFeatureAccess();
  const canAccessAI = hasAccess('ai_assistant');
  const [internalOpen, setInternalOpen] = useState(false);
  
  // Support both controlled and uncontrolled modes
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (value: boolean) => {
    if (isControlled && onOpenChange) {
      onOpenChange(value);
    } else {
      setInternalOpen(value);
    }
  };
  const [input, setInput] = useState('');
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { formatAmount } = useCurrency();

  // Build financial context from props with historical data
  const financialContext = useMemo(() => {
    const now = new Date();
    
    // Category breakdown for current month
    const categoryTotals: Record<string, number> = {};
    expenses.forEach(e => {
      if (e.type === 'expense') {
        categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount;
      }
    });
    const categoryBreakdown = Object.entries(categoryTotals)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, amount]) => `- ${cat}: ${formatAmount(amount)}`)
      .join('\n') || 'Nema troškova';

    // Payment sources
    const paymentSourcesStr = paymentSources
      .map(ps => `- ${ps.name}: ${formatAmount(ps.balance)}`)
      .join('\n') || 'Nema izvora plaćanja';

    // Cards from payment sources
    const cardsStr = paymentSources.flatMap(ps => 
      (ps.cards || []).map(card => 
        `- ${card.card_name} (${card.card_type || 'Kartica'} ****${card.last_four_digits}) - povezana s ${ps.name}`
      )
    ).join('\n') || 'Nema povezanih kartica';

    // Build payment source name map
    const sourceMap = new Map(paymentSources.map(ps => [ps.id, ps.name]));

    // Recent transactions (last 30) with enriched metadata
    const recentTx = expenses
      .slice(0, 30)
      .map(e => {
        const sourceName = e.payment_source ? (sourceMap.get(e.payment_source) || '') : '';
        const sourceLabel = sourceName ? ` na ${sourceName}` : '';
        const correctionTag = (e as any).expense_nature === 'correction' ? ' [KOREKCIJA]' : '';
        const merchantLabel = e.merchant_name ? ` (${e.merchant_name})` : '';
        return `- ${e.date.toLocaleDateString('hr-HR')}: ${e.description}${merchantLabel}${correctionTag}${sourceLabel} (${e.type === 'income' ? '+' : '-'}${formatAmount(e.amount)}) [${e.type}]`;
      })
      .join('\n') || 'Nema transakcija';

    // Budgets - detailed info
    const budgetsStr = budgets.length > 0
      ? budgets.map(b => {
          const percentage = b.total_amount > 0 ? Math.round(((b.spent || 0) / b.total_amount) * 100) : 0;
          const status = b.is_active ? 'Aktivan' : 'Pauziran';
          const period = b.period_type || 'mjesečni';
          let categoryInfo = '';
          if (b.categories && b.categories.length > 0) {
            categoryInfo = '\n    Kategorije: ' + b.categories.map(c => {
              const catSpent = c.spent || 0;
              const catPercentage = c.limit_amount > 0 ? Math.round((catSpent / c.limit_amount) * 100) : 0;
              return `${c.category} (${formatAmount(catSpent)}/${formatAmount(c.limit_amount)}, ${catPercentage}%)`;
            }).join(', ');
          }
          return `- ${b.name} (${period}, ${status}): ${formatAmount(b.spent || 0)} / ${formatAmount(b.total_amount)} (${percentage}%)${categoryInfo}`;
        }).join('\n')
      : 'Nema aktivnih budžeta';

    // Projects - detailed info
    const projectsStr = projects.length > 0
      ? projects.map(p => {
          const spent = p.spent || 0;
          const percentage = p.total_budget > 0 ? Math.round((spent / p.total_budget) * 100) : 0;
          const remaining = p.total_budget - spent;
          const statusLabel = p.status === 'active' ? 'Aktivan' : p.status === 'completed' ? 'Završen' : p.status === 'paused' ? 'Pauziran' : p.status || 'Nacrt';
          let milestoneInfo = '';
          if (p.milestones && p.milestones.length > 0) {
            milestoneInfo = '\n    Faze: ' + p.milestones.map(m => {
              const mSpent = m.spent || 0;
              const mStatus = m.status === 'completed' ? '✅' : m.status === 'in_progress' ? '🔄' : m.status === 'overdue' ? '⚠️' : '⏳';
              return `${mStatus} ${m.name} (${formatAmount(mSpent)}/${formatAmount(m.budget)})`;
            }).join(', ');
          }
          return `- ${p.name} (${statusLabel}): Potrošeno ${formatAmount(spent)} od ${formatAmount(p.total_budget)} (${percentage}%), preostalo ${formatAmount(remaining)}${p.description ? `\n    Opis: ${p.description}` : ''}${milestoneInfo}`;
        }).join('\n')
      : 'Nema aktivnih projekata';

    // === HISTORICAL TREND ANALYSIS (last 6 months) ===
    const monthlyData: Array<{
      month: string;
      income: number;
      expenses: number;
      balance: number;
      topCategories: Array<{ category: string; amount: number }>;
    }> = [];

    for (let i = 5; i >= 0; i--) {
      const monthDate = subMonths(now, i);
      const monthStart = startOfMonth(monthDate);
      const monthEnd = endOfMonth(monthDate);
      const monthName = format(monthDate, 'LLLL yyyy', { locale: hr });

      const monthExpenses = expenses.filter(e => 
        isWithinInterval(e.date, { start: monthStart, end: monthEnd })
      );

      const monthIncome = monthExpenses
        .filter(e => e.type === 'income')
        .reduce((sum, e) => sum + e.amount, 0);
      
      const monthExpenseTotal = monthExpenses
        .filter(e => e.type === 'expense')
        .reduce((sum, e) => sum + e.amount, 0);

      // Top categories for this month
      const monthCategoryTotals: Record<string, number> = {};
      monthExpenses
        .filter(e => e.type === 'expense')
        .forEach(e => {
          monthCategoryTotals[e.category] = (monthCategoryTotals[e.category] || 0) + e.amount;
        });

      const topCategories = Object.entries(monthCategoryTotals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([category, amount]) => ({ category, amount }));

      monthlyData.push({
        month: monthName,
        income: monthIncome,
        expenses: monthExpenseTotal,
        balance: monthIncome - monthExpenseTotal,
        topCategories,
      });
    }

    // Format historical trends as string
    const historicalTrends = monthlyData.map(m => {
      const topCatsStr = m.topCategories.length > 0
        ? m.topCategories.map(c => `${c.category}: ${formatAmount(c.amount)}`).join(', ')
        : 'Nema podataka';
      return `${m.month}:
  - Prihodi: ${formatAmount(m.income)}
  - Rashodi: ${formatAmount(m.expenses)}
  - Bilanca: ${m.balance >= 0 ? '+' : ''}${formatAmount(m.balance)}
  - Top kategorije: ${topCatsStr}`;
    }).join('\n\n');

    // Calculate trend analysis
    const avgMonthlyExpense = monthlyData.reduce((sum, m) => sum + m.expenses, 0) / monthlyData.length;
    const avgMonthlyIncome = monthlyData.reduce((sum, m) => sum + m.income, 0) / monthlyData.length;
    
    const currentMonthData = monthlyData[monthlyData.length - 1];
    const previousMonthData = monthlyData[monthlyData.length - 2];
    
    const expenseChange = previousMonthData && previousMonthData.expenses > 0
      ? ((currentMonthData.expenses - previousMonthData.expenses) / previousMonthData.expenses * 100).toFixed(1)
      : null;
    
    const incomeChange = previousMonthData && previousMonthData.income > 0
      ? ((currentMonthData.income - previousMonthData.income) / previousMonthData.income * 100).toFixed(1)
      : null;

    // Find categories with biggest increase
    const categoryTrends: Record<string, number[]> = {};
    monthlyData.forEach((m, monthIndex) => {
      m.topCategories.forEach(c => {
        if (!categoryTrends[c.category]) {
          categoryTrends[c.category] = new Array(6).fill(0);
        }
        categoryTrends[c.category][monthIndex] = c.amount;
      });
    });

    const trendAnalysis = `
ANALIZA TRENDOVA:
- Prosječni mjesečni rashodi (6 mj.): ${formatAmount(avgMonthlyExpense)}
- Prosječni mjesečni prihodi (6 mj.): ${formatAmount(avgMonthlyIncome)}
${expenseChange !== null ? `- Promjena rashoda u odnosu na prošli mjesec: ${Number(expenseChange) > 0 ? '+' : ''}${expenseChange}%` : ''}
${incomeChange !== null ? `- Promjena prihoda u odnosu na prošli mjesec: ${Number(incomeChange) > 0 ? '+' : ''}${incomeChange}%` : ''}`;

    return {
      balance: formatAmount(balance),
      totalIncome: formatAmount(totalIncome),
      totalExpenses: formatAmount(totalExpenses),
      transactionCount: expenses.length,
      categoryBreakdown,
      paymentSources: paymentSourcesStr,
      cards: cardsStr,
      recentTransactions: recentTx,
      budgets: budgetsStr,
      projects: projectsStr,
      historicalTrends,
      trendAnalysis,
    };
  }, [expenses, totalIncome, totalExpenses, balance, paymentSources, budgets, projects, formatAmount]);

  const { messages, isLoading, sendMessage, clearMessages } = useFinancialAssistant({
    financialContext,
  });

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollAreaRef.current) {
      const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (viewport) {
        setTimeout(() => {
          viewport.scrollTop = viewport.scrollHeight;
        }, 10);
      }
    }
  }, [messages]);

  // Focus input when dialog opens
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage(input.trim());
    setInput('');
  };

  const generateMonthlyReport = () => {
    const reportPrompt = `Generiraj detaljan mjesečni financijski izvještaj za ovaj mjesec. Izvještaj treba uključivati:

1. **📊 SAŽETAK MJESECA**
   - Ukupni prihodi i rashodi
   - Neto bilanca (prihodi - rashodi)
   - Usporedba s prošlim mjesecom

2. **📈 ANALIZA POTROŠNJE**
   - Top 3 kategorije s najvećom potrošnjom
   - Kategorije koje su porasle u odnosu na prošli mjesec
   - Kategorije gdje je došlo do uštede

3. **💡 PREPORUKE ZA UŠTEDU**
   - 3-5 konkretnih savjeta za uštedu temeljenih na mojim podacima
   - Područja gdje mogu smanjiti troškove
   - Realistični ciljevi uštede za sljedeći mjesec

4. **🎯 CILJEVI ZA SLJEDEĆI MJESEC**
   - Predloženi budžet po kategorijama
   - Konkretni koraci za poboljšanje financija

Koristi moje stvarne podatke i budi što konkretniji!`;
    
    sendMessage(reportPrompt);
  };

  const quickQuestions = [
    'Kako mogu uštedjeti više novca?',
    'Koja kategorija troši najviše?',
    'Kakvi su moji trendovi potrošnje?',
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2 rounded-xl">
            <Sparkles className="w-4 h-4" />
            <span className="hidden sm:inline">AI Asistent</span>
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-[500px] h-[85vh] sm:h-[600px] flex flex-col p-0">
        {!canAccessAI ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <UpgradePrompt
              feature="AI Financijski Asistent"
              requiredTier={getRequiredTier('ai_assistant')}
            />
          </div>
        ) : (
        <>
        <DialogHeader className="p-4 pb-2 border-b">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot className="w-4 h-4 text-primary" />
              </div>
              Financijski Asistent
            </DialogTitle>
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                onClick={clearMessages}
                className="h-8 w-8"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
          {messages.length === 0 ? (
            <div className="space-y-4">
              <div className="text-center py-4">
                {/* Animated AI Avatar - 20% larger (24 -> 28) */}
                <motion.div
                  className="relative w-28 h-28 mx-auto mb-4"
                  animate={{
                    y: [0, -8, 0],
                  }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                >
                  <motion.img
                    src={aiAvatarImage}
                    alt="AI Asistent"
                    className="w-full h-full object-contain drop-shadow-lg"
                    animate={{
                      scale: [1, 1.02, 1],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                  />
                  {/* Glow effect */}
                  <div className="absolute inset-0 -z-10 bg-primary/20 rounded-full blur-xl scale-75" />
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <p className="font-semibold text-foreground text-lg">Bok! 👋</p>
                  <p className="text-muted-foreground mt-2 leading-relaxed max-w-sm mx-auto text-sm">
                    Ja sam tvoj osobni financijski asistent. Tu sam da ti pomognem 
                    razumjeti svoje financije i donositi mirnije odluke — bez pritiska i bez stresa.
                  </p>
                  <p className="text-sm text-muted-foreground/80 mt-3 italic">
                    Kako ti danas mogu pomoći?
                  </p>
                </motion.div>
              </div>

              {/* Monthly Report Button */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <Button
                  onClick={generateMonthlyReport}
                  disabled={isLoading}
                  size="sm"
                  className="w-full gap-2 h-auto py-2.5 bg-gradient-to-r from-primary to-primary/80"
                >
                  <FileText className="w-4 h-4" />
                  <div className="text-left">
                    <div className="font-medium text-sm">Generiraj mjesečni izvještaj</div>
                    <div className="text-xs opacity-80">Pregled stanja + savjeti</div>
                  </div>
                </Button>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="space-y-2"
              >
                <div className="text-xs text-muted-foreground text-center pt-2">
                  Ili odaberi jedno od čestih pitanja:
                </div>

                <div className="grid grid-cols-1 gap-2">
                  {quickQuestions.map((q, i) => (
                    <Button
                      key={i}
                      variant="outline"
                      size="sm"
                      className="justify-start text-left h-auto py-2.5 px-3 text-sm hover:bg-primary/5"
                      onClick={() => {
                        sendMessage(q);
                      }}
                      disabled={isLoading}
                    >
                      {q}
                    </Button>
                  ))}
                </div>
              </motion.div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((msg, i) => (
                <MessageBubble key={i} message={msg} />
              ))}
              {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Asistent razmišlja...</span>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        <form onSubmit={handleSubmit} className="p-4 pt-2 border-t">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Postavi pitanje..."
              disabled={isLoading}
              className="flex-1"
            />
            <Button type="submit" size="icon" disabled={isLoading || !input.trim()}>
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
        </form>
        </>
        )}
      </DialogContent>
    </Dialog>
  );
};

const MessageBubble = ({ message }: { message: ChatMessage }) => {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex gap-2', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <motion.div 
          className="flex-shrink-0 w-8 h-8 mt-1"
          animate={{
            y: [0, -2, 0],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          <img
            src={aiAvatarImage}
            alt="AI"
            className="w-full h-full object-contain"
          />
        </motion.div>
      )}
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-4 py-2',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted'
        )}
      >
        {isUser ? (
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="text-sm prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
};
