import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useAppState } from '@/contexts/AppStateContext';

export interface BankConnection {
  id: string;
  user_id: string;
  business_profile_id: string | null;
  provider: string;
  aspsp_name: string | null;
  bank_name: string;
  aspsp_country: string | null;
  status: string;
  valid_until: string | null;
  session_id: string | null;
  created_at: string;
  last_error: string | null;
}

export interface BankAccount {
  id: string;
  connection_id: string;
  business_profile_id: string | null;
  account_uid: string;
  iban: string | null;
  name: string | null;
  currency: string;
  balance: number | null;
  balance_updated_at: string | null;
  linked_payment_source_id: string | null;
  last_synced_at: string | null;
  last_sync_error: string | null;
}

/**
 * Per-context bank connections.
 * - Personal mode (activeBusinessProfileId === null) → only connections with business_profile_id IS NULL
 * - Business mode → only connections matching the active business_profile_id
 */
export const useBankConnections = () => {
  const { user } = useAuth();
  const { activeBusinessProfileId } = useAppState();
  const qc = useQueryClient();

  const ctxKey = activeBusinessProfileId ?? 'personal';

  const connectionsQuery = useQuery({
    queryKey: ['bank-connections', user?.id, ctxKey],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async (): Promise<BankConnection[]> => {
      let q = supabase.from('bank_connections').select('*').order('created_at', { ascending: false });
      if (activeBusinessProfileId) {
        q = q.eq('business_profile_id', activeBusinessProfileId);
      } else {
        q = q.is('business_profile_id', null);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as BankConnection[];
    },
  });

  const accountsQuery = useQuery({
    queryKey: ['bank-accounts', user?.id, ctxKey],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async (): Promise<BankAccount[]> => {
      let q = supabase.from('bank_accounts').select('*').order('created_at', { ascending: false });
      if (activeBusinessProfileId) {
        q = q.eq('business_profile_id', activeBusinessProfileId);
      } else {
        q = q.is('business_profile_id', null);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as BankAccount[];
    },
  });

  const disconnect = useMutation({
    mutationFn: async (connectionId: string) => {
      const { error } = await supabase
        .from('bank_connections')
        .delete()
        .eq('id', connectionId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank-connections'] });
      qc.invalidateQueries({ queryKey: ['bank-accounts'] });
      // Invalidiraj bank-linked cache koji koristi useExpenseCRUD za odluku
      // pending_bank vs manual prilikom novog unosa.
      import('@/lib/bankLinkedSources').then(({ invalidateBankLinkedSourceIds }) => {
        invalidateBankLinkedSourceIds();
      });
    },
  });

  return {
    connections: connectionsQuery.data ?? [],
    accounts: accountsQuery.data ?? [],
    isLoading: connectionsQuery.isLoading || accountsQuery.isLoading,
    activeBusinessProfileId,
    refetch: () => {
      connectionsQuery.refetch();
      accountsQuery.refetch();
    },
    disconnect: disconnect.mutateAsync,
    isDisconnecting: disconnect.isPending,
  };
};
