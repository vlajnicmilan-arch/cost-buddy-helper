import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface BankConnection {
  id: string;
  user_id: string;
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
  account_uid: string;
  iban: string | null;
  name: string | null;
  currency: string;
  balance: number | null;
  balance_updated_at: string | null;
}

export const useBankConnections = () => {
  const { user } = useAuth();
  const qc = useQueryClient();

  const connectionsQuery = useQuery({
    queryKey: ['bank-connections', user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async (): Promise<BankConnection[]> => {
      const { data, error } = await supabase
        .from('bank_connections')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as BankConnection[];
    },
  });

  const accountsQuery = useQuery({
    queryKey: ['bank-accounts', user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async (): Promise<BankAccount[]> => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('*')
        .order('created_at', { ascending: false });
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
    },
  });

  return {
    connections: connectionsQuery.data ?? [],
    accounts: accountsQuery.data ?? [],
    isLoading: connectionsQuery.isLoading || accountsQuery.isLoading,
    refetch: () => {
      connectionsQuery.refetch();
      accountsQuery.refetch();
    },
    disconnect: disconnect.mutateAsync,
    isDisconnecting: disconnect.isPending,
  };
};
