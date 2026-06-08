import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useStorage } from '@/contexts/StorageContext';
import { useAppState } from '@/contexts/AppStateContext';
import { format, startOfMonth, endOfMonth, addMonths, addYears, parseISO } from 'date-fns';
import { buildExpenseScopeFilter, type ScopeContext } from '@/lib/expenseScope';

export interface CalendarEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  type: 'expense' | 'income' | 'transfer' | 'reminder' | 'birthday' | 'planned_expense' | 'deadline' | 'holiday';
  source: 'expense' | 'reminder' | 'recurring' | 'holiday';
  amount?: number;
  category?: string;
  description?: string;
  isCompleted?: boolean;
  rawData?: any;
}

export const useCalendarEvents = (currentMonth: Date) => {
  const { user } = useAuth();
  const { storageMode } = useStorage();
  const { activeBusinessProfileId } = useAppState();
  const [expenses, setExpenses] = useState<any[]>([]);
  const [reminders, setReminders] = useState<any[]>([]);
  const [recurringTransactions, setRecurringTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const isLocalMode = storageMode === 'local' && !user;

  const monthStart = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(currentMonth), 'yyyy-MM-dd');

  const fetchAll = useCallback(async () => {
    if (isLocalMode || !user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const bpFilter = activeBusinessProfileId || null;

      // P0: resolve caller's shared payment-source set BEFORE the expenses
      // query so we can restrict it to "my rows OR rows on a source I share".
      // Without this filter the RLS is_project_member branch leaks foreign
      // project transactions into the personal calendar.
      const [ownedPsRes, memberRes] = await Promise.all([
        supabase.from('custom_payment_sources').select('id').eq('user_id', user.id),
        supabase.from('payment_source_members').select('payment_source_id').eq('user_id', user.id),
      ]);
      const sharedIds = new Set<string>();
      (ownedPsRes.data || []).forEach((s: any) => sharedIds.add(s.id));
      (memberRes.data || []).forEach((m: any) => sharedIds.add(m.payment_source_id));
      const scopeCtx: ScopeContext = { userId: user.id, sharedPaymentSourceIds: sharedIds };
      const scopeFilter = buildExpenseScopeFilter(scopeCtx);

      // Fetch expenses for the month
      let expQ = supabase
        .from('expenses')
        .select('id, description, amount, date, type, category, merchant_name, user_id, payment_source, income_source_id')
        .gte('date', `${monthStart}T00:00:00`)
        .lte('date', `${monthEnd}T23:59:59`);

      if (scopeFilter) expQ = expQ.or(scopeFilter);

      if (bpFilter) {
        expQ = expQ.eq('business_profile_id', bpFilter);
      } else {
        expQ = expQ.is('business_profile_id', null);
      }

      // Fetch reminders for the month
      let remQ = supabase
        .from('reminders')
        .select('*')
        .gte('remind_at', `${monthStart}T00:00:00`)
        .lte('remind_at', `${monthEnd}T23:59:59`);

      if (bpFilter) {
        remQ = remQ.eq('business_profile_id', bpFilter);
      } else {
        remQ = remQ.is('business_profile_id', null);
      }

      // Fetch active recurring transactions
      let recQ = supabase
        .from('recurring_transactions')
        .select('*')
        .eq('is_active', true);

      if (bpFilter) {
        recQ = recQ.eq('business_profile_id', bpFilter);
      } else {
        recQ = recQ.is('business_profile_id', null);
      }

      const [expRes, remRes, recRes] = await Promise.all([expQ, remQ, recQ]);

      setExpenses(expRes.data || []);
      setReminders(remRes.data || []);
      setRecurringTransactions(recRes.data || []);
    } catch (err) {
      console.error('Calendar fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [user, isLocalMode, activeBusinessProfileId, monthStart, monthEnd]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Build date -> events map
  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    const addEvent = (dateKey: string, event: CalendarEvent) => {
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(event);
    };

    // Expenses
    expenses.forEach(e => {
      const dateKey = format(new Date(e.date), 'yyyy-MM-dd');
      addEvent(dateKey, {
        id: e.id,
        title: e.description,
        date: dateKey,
        type: e.type as any,
        source: 'expense',
        amount: e.amount,
        category: e.category,
        rawData: e,
      });
    });

    // Reminders
    reminders.forEach(r => {
      const dateKey = format(new Date(r.remind_at), 'yyyy-MM-dd');
      const reminderType = (r.type === 'birthday' || r.type === 'planned_expense' || r.type === 'deadline')
        ? r.type : 'reminder';
      addEvent(dateKey, {
        id: r.id,
        title: r.title,
        date: dateKey,
        type: reminderType as any,
        source: 'reminder',
        description: r.description,
        isCompleted: r.is_completed,
        rawData: r,
      });
    });

    // Recurring transactions - project future dates within this month
    const mStart = startOfMonth(currentMonth);
    const mEnd = endOfMonth(currentMonth);

    recurringTransactions.forEach(r => {
      const nextDue = parseISO(r.next_due_date);
      // Generate occurrences within this month
      let checkDate = new Date(nextDue);
      
      // If next_due_date is before month start, advance it
      while (checkDate < mStart) {
        checkDate = advanceDate(checkDate, r.frequency, r.day_of_month);
      }

      // Add occurrences within the month (max 5 per recurring)
      let count = 0;
      while (checkDate <= mEnd && count < 5) {
        const dateKey = format(checkDate, 'yyyy-MM-dd');
        // Don't add if there's already an expense for this recurring on this date
        const alreadyGenerated = expenses.some(e => 
          e.description === r.description && format(new Date(e.date), 'yyyy-MM-dd') === dateKey
        );
        if (!alreadyGenerated) {
          addEvent(dateKey, {
            id: `rec-${r.id}-${dateKey}`,
            title: `🔄 ${r.description}`,
            date: dateKey,
            type: r.type as any,
            source: 'recurring',
            amount: r.amount,
            category: r.category,
            rawData: r,
          });
        }
        checkDate = advanceDate(checkDate, r.frequency, r.day_of_month);
        count++;
      }
    });

    return map;
  }, [expenses, reminders, recurringTransactions, currentMonth]);

  // Add reminder
  const addReminder = async (data: {
    title: string;
    description?: string;
    remind_at: string;
    type: string;
  }) => {
    if (!user) return;

    const { error } = await supabase
      .from('reminders')
      .insert({
        user_id: user.id,
        title: data.title,
        description: data.description || null,
        remind_at: data.remind_at,
        type: data.type,
        business_profile_id: activeBusinessProfileId || null,
      } as any);

    if (error) throw error;
    await fetchAll();
  };

  // Delete reminder
  const deleteReminder = async (id: string) => {
    const { error } = await supabase
      .from('reminders')
      .delete()
      .eq('id', id);
    if (error) throw error;
    await fetchAll();
  };

  // Toggle reminder completed
  const toggleReminderComplete = async (id: string, completed: boolean) => {
    const { error } = await supabase
      .from('reminders')
      .update({ is_completed: completed } as any)
      .eq('id', id);
    if (error) throw error;
    await fetchAll();
  };

  return {
    eventsByDate,
    loading,
    addReminder,
    deleteReminder,
    toggleReminderComplete,
    refetch: fetchAll,
  };
};

function advanceDate(date: Date, frequency: string, dayOfMonth?: number | null): Date {
  const next = new Date(date);
  switch (frequency) {
    case 'daily': next.setDate(next.getDate() + 1); break;
    case 'weekly': next.setDate(next.getDate() + 7); break;
    case 'biweekly': next.setDate(next.getDate() + 14); break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      if (dayOfMonth) {
        const max = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
        next.setDate(Math.min(dayOfMonth, max));
      }
      break;
    case 'yearly': next.setFullYear(next.getFullYear() + 1); break;
    default: next.setMonth(next.getMonth() + 1);
  }
  return next;
}
