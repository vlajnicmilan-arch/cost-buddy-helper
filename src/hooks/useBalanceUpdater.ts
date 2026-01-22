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
   * - transfer: no change (transfers between accounts)
   */
  const updateBalance = useCallback(async (
    paymentSource: string | undefined,
    amount: number,
    type: TransactionType,
    isReversal: boolean = false
  ) => {
    if (!paymentSource) return;
    
    // Don't update for transfers
    if (type === 'transfer') return;

    // Calculate the balance change
    // For expense: subtract from balance (negative)
    // For income: add to balance (positive)
    // If reversal (delete/undo): invert the operation
    let balanceChange = type === 'expense' ? -amount : amount;
    if (isReversal) {
      balanceChange = -balanceChange;
    }

    if (isLocalMode) {
      // Handle local storage
      const stored = localStorage.getItem('customPaymentSources');
      if (stored) {
        const sources = JSON.parse(stored);
        const updatedSources = sources.map((source: any) => {
          if (source.id === paymentSource) {
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
        // First, get current balance
        const { data: sourceData, error: fetchError } = await supabase
          .from('custom_payment_sources')
          .select('balance')
          .eq('id', paymentSource)
          .eq('user_id', user.id)
          .single();

        if (fetchError) {
          // Source might not be a custom payment source (could be standard like 'cash', 'visa', etc.)
          // In that case, just skip the balance update
          console.log('Payment source not found or not custom:', paymentSource);
          return;
        }

        const currentBalance = sourceData?.balance || 0;
        const newBalance = currentBalance + balanceChange;

        // Update the balance
        const { error: updateError } = await supabase
          .from('custom_payment_sources')
          .update({ 
            balance: newBalance,
            updated_at: new Date().toISOString()
          })
          .eq('id', paymentSource)
          .eq('user_id', user.id);

        if (updateError) {
          console.error('Error updating payment source balance:', updateError);
        } else {
          // Notify that balance was updated
          onBalanceUpdated?.();
        }
      } catch (error) {
        console.error('Error in updateBalance:', error);
      }
    }
  }, [user, isLocalMode, onBalanceUpdated]);

  /**
   * Handles balance update when a transaction is modified
   * Reverses the old transaction effect and applies the new one
   */
  const handleTransactionUpdate = useCallback(async (
    oldPaymentSource: string | undefined,
    oldAmount: number,
    oldType: TransactionType,
    newPaymentSource: string | undefined,
    newAmount: number,
    newType: TransactionType
  ) => {
    // Reverse the old transaction effect
    await updateBalance(oldPaymentSource, oldAmount, oldType, true);
    
    // Apply the new transaction effect
    await updateBalance(newPaymentSource, newAmount, newType, false);
  }, [updateBalance]);

  return {
    updateBalance,
    handleTransactionUpdate
  };
};
