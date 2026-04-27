/**
 * useActivationFunnel — admin-only metric showing how many users
 * progress through the Project activation funnel:
 *   1. Registered (profile exists)
 *   2. Created at least one project
 *   3. Logged at least one transaction inside a project
 *
 * Uses lightweight count queries with `head: true` to avoid
 * fetching row data. Refresh on demand or on a 60s timer.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ActivationFunnel {
  registeredUsers: number;
  usersWithProjects: number;
  usersWithProjectTransactions: number;
  projectCreationRate: number;   // % of registered who made a project
  projectActivationRate: number; // % of project-creators who logged a transaction
  loading: boolean;
  error: string | null;
}

export const useActivationFunnel = () => {
  const [data, setData] = useState<ActivationFunnel>({
    registeredUsers: 0,
    usersWithProjects: 0,
    usersWithProjectTransactions: 0,
    projectCreationRate: 0,
    projectActivationRate: 0,
    loading: true,
    error: null,
  });

  const refresh = useCallback(async () => {
    setData((d) => ({ ...d, loading: true, error: null }));
    try {
      // 1. Total registered profiles
      const { count: regCount, error: regErr } = await supabase
        .from('profiles')
        .select('user_id', { count: 'exact', head: true });
      if (regErr) throw regErr;

      // 2. Distinct users with ≥1 project
      // Note: cannot do DISTINCT directly via head:true. Fetch lightweight rows.
      const { data: projOwners, error: projErr } = await supabase
        .from('projects')
        .select('user_id')
        .limit(50000);
      if (projErr) throw projErr;
      const uniqueProjectOwners = new Set((projOwners ?? []).map((r: any) => r.user_id));

      // 3. Distinct users with ≥1 expense linked to a project
      const { data: txOwners, error: txErr } = await supabase
        .from('expenses')
        .select('user_id')
        .not('project_id', 'is', null)
        .limit(50000);
      if (txErr) throw txErr;
      const uniqueProjectTxUsers = new Set((txOwners ?? []).map((r: any) => r.user_id));

      const registeredUsers = regCount ?? 0;
      const usersWithProjects = uniqueProjectOwners.size;
      const usersWithProjectTransactions = uniqueProjectTxUsers.size;

      const projectCreationRate = registeredUsers > 0
        ? (usersWithProjects / registeredUsers) * 100
        : 0;
      const projectActivationRate = usersWithProjects > 0
        ? (usersWithProjectTransactions / usersWithProjects) * 100
        : 0;

      setData({
        registeredUsers,
        usersWithProjects,
        usersWithProjectTransactions,
        projectCreationRate: Math.round(projectCreationRate * 10) / 10,
        projectActivationRate: Math.round(projectActivationRate * 10) / 10,
        loading: false,
        error: null,
      });
    } catch (e: any) {
      setData((d) => ({ ...d, loading: false, error: e?.message ?? String(e) }));
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 60_000);
    return () => clearInterval(t);
  }, [refresh]);

  return { ...data, refresh };
};
