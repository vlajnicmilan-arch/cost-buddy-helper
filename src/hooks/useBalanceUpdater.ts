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
    if (!paymentSource) {
      console.log('[BalanceUpdater] Skipping - no paymentSource provided');
      return;
    }
    
    // Strip 'custom:' prefix if present (used in payment_source field)
    const cleanSourceId = paymentSource.startsWith('custom:') 
      ? paymentSource.replace('custom:', '') 
      : paymentSource;
    
    // CRITICAL: Only update balance for UUID-based custom payment sources
    // Standard sources like "cash", "diners", "visa" etc. don't have tracked balances
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(cleanSourceId)) {
      console.log('[BalanceUpdater] Skipping non-UUID source (standard source):', cleanSourceId);
      return;
    }
    
    // Calculate the balance change
    // For expense/transfer: subtract from balance (negative)
    // For income: add to balance (positive)
    // If reversal (delete/undo): invert the operation
    let balanceChange = (type === 'expense' || type === 'transfer') ? -amount : amount;
    if (isReversal) {
      balanceChange = -balanceChange;
    }

    console.log(`[BalanceUpdater] Processing: source=${cleanSourceId}, amount=${amount}, type=${type}, reversal=${isReversal}, balanceChange=${balanceChange}`);

    if (isLocalMode) {
      // Handle local storage
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
        // Find by ID (custom payment source UUID)
        // Don't filter by user_id - RLS handles access control (owner OR member)
        const { data: sourceData, error: fetchError } = await supabase
          .from('custom_payment_sources')
          .select('balance, id, name')
          .eq('id', cleanSourceId)
          .maybeSingle();

        if (fetchError) {
          console.error('[BalanceUpdater] Error fetching by ID:', fetchError);
          return;
        }

        if (!sourceData) {
          console.log('[BalanceUpdater] Payment source not found:', cleanSourceId);
          return;
        }

        const currentBalance = sourceData?.balance || 0;
        const newBalance = currentBalance + balanceChange;

        console.log(`[BalanceUpdater] Updating "${sourceData.name}" (${sourceData.id}): ${currentBalance} → ${newBalance} (change: ${balanceChange > 0 ? '+' : ''}${balanceChange})`);

        // Update the balance
        // Don't filter by user_id - RLS handles access (owner OR member can update)
        const { error: updateError } = await supabase
          .from('custom_payment_sources')
          .update({ 
            balance: newBalance,
            updated_at: new Date().toISOString()
          })
          .eq('id', sourceData.id);

        if (updateError) {
          console.error('[BalanceUpdater] Error updating payment source balance:', updateError);
        } else {
          console.log(`[BalanceUpdater] ✓ Balance updated successfully for "${sourceData.name}"`);
          // Notify that balance was updated
          onBalanceUpdated?.();
        }
      } catch (error) {
        console.error('[BalanceUpdater] Error in updateBalance:', error);
      }
    }
  }, [user, isLocalMode, onBalanceUpdated]);

  /**
   * Handles balance update when a transaction is modified
   * Reverses the old transaction effect and applies the new one
   * For transfers: also handles destination account (income_source_id)
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
    console.log('[BalanceUpdater] handleTransactionUpdate:', {
      oldSource: oldPaymentSource, oldAmount, oldType, oldDest: oldIncomeSourceId,
      newSource: newPaymentSource, newAmount, newType, newDest: newIncomeSourceId
    });

    // Reverse the old transaction effect on source
    await updateBalance(oldPaymentSource, oldAmount, oldType, true);
    
    // For old transfers: also reverse the destination credit
    if (oldType === 'transfer' && oldIncomeSourceId) {
      console.log('[BalanceUpdater] Reversing old transfer destination:', oldIncomeSourceId);
      await updateBalance(oldIncomeSourceId, oldAmount, 'income', true);
    }
    
    // Apply the new transaction effect on source
    await updateBalance(newPaymentSource, newAmount, newType, false);
    
    // For new transfers: also apply the destination credit
    if (newType === 'transfer' && newIncomeSourceId) {
      console.log('[BalanceUpdater] Applying new transfer destination:', newIncomeSourceId);
      await updateBalance(newIncomeSourceId, newAmount, 'income', false);
    }
  }, [updateBalance]);

  return {
    updateBalance,
    handleTransactionUpdate
  };
};
