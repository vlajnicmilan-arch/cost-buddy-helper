import { useMemo } from 'react';
import { useProjectInvoices, ProjectInvoice } from './useProjectInvoices';

export interface AgingBucket {
  label: '0-30' | '31-60' | '61-90' | '90+';
  invoices: ProjectInvoice[];
  total: number;
}

export interface UnpaidInvoicesSummary {
  loading: boolean;
  unpaid: Array<ProjectInvoice & { remaining: number; daysOverdue: number }>;
  totalOutstanding: number;
  overdueCount: number;
  overdueTotal: number;
  buckets: AgingBucket[];
}

/**
 * Aggregates unpaid invoices for the currently active business profile
 * (scoped through useProjectInvoices). Computes outstanding amount per
 * invoice and groups overdue invoices into aging buckets.
 */
export const useUnpaidInvoices = (): UnpaidInvoicesSummary => {
  const { invoices, payments, loading } = useProjectInvoices();

  return useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const unpaid: Array<ProjectInvoice & { remaining: number; daysOverdue: number }> = [];
    let totalOutstanding = 0;
    let overdueCount = 0;
    let overdueTotal = 0;

    const buckets: Record<AgingBucket['label'], AgingBucket> = {
      '0-30': { label: '0-30', invoices: [], total: 0 },
      '31-60': { label: '31-60', invoices: [], total: 0 },
      '61-90': { label: '61-90', invoices: [], total: 0 },
      '90+': { label: '90+', invoices: [], total: 0 },
    };

    invoices.forEach(inv => {
      if (inv.status === 'cancelled' || inv.status === 'paid') return;
      const total = Number(inv.total_amount) || 0;
      const paid = payments[inv.id]?.paid || 0;
      const remaining = total - paid;
      if (remaining <= 0) return;

      let daysOverdue = 0;
      if (inv.due_date) {
        const due = new Date(inv.due_date);
        due.setHours(0, 0, 0, 0);
        daysOverdue = Math.floor((today.getTime() - due.getTime()) / 86400000);
      }

      unpaid.push({ ...inv, remaining, daysOverdue });
      totalOutstanding += remaining;

      if (daysOverdue > 0) {
        overdueCount += 1;
        overdueTotal += remaining;
        const key: AgingBucket['label'] =
          daysOverdue <= 30 ? '0-30' :
          daysOverdue <= 60 ? '31-60' :
          daysOverdue <= 90 ? '61-90' : '90+';
        buckets[key].invoices.push(inv);
        buckets[key].total += remaining;
      }
    });

    // Order: most-overdue first
    unpaid.sort((a, b) => b.daysOverdue - a.daysOverdue);

    return {
      loading,
      unpaid,
      totalOutstanding,
      overdueCount,
      overdueTotal,
      buckets: ['0-30', '31-60', '61-90', '90+'].map(k => buckets[k as AgingBucket['label']]),
    };
  }, [invoices, payments, loading]);
};
