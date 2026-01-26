import { useState, useRef, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bot, Send, Loader2, Trash2, Sparkles } from 'lucide-react';
import { useFinancialAssistant, ChatMessage } from '@/hooks/useFinancialAssistant';
import { useCurrency } from '@/contexts/CurrencyContext';
import { Expense } from '@/types/expense';
import { CustomPaymentSource } from '@/types/customPaymentSource';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';

interface FinancialAssistantDialogProps {
  expenses: Expense[];
  totalIncome: number;
  totalExpenses: number;
  balance: number;
  paymentSources: CustomPaymentSource[];
  budgets?: Array<{ name: string; total_amount: number; spent?: number }>;
}

export const FinancialAssistantDialog = ({
  expenses,
  totalIncome,
  totalExpenses,
  balance,
  paymentSources,
  budgets = [],
}: FinancialAssistantDialogProps) => {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { formatAmount } = useCurrency();

  // Build financial context from props
  const financialContext = useMemo(() => {
    // Category breakdown
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

    // Recent transactions (last 10)
    const recentTx = expenses
      .slice(0, 10)
      .map(e => `- ${e.date.toLocaleDateString('hr-HR')}: ${e.description} (${e.type === 'income' ? '+' : '-'}${formatAmount(e.amount)})`)
      .join('\n') || 'Nema transakcija';

    // Budgets
    const budgetsStr = budgets.length > 0
      ? budgets.map(b => `- ${b.name}: ${formatAmount(b.spent || 0)} / ${formatAmount(b.total_amount)}`).join('\n')
      : 'Nema aktivnih budžeta';

    return {
      balance: formatAmount(balance),
      totalIncome: formatAmount(totalIncome),
      totalExpenses: formatAmount(totalExpenses),
      transactionCount: expenses.length,
      categoryBreakdown,
      paymentSources: paymentSourcesStr,
      recentTransactions: recentTx,
      budgets: budgetsStr,
    };
  }, [expenses, totalIncome, totalExpenses, balance, paymentSources, budgets, formatAmount]);

  const { messages, isLoading, sendMessage, clearMessages } = useFinancialAssistant({
    financialContext,
  });

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
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

  const quickQuestions = [
    'Kako mogu uštedjeti više novca?',
    'Koja kategorija troši najviše?',
    'Analiza mojih financija',
    'Savjeti za budžetiranje',
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 rounded-xl">
          <Sparkles className="w-4 h-4" />
          <span className="hidden sm:inline">AI Asistent</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] h-[85vh] sm:h-[600px] flex flex-col p-0">
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

        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="space-y-4">
              <div className="text-center text-muted-foreground py-8">
                <Bot className="w-12 h-12 mx-auto mb-4 text-primary/50" />
                <p className="font-medium">Pozdrav! Ja sam tvoj financijski asistent.</p>
                <p className="text-sm mt-2">
                  Postavi mi pitanje o tvojim financijama ili odaberi jedno od brzih pitanja ispod.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {quickQuestions.map((q, i) => (
                  <Button
                    key={i}
                    variant="outline"
                    className="justify-start text-left h-auto py-3 px-4"
                    onClick={() => {
                      setInput(q);
                      sendMessage(q);
                    }}
                    disabled={isLoading}
                  >
                    {q}
                  </Button>
                ))}
              </div>
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
      </DialogContent>
    </Dialog>
  );
};

const MessageBubble = ({ message }: { message: ChatMessage }) => {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-2',
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
