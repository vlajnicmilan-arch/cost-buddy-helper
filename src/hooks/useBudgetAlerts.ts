import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useStorage } from '@/contexts/StorageContext';

export const useBudgetAlerts = () => {
  const { user } = useAuth();
  const { storageMode } = useStorage();

  const checkBudgetAlerts = useCallback(async (category: string, amount: number, expenseDate?: Date) => {
    // Only check alerts in cloud mode
    if (storageMode === 'local' || !user) {
      return { alerts: [] };
    }

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) {
        console.error('No auth token available');
        return { alerts: [] };
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-budget-alerts`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            category,
            amount,
            expense_date: expenseDate?.toISOString() || new Date().toISOString(),
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Budget alerts check failed:', errorData);
        return { alerts: [] };
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error checking budget alerts:', error);
      return { alerts: [] };
    }
  }, [user, storageMode]);

  return { checkBudgetAlerts };
};
