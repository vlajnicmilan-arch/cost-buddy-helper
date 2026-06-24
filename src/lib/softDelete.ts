import { supabase } from '@/integrations/supabase/client';

export type SoftDeleteTable = 'expenses' | 'projects' | 'project_invoices' | 'project_estimates' | 'project_milestones';
export type TrashEntity = 'expense' | 'project' | 'invoice' | 'estimate';

/**
 * Soft delete: označava red kao obrisan postavljajući deleted_at i deleted_by.
 * RLS restriktivna policy `hide_soft_deleted` automatski skriva ovaj red iz svih SELECT-ova.
 */
/**
 * Greska bacena kad downgrade owner pokusa obrisati projekt-domenski zapis.
 * UI je hvata i prikazuje ProjectReadOnlyBanner / dialog umjesto sirovog Postgres errora.
 */
export class ProjectReadOnlyError extends Error {
  code = 'projects_readonly' as const;
  constructor(message = 'projects_readonly') {
    super(message);
    this.name = 'ProjectReadOnlyError';
  }
}

export function isProjectsReadonlyError(error: unknown): boolean {
  if (!error) return false;
  const e = error as { code?: string; message?: string };
  return e.code === '42501' || (e.message ?? '').includes('projects_readonly');
}

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
  if (error) {
    if (isProjectsReadonlyError(error)) throw new ProjectReadOnlyError();
    throw error;
  }
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
 * NOTE: Balance recompute for custom payment sources is handled by the database
 * trigger `trg_expenses_recompute_source_balance` (anchor-based model).
 * Soft-delete and restore both perform UPDATE on `expenses` (via RPC), which
 * fires the trigger and recomputes the affected source(s). Client-side delta
 * application would double-count and is therefore a no-op now.
 */
interface ExpenseLike {
  type: 'expense' | 'income' | 'transfer';
  amount: number;
  payment_source?: string | null;
  income_source_id?: string | null;
}

export async function reapplyExpenseBalance(_expense: ExpenseLike): Promise<void> {
  // No-op: trigger recomputes source balance on UPDATE of `expenses`.
  return;
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
