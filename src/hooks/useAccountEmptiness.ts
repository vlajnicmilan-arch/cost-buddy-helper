/**
 * Loads the server-computed emptiness state for a batch of accounts.
 * The list of content tables is derived from the schema INSIDE the database
 * function; the client only passes user ids.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { AccountEmptinessMap } from '@/lib/adminEmptyAccount';

export function useAccountEmptiness(userIds: string[]) {
  const [map, setMap] = useState<AccountEmptinessMap>({});
  const [loading, setLoading] = useState(false);
  const key = userIds.join(',');

  const load = useCallback(async () => {
    const ids = key ? key.split(',') : [];
    if (ids.length === 0) {
      setMap({});
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.rpc('admin_accounts_emptiness' as never, {
      p_user_ids: ids,
    } as never);
    setLoading(false);
    if (error || !data) return;
    const accounts = (data as { accounts?: AccountEmptinessMap }).accounts ?? {};
    setMap(accounts);
  }, [key]);

  useEffect(() => {
    void load();
  }, [load]);

  return { emptiness: map, loading, reload: load };
}
