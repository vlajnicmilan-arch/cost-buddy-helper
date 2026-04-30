import { useState, useRef, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bot, Send, Loader2, Trash2, Sparkles, FileText, TrendingUp, TrendingDown, PiggyBank, Download, Printer, Brain, X } from 'lucide-react';
import { loadJsPdf } from '@/lib/loadJsPdf';
import { exportPDFDoc, exportTextFile } from '@/lib/fileExport';
import { useFinancialAssistant, ChatMessage, UserMemory } from '@/hooks/useFinancialAssistant';
import { Badge } from '@/components/ui/badge';
import { useCurrency } from '@/contexts/CurrencyContext';
import { Expense } from '@/types/expense';
import { CustomPaymentSource } from '@/types/customPaymentSource';
import { cn } from '@/lib/utils';
import { lazy, Suspense } from 'react';
const ReactMarkdown = lazy(() => import('react-markdown'));
import { format, subMonths, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { hr } from 'date-fns/locale';
import { motion } from 'framer-motion';
import aiAvatarImage from '@/assets/ai-avatar.webp';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { UpgradePrompt } from '@/components/UpgradePrompt';
import { useAppState } from '@/contexts/AppStateContext';

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
  businessProfileName?: string;
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
  businessProfileName: propBusinessProfileName,
}: FinancialAssistantDialogProps) => {
  const { hasAccess, getRequiredTier } = useFeatureAccess();
  const canAccessAI = hasAccess('ai_assistant');
  const { activeBusinessProfileId, businessModeEnabled, emitAvatarEvent } = useAppState();
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

  const resolvedBusinessProfileName = propBusinessProfileName;

  const [showMemories, setShowMemories] = useState(false);

  const { messages, isLoading, isLoadingHistory, memories, sendMessage, clearMessages, loadHistory, deleteMemory, deleteAllMemories, refreshMemories } = useFinancialAssistant({
    financialContext,
    activeBusinessProfileId: businessModeEnabled ? activeBusinessProfileId : undefined,
    businessProfileName: resolvedBusinessProfileName,
  });
  // Emit happy when assistant finishes responding
  const prevLoading = useRef(false);
  useEffect(() => {
    if (prevLoading.current && !isLoading) {
      emitAvatarEvent('happy', 'Evo, pogledaj! 💡');
    }
    prevLoading.current = isLoading;
  }, [isLoading, emitAvatarEvent]);

  // Load chat history when dialog opens
  useEffect(() => {
    if (open && canAccessAI) {
      loadHistory();
    }
  }, [open, canAccessAI, loadHistory]);

  // Refresh memories when opening memory view
  useEffect(() => {
    if (showMemories) {
      refreshMemories();
    }
  }, [showMemories, refreshMemories]);

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
    emitAvatarEvent('thinking', 'Razmišljam... 🧠');
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
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowMemories(!showMemories)}
                className="h-8 w-8"
                title="Memorije asistenta"
              >
                <Brain className="w-4 h-4" />
              </Button>
              {messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={clearMessages}
                  className="h-8 w-8"
                  title="Novi razgovor"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
          {showMemories ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">🧠 Što asistent pamti o tebi</h3>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowMemories(false)}>
                  <X className="w-3 h-3 mr-1" /> Zatvori
                </Button>
              </div>
              {memories.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Asistent još nema spremljenih memorija. Razgovaraj s njim i on će zapamtiti važne stvari o tvojim financijama.
                </p>
              ) : (
                <>
                  {memories.map((mem) => (
                    <div key={mem.id} className="flex items-start gap-2 p-2 rounded-lg bg-muted/50">
                      <Badge variant="outline" className="text-[10px] shrink-0 mt-0.5">
                        {mem.category === 'goal' ? '🎯' : mem.category === 'habit' ? '🔄' : mem.category === 'preference' ? '⭐' : '📌'} {mem.category}
                      </Badge>
                      <p className="text-sm flex-1">{mem.content}</p>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => deleteMemory(mem.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs text-destructive hover:text-destructive"
                    onClick={deleteAllMemories}
                  >
                    <Trash2 className="w-3 h-3 mr-1" /> Obriši sve memorije
                  </Button>
                </>
              )}
            </div>
          ) : isLoadingHistory ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Učitavam razgovor...</span>
            </div>
          ) : messages.length === 0 ? (
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

// Extract markdown table data from content — robust parser
function extractTableData(content: string): { headers: string[]; rows: string[][] } | null {
  // Strip code fences
  const cleaned = content.replace(/```[a-z]*\n?/gi, '');
  const lines = cleaned.split('\n');
  const tableLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip empty lines and non-table lines but don't break collection
    if (!trimmed) continue;
    if (trimmed.startsWith('|') && trimmed.includes('|', 1)) {
      // Ensure line ends with | (allow trailing whitespace)
      const normalized = trimmed.endsWith('|') ? trimmed : trimmed + '|';
      tableLines.push(normalized);
    } else if (tableLines.length > 0) {
      // Non-table line after we started collecting — stop
      break;
    }
  }

  if (tableLines.length < 3) return null; // header + separator + at least 1 row

  const parseLine = (line: string) =>
    line.split('|').slice(1, -1).map(c => c.trim());

  // Find separator line (contains only -, :, |, spaces)
  let separatorIdx = -1;
  for (let i = 0; i < tableLines.length; i++) {
    if (/^\|[\s\-:|]+\|$/.test(tableLines[i])) {
      separatorIdx = i;
      break;
    }
  }
  if (separatorIdx < 1) return null;

  const headers = parseLine(tableLines[separatorIdx - 1]);
  const rows = tableLines.slice(separatorIdx + 1).map(parseLine).filter(r => r.length === headers.length);

  if (rows.length === 0) return null;
  return { headers, rows };
}

async function exportToCSV(headers: string[], rows: string[][]) {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const csv = [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))].join('\n');
  const fileName = `izvoz_${new Date().toISOString().slice(0, 10)}.csv`;
  await exportTextFile(csv, fileName, 'text/csv', true);
}

async function exportToPDF(headers: string[], rows: string[][]) {
  const { jsPDF, autoTable } = await loadJsPdf();
  const doc = new jsPDF({ orientation: rows[0]?.length > 5 ? 'landscape' : 'portrait' });
  doc.setFont('helvetica');
  doc.setFontSize(14);
  doc.text('V&M Balance - Izvoz podataka', 14, 15);
  doc.setFontSize(9);
  doc.text(`Datum: ${new Date().toLocaleDateString('hr-HR')}`, 14, 22);

  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: 28,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [59, 130, 246], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 247, 250] },
  });

  const fileName = `izvoz_${new Date().toISOString().slice(0, 10)}.pdf`;
  await exportPDFDoc(doc, fileName);
}

async function exportResponseAsPDF(content: string) {
  const { jsPDF } = await loadJsPdf();
  const doc = new jsPDF();
  doc.setFont('helvetica');
  doc.setFontSize(14);
  doc.text('V&M Balance - AI Odgovor', 14, 15);
  doc.setFontSize(9);
  doc.text(`Datum: ${new Date().toLocaleDateString('hr-HR')}`, 14, 22);

  // Clean markdown syntax for plain text
  const cleanText = content
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/#{1,6}\s/g, '')
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/`(.*?)`/g, '$1');

  const lines = doc.splitTextToSize(cleanText, 180);
  doc.setFontSize(10);
  doc.text(lines, 14, 30);

  const fileName = `odgovor_${new Date().toISOString().slice(0, 10)}.pdf`;
  await exportPDFDoc(doc, fileName);
}

async function printTable(headers: string[], rows: string[][]) {
  const html = `
    <html><head><title>V&M Balance - Ispis</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 20px; }
      h2 { margin-bottom: 4px; }
      .date { color: #666; font-size: 12px; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      th { background: #3b82f6; color: white; padding: 8px; text-align: left; }
      td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; }
      tr:nth-child(even) { background: #f5f7fa; }
    </style></head><body>
    <h2>V&M Balance - Izvoz podataka</h2>
    <div class="date">Datum: ${new Date().toLocaleDateString('hr-HR')}</div>
    <table>
      <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>
    </body></html>`;
  const w = window.open('', '_blank');
  if (w) {
    w.document.write(html);
    w.document.close();
    setTimeout(() => { w.print(); }, 300);
  } else {
    // Fallback if popup blocked — download as HTML
    const fileName = `ispis_${new Date().toISOString().slice(0, 10)}.html`;
    await exportTextFile(html, fileName, 'text/html');
  }
}

const MessageBubble = ({ message }: { message: ChatMessage }) => {
  const isUser = message.role === 'user';
  const tableData = !isUser ? extractTableData(message.content) : null;

  return (
    <div className={cn('flex gap-2', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <motion.div 
          className="flex-shrink-0 w-8 h-8 mt-1"
          animate={{ y: [0, -2, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <img src={aiAvatarImage} alt="AI" className="w-full h-full object-contain" />
        </motion.div>
      )}
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-4 py-2',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'
        )}
      >
        {isUser ? (
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        ) : (
          <>
            <div className="text-sm prose prose-sm dark:prose-invert max-w-none">
              <Suspense fallback={<div className="text-sm text-muted-foreground">...</div>}>
                <ReactMarkdown>{message.content}</ReactMarkdown>
              </Suspense>
            </div>
            {tableData ? (
              <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-border/50">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => exportToCSV(tableData.headers, tableData.rows)}
                >
                  <Download className="w-3 h-3" />
                  CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => exportToPDF(tableData.headers, tableData.rows)}
                >
                  <FileText className="w-3 h-3" />
                  PDF
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => printTable(tableData.headers, tableData.rows)}
                >
                  <Printer className="w-3 h-3" />
                  Ispis
                </Button>
              </div>
            ) : message.content.length > 100 && (
              <div className="flex gap-2 mt-2 pt-2 border-t border-border/50">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => exportResponseAsPDF(message.content)}
                >
                  <FileText className="w-3 h-3" />
                  Izvezi PDF
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
