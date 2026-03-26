import { useState, useCallback, useEffect } from 'react';
import { useAppState } from '@/contexts/AppStateContext';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface FinancialContext {
  balance: string;
  totalIncome: string;
  totalExpenses: string;
  transactionCount: number;
  categoryBreakdown: string;
  paymentSources: string;
  cards: string;
  recentTransactions: string;
  budgets: string;
  projects: string;
  historicalTrends?: string;
  trendAnalysis?: string;
}

interface UseFinancialAssistantProps {
  financialContext: FinancialContext;
}

export const useFinancialAssistant = ({ financialContext }: UseFinancialAssistantProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { onFinancialReset } = useAppState();

  // Listen for data reset event via Context
  useEffect(() => {
    const unsubscribe = onFinancialReset(() => {
      setMessages([]);
    });
    return unsubscribe;
  }, [onFinancialReset]);

  const sendMessage = useCallback(async (input: string) => {
    const userMsg: ChatMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    let assistantContent = '';

    const updateAssistant = (chunk: string) => {
      assistantContent += chunk;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant') {
          return prev.map((m, i) => 
            i === prev.length - 1 ? { ...m, content: assistantContent } : m
          );
        }
        return [...prev, { role: 'assistant', content: assistantContent }];
      });
    };

    try {
      // Get user's auth token for DB access in tool calls
      const { supabase } = await import('@/integrations/supabase/client');
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/financial-assistant`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            messages: [...messages, userMsg],
            financialContext,
          }),
        }
      );

      if (!resp.ok || !resp.body) {
        const errorData = await resp.json().catch(() => ({}));
        throw new Error(errorData.error || 'Greška pri komunikaciji s asistentom');
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) updateAssistant(content);
          } catch {
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }

      // Flush remaining buffer
      if (textBuffer.trim()) {
        for (let raw of textBuffer.split('\n')) {
          if (!raw) continue;
          if (raw.endsWith('\r')) raw = raw.slice(0, -1);
          if (raw.startsWith(':') || raw.trim() === '') continue;
          if (!raw.startsWith('data: ')) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) updateAssistant(content);
          } catch { /* ignore */ }
        }
      }
    } catch (error) {
      console.error('Financial assistant error:', error);
      setMessages(prev => [
        ...prev.filter(m => m.role !== 'assistant' || m.content),
        { 
          role: 'assistant', 
          content: `Žao mi je, došlo je do greške: ${error instanceof Error ? error.message : 'Nepoznata greška'}` 
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [messages, financialContext]);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    isLoading,
    sendMessage,
    clearMessages,
  };
};
