import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type {
  CohortRetentionRow,
  ActivationRow,
  FunnelDayRow,
} from '@/lib/retentionMath';

const ONE_HOUR = 60 * 60 * 1000;

export const useCohortRetention = (enabled = true) =>
  useQuery({
    queryKey: ['admin', 'retention', 'cohort'],
    enabled,
    staleTime: ONE_HOUR,
    queryFn: async (): Promise<CohortRetentionRow[]> => {
      const { data, error } = await supabase.rpc('admin_get_cohort_retention');
      if (error) throw error;
      return (data ?? []) as CohortRetentionRow[];
    },
  });

export const useActivationByCohort = (enabled = true) =>
  useQuery({
    queryKey: ['admin', 'retention', 'activation'],
    enabled,
    staleTime: ONE_HOUR,
    queryFn: async (): Promise<ActivationRow[]> => {
      const { data, error } = await supabase.rpc('admin_get_activation_by_cohort');
      if (error) throw error;
      return (data ?? []) as ActivationRow[];
    },
  });

export const useFunnelSummary30d = (enabled = true) =>
  useQuery({
    queryKey: ['admin', 'retention', 'funnel30d'],
    enabled,
    staleTime: ONE_HOUR,
    queryFn: async (): Promise<FunnelDayRow[]> => {
      const { data, error } = await supabase.rpc('admin_get_funnel_summary_30d');
      if (error) throw error;
      return (data ?? []) as FunnelDayRow[];
    },
  });
