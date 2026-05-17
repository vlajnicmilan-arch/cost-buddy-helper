/**
 * Hook for managing collaborator advances on a project.
 * See mem://features/collaborator-advances and plan in .lovable/plan.md
 *
 * Rules:
 * - Advances are expenses with `is_advance = true` and a `collaborator_id`.
 * - A final invoice (non-advance expense) with the same collaborator can pull
 *   multiple unlinked advances via `linked_advance_ids`.
 * - 1 advance -> at most 1 final invoice (enforced by validate_advance_links trigger).
 */
import { useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Expense } from '@/types/expense';

export interface CollaboratorAdvanceSummary {
  collaboratorId: string;
  totalAdvances: number;        // sum of all advance amounts
  unlinkedAdvances: Expense[];  // advances not yet linked to any final invoice
  unlinkedTotal: number;
  totalInvoices: number;        // sum of non-advance expense amounts (bruto)
  netPaid: number;              // unique cash outflow (advances + (invoice - linked advances))
}

const toNumber = (v: unknown) => Number(v || 0);

export const getCollaboratorAdvancesFromExpenses = (
  expenses: Expense[],
  collaboratorId: string
): Expense[] => {
  return expenses.filter(
    e => e.collaborator_id === collaboratorId && e.is_advance === true
  );
};

export const getUnlinkedAdvancesFromExpenses = (
  expenses: Expense[],
  collaboratorId: string
): Expense[] => {
  const advances = getCollaboratorAdvancesFromExpenses(expenses, collaboratorId);
  const linkedSet = new Set<string>();
  for (const e of expenses) {
    if (e.linked_advance_ids && Array.isArray(e.linked_advance_ids)) {
      for (const id of e.linked_advance_ids) linkedSet.add(id);
    }
  }
  return advances.filter(a => !linkedSet.has(a.id));
};

export const getCollaboratorSummary = (
  expenses: Expense[],
  collaboratorId: string
): CollaboratorAdvanceSummary => {
  const advances = getCollaboratorAdvancesFromExpenses(expenses, collaboratorId);
  const totalAdvances = advances.reduce((s, e) => s + toNumber(e.amount), 0);
  const unlinkedAdvances = getUnlinkedAdvancesFromExpenses(expenses, collaboratorId);
  const unlinkedTotal = unlinkedAdvances.reduce((s, e) => s + toNumber(e.amount), 0);

  const invoices = expenses.filter(
    e => e.collaborator_id === collaboratorId && !e.is_advance && e.type === 'expense'
  );
  const totalInvoices = invoices.reduce((s, e) => s + toNumber(e.amount), 0);

  // Net cash out: advances (all paid) + sum( invoice - linkedAdvances, capped at 0 )
  let invoicesNet = 0;
  for (const inv of invoices) {
    const linkedSum = (inv.linked_advance_ids || []).reduce((s, id) => {
      const a = advances.find(x => x.id === id);
      return a ? s + toNumber(a.amount) : s;
    }, 0);
    invoicesNet += Math.max(toNumber(inv.amount) - linkedSum, 0);
  }
  const netPaid = totalAdvances + invoicesNet;

  return {
    collaboratorId,
    totalAdvances,
    unlinkedAdvances,
    unlinkedTotal,
    totalInvoices,
    netPaid,
  };
};

export const useCollaboratorAdvances = (expenses: Expense[]) => {
  const getUnlinked = useCallback(
    (collaboratorId: string) => getUnlinkedAdvancesFromExpenses(expenses, collaboratorId),
    [expenses]
  );

  const getSummary = useCallback(
    (collaboratorId: string) => getCollaboratorSummary(expenses, collaboratorId),
    [expenses]
  );

  /**
   * Updates the final invoice's linked_advance_ids array.
   * The DB trigger validates collaborator match + no double-linking.
   */
  const linkAdvancesToInvoice = useCallback(
    async (invoiceId: string, advanceIds: string[]): Promise<{ success: boolean; error?: string }> => {
      try {
        const { error } = await supabase
          .from('expenses')
          .update({ linked_advance_ids: advanceIds } as never)
          .eq('id', invoiceId);
        if (error) throw error;
        return { success: true };
      } catch (e) {
        const msg = (e as Error)?.message || 'unknown';
        console.error('linkAdvancesToInvoice failed:', msg);
        return { success: false, error: msg };
      }
    },
    []
  );

  return useMemo(
    () => ({ getUnlinked, getSummary, linkAdvancesToInvoice }),
    [getUnlinked, getSummary, linkAdvancesToInvoice]
  );
};
