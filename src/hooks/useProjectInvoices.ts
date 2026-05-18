import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAppState } from '@/contexts/AppStateContext';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { friendlyError } from '@/lib/errorMessages';

export interface InvoiceItem {
  description: string;
  quantity: number;
  unit_price: number;
  unit?: string;
  vat_rate?: number;
}

export type InvoiceStatus = 'issued' | 'partially_paid' | 'paid' | 'cancelled';

export interface ProjectInvoice {
  id: string;
  user_id: string;
  business_profile_id: string;
  invoice_number: string;
  project_id: string | null;
  estimate_id: string | null;
  client_name: string;
  client_oib: string | null;
  client_address: string | null;
  items: InvoiceItem[];
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  currency: string;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string | null;
  notes: string | null;
  client_email: string | null;
  auto_reminders_enabled: boolean;
  pdf_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoicePaymentSummary {
  paid: number;
  remaining: number;
  payments: Array<{ id: string; date: string; amount: number; description: string | null }>;
}

export const useProjectInvoices = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { activeBusinessProfileId } = useAppState();
  const [invoices, setInvoices] = useState<ProjectInvoice[]>([]);
  const [payments, setPayments] = useState<Record<string, InvoicePaymentSummary>>({});
  const [loading, setLoading] = useState(true);

  const fetchInvoices = useCallback(async () => {
    if (!user || !activeBusinessProfileId) {
      setInvoices([]);
      setPayments({});
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await (supabase
        .from('project_invoices') as any)
        .select('*')
        .eq('business_profile_id', activeBusinessProfileId)
        .order('issue_date', { ascending: false });
      if (error) throw error;
      const list = (data || []) as ProjectInvoice[];
      setInvoices(list);

      // Pull all income payments linked to these invoices in a single query.
      const ids = list.map(i => i.id);
      if (ids.length === 0) {
        setPayments({});
        return;
      }
      const { data: payRows } = await (supabase
        .from('expenses') as any)
        .select('id, invoice_id, amount, date, description')
        .in('invoice_id', ids);
      const map: Record<string, InvoicePaymentSummary> = {};
      list.forEach(inv => { map[inv.id] = { paid: 0, remaining: Number(inv.total_amount) || 0, payments: [] }; });
      (payRows || []).forEach((row: any) => {
        const bucket = map[row.invoice_id];
        if (!bucket) return;
        bucket.paid += Number(row.amount) || 0;
        bucket.payments.push({ id: row.id, date: row.date, amount: Number(row.amount) || 0, description: row.description });
      });
      list.forEach(inv => {
        const b = map[inv.id];
        b.remaining = (Number(inv.total_amount) || 0) - b.paid;
      });
      setPayments(map);
    } catch (err) {
      console.error('Error fetching invoices:', err);
    } finally {
      setLoading(false);
    }
  }, [user, activeBusinessProfileId]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  const generateInvoiceNumber = async (): Promise<string> => {
    const year = new Date().getFullYear();
    const prefix = `R-${year}-`;
    let nextSeq = 1;
    if (activeBusinessProfileId) {
      const { data } = await (supabase
        .from('project_invoices') as any)
        .select('invoice_number')
        .eq('business_profile_id', activeBusinessProfileId)
        .like('invoice_number', `${prefix}%`);
      if (Array.isArray(data) && data.length > 0) {
        const maxSeq = data.reduce((mx: number, row: any) => {
          const m = String(row.invoice_number || '').match(/-(\d+)$/);
          const n = m ? parseInt(m[1], 10) : 0;
          return Number.isFinite(n) && n > mx ? n : mx;
        }, 0);
        nextSeq = maxSeq + 1;
      }
    }
    return `${prefix}${String(nextSeq).padStart(3, '0')}`;
  };

  type NewInvoice = Omit<
    ProjectInvoice,
    'id' | 'user_id' | 'created_at' | 'updated_at' | 'business_profile_id' | 'invoice_number'
  > & { invoice_number?: string };

  const addInvoice = async (payload: NewInvoice) => {
    if (!user || !activeBusinessProfileId) return null;
    try {
      const insertData = {
        ...payload,
        user_id: user.id,
        business_profile_id: activeBusinessProfileId,
        invoice_number: payload.invoice_number || (await generateInvoiceNumber()),
      };
      const { data, error } = await (supabase
        .from('project_invoices') as any)
        .insert(insertData)
        .select()
        .single();
      if (error) throw error;
      showSuccess(t('invoices.toasts.created', 'Račun kreiran'));
      await fetchInvoices();
      return data as ProjectInvoice;
    } catch (err: any) {
      console.error('addInvoice failed', err);
      showError(friendlyError(err, 'errors.generic'));
      return null;
    }
  };

  const updateInvoice = async (id: string, patch: Partial<ProjectInvoice>) => {
    try {
      const { error } = await (supabase
        .from('project_invoices') as any)
        .update(patch)
        .eq('id', id);
      if (error) throw error;
      showSuccess(t('invoices.toasts.updated', 'Račun ažuriran'));
      await fetchInvoices();
    } catch (err: any) {
      showError(friendlyError(err, 'errors.generic'));
    }
  };

  const deleteInvoice = async (id: string) => {
    try {
      const { error } = await (supabase
        .from('project_invoices') as any)
        .delete()
        .eq('id', id);
      if (error) throw error;
      showSuccess(t('invoices.toasts.deleted', 'Račun obrisan'));
      await fetchInvoices();
    } catch (err: any) {
      showError(friendlyError(err, 'errors.generic'));
    }
  };

  // Computes effective status incl. overdue based on due_date and payments.
  const getEffectiveStatus = (inv: ProjectInvoice): InvoiceStatus | 'overdue' => {
    if (inv.status === 'cancelled' || inv.status === 'paid') return inv.status;
    const pay = payments[inv.id];
    if (pay && pay.paid >= (Number(inv.total_amount) || 0) && pay.paid > 0) return 'paid';
    if (inv.due_date) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const due = new Date(inv.due_date); due.setHours(0, 0, 0, 0);
      if (due.getTime() < today.getTime()) return 'overdue';
    }
    if (pay && pay.paid > 0) return 'partially_paid';
    return inv.status;
  };

  return {
    invoices,
    payments,
    loading,
    addInvoice,
    updateInvoice,
    deleteInvoice,
    getEffectiveStatus,
    refetch: fetchInvoices,
  };
};
