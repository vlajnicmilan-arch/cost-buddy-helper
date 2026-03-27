import { useState, useCallback, useEffect, useRef } from 'react';
import { useAppState } from '@/contexts/AppStateContext';
import { supabase } from '@/integrations/supabase/client';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface UserMemory {
  id: string;
  content: string;
  category: string;
  created_at: string;
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
  activeBusinessProfileId?: string | null;
  businessProfileName?: string;
}

function generateUUID(): string {
  return crypto.randomUUID?.() || 
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

export const useFinancialAssistant = ({ financialContext, activeBusinessProfileId, businessProfileName }: UseFinancialAssistantProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [memories, setMemories] = useState<UserMemory[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const { onFinancialReset } = useAppState();
  const sessionIdRef = useRef<string>(generateUUID());
  const historyLoadedRef = useRef(false);

  // Listen for data reset event via Context
  useEffect(() => {
    const unsubscribe = onFinancialReset(() => {
      setMessages([]);
      sessionIdRef.current = generateUUID();
      historyLoadedRef.current = false;
    });
    return unsubscribe;
  }, [onFinancialReset]);

  // Load previous chat history and memories on first mount
  const loadHistory = useCallback(async () => {
    if (historyLoadedRef.current) return;
    historyLoadedRef.current = true;
    setIsLoadingHistory(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setIsLoadingHistory(false);
        return;
      }

      // Load last session's messages (find the latest session_id)
      const { data: latestMsg } = await supabase
        .from('chat_messages')
        .select('session_id')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(1) as any;

      if (latestMsg && latestMsg.length > 0) {
        const lastSessionId = latestMsg[0].session_id;
        sessionIdRef.current = lastSessionId;

        const { data: historyData } = await supabase
          .from('chat_messages')
          .select('role, content')
          .eq('user_id', session.user.id)
          .eq('session_id', lastSessionId)
          .order('created_at', { ascending: true })
          .limit(30) as any;

        if (historyData && historyData.length > 0) {
          setMessages(historyData.map((m: any) => ({ role: m.role, content: m.content })));
        }
      }

      // Load memories
      const bpId = activeBusinessProfileId || null;
      let memQuery = supabase
        .from('user_memories')
        .select('id, content, category, created_at')
        .eq('user_id', session.user.id)
        .order('updated_at', { ascending: false }) as any;

      if (bpId) {
        memQuery = memQuery.eq('business_profile_id', bpId);
      } else {
        memQuery = memQuery.is('business_profile_id', null);
      }

      const { data: memData } = await memQuery;
      if (memData) {
        setMemories(memData);
      }
    } catch (e) {
      console.error('Error loading chat history:', e);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [activeBusinessProfileId]);

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
            activeBusinessProfileId: activeBusinessProfileId || null,
            businessProfileName: businessProfileName || null,
            sessionId: sessionIdRef.current,
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
  }, [messages, financialContext, activeBusinessProfileId, businessProfileName]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    // Start a new session
    sessionIdRef.current = generateUUID();
    historyLoadedRef.current = true; // Don't reload old history
  }, []);

  const deleteMemory = useCallback(async (memoryId: string) => {
    try {
      await supabase.from('user_memories').delete().eq('id', memoryId) as any;
      setMemories(prev => prev.filter(m => m.id !== memoryId));
    } catch (e) {
      console.error('Error deleting memory:', e);
    }
  }, []);

  const deleteAllMemories = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      let query = supabase
        .from('user_memories')
        .delete()
        .eq('user_id', session.user.id) as any;

      const bpId = activeBusinessProfileId || null;
      if (bpId) {
        query = query.eq('business_profile_id', bpId);
      } else {
        query = query.is('business_profile_id', null);
      }

      await query;
      setMemories([]);
    } catch (e) {
      console.error('Error deleting all memories:', e);
    }
  }, [activeBusinessProfileId]);

  const refreshMemories = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const bpId = activeBusinessProfileId || null;
      let memQuery = supabase
        .from('user_memories')
        .select('id, content, category, created_at')
        .eq('user_id', session.user.id)
        .order('updated_at', { ascending: false }) as any;

      if (bpId) {
        memQuery = memQuery.eq('business_profile_id', bpId);
      } else {
        memQuery = memQuery.is('business_profile_id', null);
      }

      const { data } = await memQuery;
      if (data) setMemories(data);
    } catch (e) {
      console.error('Error refreshing memories:', e);
    }
  }, [activeBusinessProfileId]);

  return {
    messages,
    isLoading,
    isLoadingHistory,
    memories,
    sendMessage,
    clearMessages,
    loadHistory,
    deleteMemory,
    deleteAllMemories,
    refreshMemories,
  };
};
