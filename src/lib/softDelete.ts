import { supabase } from '@/integrations/supabase/client';

export type SoftDeleteTable = 'expenses' | 'projects' | 'project_invoices' | 'project_estimates' | 'project_milestones';
export type TrashEntity = 'expense' | 'project' | 'invoice' | 'estimate';

/**
 * Soft delete: označava red kao obrisan postavljajući deleted_at i deleted_by.
 * RLS restriktivna policy `hide_soft_deleted` automatski skriva ovaj red iz svih SELECT-ova.
 */
export async function softDelete(
  table: SoftDeleteTable,
  id: string,
  _userId: string
): Promise<void> {
  // Koristi SECURITY DEFINER RPC da zaobiđe RESTRICTIVE `hide_soft_deleted`
  // SELECT policy koja PostgREST tretira kao WITH CHECK na RETURNING redu.
  const { error } = await (supabase.rpc as any)('soft_delete_record', {
    p_table: table,
    p_id: id,
  });
  if (error) throw error;
}

/** Vraća soft-obrisan red iz koša. Koristi RPC zbog audita; cascade trigger riješi povezano. */
export async function restoreTrashItem(entity: TrashEntity, id: string): Promise<void> {
  const { error } = await (supabase.rpc as any)('restore_trash_item', { p_entity: entity, p_id: id });
  if (error) throw error;
}

/** Trajno briše red iz koša. */
export async function purgeTrashItem(entity: TrashEntity, id: string): Promise<void> {
  const { error } = await (supabase.rpc as any)('purge_trash_item', { p_entity: entity, p_id: id });
  if (error) throw error;
}

export interface TrashItem {
  entity_type: TrashEntity;
  id: string;
  title: string;
  deleted_at: string;
  deleted_by: string | null;
  deleter_name: string | null;
  project_id: string | null;
}

export async function listTrash(): Promise<TrashItem[]> {
  const { data, error } = await (supabase.rpc as any)('list_trash');
  if (error) throw error;
  return (data ?? []) as TrashItem[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Primjenjuje balance delta na custom_payment_sources zapis.
 * Mirror logike iz useBalanceUpdater.updateBalance — koristi se iz ne-hook kontekstā
 * (Trash page, undo callback) kako bi se nakon restore-a balance vratio.
 */
async function applyBalanceDelta(paymentSource: string | undefined, delta: number): Promise<void> {
  if (!paymentSource || delta === 0) return;
  const cleanId = paymentSource.startsWith('custom:') ? paymentSource.replace('custom:', '') : paymentSource;
  if (!UUID_RE.test(cleanId)) return;
  const { data: src } = await supabase
    .from('custom_payment_sources')
    .select('id, balance')
    .eq('id', cleanId)
    .maybeSingle();
  if (!src) return;
  await supabase
    .from('custom_payment_sources')
    .update({ balance: (src.balance ?? 0) + delta, updated_at: new Date().toISOString() })
    .eq('id', src.id);
}

interface ExpenseLike {
  type: 'expense' | 'income' | 'transfer';
  amount: number;
  payment_source?: string | null;
  income_source_id?: string | null;
}

/** Re-applies the balance side-effect for a restored expense (forward direction). */
export async function reapplyExpenseBalance(expense: ExpenseLike): Promise<void> {
  const amount = Number(expense.amount) || 0;
  if (expense.type === 'income') {
    await applyBalanceDelta(expense.payment_source ?? undefined, amount);
  } else if (expense.type === 'expense') {
    await applyBalanceDelta(expense.payment_source ?? undefined, -amount);
  } else if (expense.type === 'transfer') {
    await applyBalanceDelta(expense.payment_source ?? undefined, -amount);
    if (expense.income_source_id) {
      await applyBalanceDelta(expense.income_source_id, amount);
    }
  }
}

/** Restore + balance reapply za soft-obrisanu transakciju. */
export async function restoreExpenseFull(id: string): Promise<void> {
  await restoreTrashItem('expense', id);
  // RLS sad pokazuje red — dohvat za balance reapply
  const { data } = await supabase
    .from('expenses')
    .select('type, amount, payment_source, income_source_id')
    .eq('id', id)
    .maybeSingle();
  if (data) await reapplyExpenseBalance(data as any);
}
