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
    
    // Strip 'custom:' prefix if present (used in payment_source field)
    const cleanSourceId = paymentSource.startsWith('custom:') 
      ? paymentSource.replace('custom:', '') 
      : paymentSource;
    
    // Calculate the balance change
    // For expense/transfer: subtract from balance (negative)
    // For income: add to balance (positive)
    // If reversal (delete/undo): invert the operation
    let balanceChange = (type === 'expense' || type === 'transfer') ? -amount : amount;
    if (isReversal) {
      balanceChange = -balanceChange;
    }

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
        // First try to find by ID (custom payment source UUID)
        // Don't filter by user_id - RLS handles access control (owner OR member)
        let { data: sourceData, error: fetchError } = await supabase
          .from('custom_payment_sources')
          .select('balance, id')
          .eq('id', cleanSourceId)
          .maybeSingle();

        // If not found by ID, try matching by name (for standard sources like 'diners' -> 'Diners Club')
        if (!sourceData) {
          // Map standard payment source IDs to common names for matching
          const standardNameMap: Record<string, string[]> = {
            'diners': ['diners', 'diners club'],
            'visa': ['visa'],
            'visa_gold': ['visa gold'],
            'visa_platinum': ['visa platinum'],
            'mastercard': ['mastercard'],
            'mastercard_gold': ['mastercard gold'],
            'mastercard_platinum': ['mastercard platinum'],
            'maestro': ['maestro'],
            'amex': ['american express', 'amex'],
            'revolut': ['revolut'],
            'aircash': ['aircash'],
            'cash': ['gotovina', 'cash'],
            'bank': ['banka', 'bank'],
            'crypto': ['kripto', 'crypto'],
          };
          
          const searchNames = standardNameMap[cleanSourceId.toLowerCase()];
          if (searchNames) {
            const { data: matchedSource } = await supabase
              .from('custom_payment_sources')
              .select('balance, id')
              .ilike('name', `%${searchNames[searchNames.length > 1 ? 1 : 0]}%`)
              .maybeSingle();
            
            if (matchedSource) {
              sourceData = matchedSource;
            }
          }
        }

        if (!sourceData) {
          console.log('Payment source not found or not custom:', cleanSourceId);
          return;
        }

        const currentBalance = sourceData?.balance || 0;
        const newBalance = currentBalance + balanceChange;

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
