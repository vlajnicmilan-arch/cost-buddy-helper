import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAppState } from '@/contexts/AppStateContext';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { tr, friendlyError } from '@/lib/errorMessages';

export interface EstimateItem {
  description: string;
  quantity: number;
  unit_price: number;
  unit?: string;
  vat_rate?: number;
}

export type EstimateStatus = 'draft' | 'sent' | 'accepted' | 'rejected';

export interface ProjectEstimate {
  id: string;
  user_id: string;
  business_profile_id: string;
  estimate_number: string;
  client_name: string;
  client_oib: string | null;
  client_address: string | null;
  items: EstimateItem[];
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  status: EstimateStatus;
  valid_until: string | null;
  notes: string | null;
  accepted_project_id: string | null;
  created_at: string;
  updated_at: string;
}

export const useProjectEstimates = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { activeBusinessProfileId } = useAppState();
  const [estimates, setEstimates] = useState<ProjectEstimate[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEstimates = useCallback(async () => {
    if (!user || !activeBusinessProfileId) {
      setEstimates([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await (supabase
        .from('project_estimates') as any)
        .select('*')
        .eq('business_profile_id', activeBusinessProfileId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setEstimates((data || []) as ProjectEstimate[]);
    } catch (err) {
      console.error('Error fetching estimates:', err);
    } finally {
      setLoading(false);
    }
  }, [user, activeBusinessProfileId]);

  useEffect(() => { fetchEstimates(); }, [fetchEstimates]);

  // Year-based numbering: counts existing P-YYYY-* numbers for current year
  // within active business profile. Avoids collisions across years and matches
  // common Croatian numbering convention (P-2026-001).
  const generateEstimateNumber = async (): Promise<string> => {
    const year = new Date().getFullYear();
    const prefix = `P-${year}-`;
    let nextSeq = 1;
    if (activeBusinessProfileId) {
      const { data } = await (supabase
        .from('project_estimates') as any)
        .select('estimate_number')
        .eq('business_profile_id', activeBusinessProfileId)
        .like('estimate_number', `${prefix}%`);
      if (Array.isArray(data) && data.length > 0) {
        const maxSeq = data.reduce((mx: number, row: any) => {
          const m = String(row.estimate_number || '').match(/-(\d+)$/);
          const n = m ? parseInt(m[1], 10) : 0;
          return Number.isFinite(n) && n > mx ? n : mx;
        }, 0);
        nextSeq = maxSeq + 1;
      }
    } else {
      nextSeq = estimates.length + 1;
    }
    return `${prefix}${String(nextSeq).padStart(3, '0')}`;
  };

  const addEstimate = async (
    payload: Omit<ProjectEstimate, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'estimate_number' | 'business_profile_id'> & { estimate_number?: string }
  ) => {
    if (!user) return null;
    if (!activeBusinessProfileId) {
      showError(t('invoices.errors.noBusinessContext', 'Ponude se mogu kreirati samo u kontekstu tvrtke. Prebaci se na tvrtku na dashboardu.'));
      return null;
    }
    try {
      const insertData = {
        ...payload,
        user_id: user.id,
        business_profile_id: activeBusinessProfileId,
        estimate_number: payload.estimate_number || (await generateEstimateNumber()),
      };
      const { data, error } = await (supabase
        .from('project_estimates') as any)
        .insert(insertData)
        .select()
        .single();
      if (error) throw error;
      showSuccess(t('toasts.estimateCreated'));
      await fetchEstimates();
      return data as ProjectEstimate;
    } catch (err: any) {
      console.error('addEstimate failed', err);
      showError(friendlyError(err, "errors.generic"));
      return null;
    }
  };

  const updateEstimate = async (id: string, patch: Partial<ProjectEstimate>) => {
    try {
      const { error } = await (supabase
        .from('project_estimates') as any)
        .update(patch)
        .eq('id', id);
      if (error) throw error;
      showSuccess(t('toasts.estimateUpdated'));
      await fetchEstimates();
    } catch (err: any) {
      showError(friendlyError(err, "errors.generic"));
    }
  };

  const deleteEstimate = async (id: string) => {
    try {
      const { error } = await (supabase
        .from('project_estimates') as any)
        .delete()
        .eq('id', id);
      if (error) throw error;
      showSuccess(t('toasts.estimateDeleted'));
      await fetchEstimates();
    } catch (err: any) {
      showError(friendlyError(err, "errors.generic"));
    }
  };

  const convertToProject = async (estimate: ProjectEstimate): Promise<string | null> => {
    if (!user || !activeBusinessProfileId) return null;
    try {
      const { data: project, error: projErr } = await supabase
        .from('projects')
        .insert({
          user_id: user.id,
          business_profile_id: activeBusinessProfileId,
          name: `${estimate.client_name} — ${estimate.estimate_number}`,
          description: estimate.notes || null,
          icon: '📋',
          color: '#3b82f6',
          status: 'active',
          total_budget: estimate.total_amount,
          // Auto-fill contract_value from accepted estimate (only on create — never overwrites existing)
          contract_value: estimate.total_amount,
        } as any)
        .select()
        .single();
      if (projErr) throw projErr;

      await (supabase.from('project_estimates') as any)
        .update({ accepted_project_id: project.id, status: 'accepted' })
        .eq('id', estimate.id);

      showSuccess(t('toasts.projectCreatedFromEstimate'));
      await fetchEstimates();
      return project.id;
    } catch (err: any) {
      showError(friendlyError(err, "errors.project.estimateConvert"));
      return null;
    }
  };

  return {
    estimates,
    loading,
    addEstimate,
    updateEstimate,
    deleteEstimate,
    convertToProject,
    refetch: fetchEstimates,
  };
};
