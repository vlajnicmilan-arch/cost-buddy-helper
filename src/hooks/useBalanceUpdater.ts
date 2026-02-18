import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useStorage } from '@/contexts/StorageContext';
import { TransactionType } from '@/types/expense';

interface UseBalanceUpdaterOptions {
  onBalanceUpdated?: () => void;
}

export const useBalanceUpdater = (options?: UseBalanceUpdaterOptions) => {
  const { user } = useAuth();
  const { storageMode } = useStorage();
  const isLocalMode = storageMode === 'local' && !user;
  const { onBalanceUpdated } = options || {};

  /**
   * Updates the balance of a custom payment source based on transaction type
   * - expense: decreases balance
   * - income: increases balance
   * - transfer: decreases balance (source account)
   */
  const updateBalance = useCallback(async (
    paymentSource: string | undefined,
    amount: number,
    type: TransactionType,
    isReversal: boolean = false
  ) => {
    if (!paymentSource) return;

    // Strip 'custom:' prefix if present
    const cleanSourceId = paymentSource.startsWith('custom:')
      ? paymentSource.replace('custom:', '')
      : paymentSource;

    // Only update balance for UUID-based custom payment sources
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(cleanSourceId)) return;

    // Calculate the balance change
    let balanceChange = (type === 'expense' || type === 'transfer') ? -amount : amount;
    if (isReversal) balanceChange = -balanceChange;

    if (isLocalMode) {
      const stored = localStorage.getItem('customPaymentSources');
      if (stored) {
        const sources = JSON.parse(stored);
        const updatedSources = sources.map((source: any) => {
          if (source.id === cleanSourceId) {
            return {
              ...source,
              balance: (source.balance || 0) + balanceChange,
              updated_at: new Date().toISOString()
            };
          }
          return source;
        });
        localStorage.setItem('customPaymentSources', JSON.stringify(updatedSources));
      }
    } else {
      if (!user) return;

      try {
        const { data: sourceData, error: fetchError } = await supabase
          .from('custom_payment_sources')
          .select('balance, id, name')
          .eq('id', cleanSourceId)
          .maybeSingle();

        if (fetchError) {
          console.error('[BalanceUpdater] Error fetching payment source:', fetchError);
          return;
        }

        if (!sourceData) return;

        const currentBalance = sourceData?.balance || 0;
        const newBalance = currentBalance + balanceChange;

        const { error: updateError } = await supabase
          .from('custom_payment_sources')
          .update({
            balance: newBalance,
            updated_at: new Date().toISOString()
          })
          .eq('id', sourceData.id);

        if (updateError) {
          console.error('[BalanceUpdater] Error updating balance:', updateError);
        } else {
          onBalanceUpdated?.();
        }
      } catch (error) {
        console.error('[BalanceUpdater] Error in updateBalance:', error);
      }
    }
  }, [user, isLocalMode, onBalanceUpdated]);

  /**
   * Handles balance update when a transaction is modified.
   * Reverses the old effect and applies the new one.
   */
  const handleTransactionUpdate = useCallback(async (
    oldPaymentSource: string | undefined,
    oldAmount: number,
    oldType: TransactionType,
    newPaymentSource: string | undefined,
    newAmount: number,
    newType: TransactionType,
    oldIncomeSourceId?: string | undefined,
    newIncomeSourceId?: string | undefined
  ) => {
    // Reverse the old transaction effect on source
    await updateBalance(oldPaymentSource, oldAmount, oldType, true);

    // For old transfers: also reverse the destination credit
    if (oldType === 'transfer' && oldIncomeSourceId) {
      await updateBalance(oldIncomeSourceId, oldAmount, 'income', true);
    }

    // Apply the new transaction effect on source
    await updateBalance(newPaymentSource, newAmount, newType, false);

    // For new transfers: also apply the destination credit
    if (newType === 'transfer' && newIncomeSourceId) {
      await updateBalance(newIncomeSourceId, newAmount, 'income', false);
    }
  }, [updateBalance]);

  return {
    updateBalance,
    handleTransactionUpdate
  };
};
