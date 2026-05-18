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
  userId: string
): Promise<void> {
  const { error } = await (supabase.from(table) as any)
    .update({ deleted_at: new Date().toISOString(), deleted_by: userId })
    .eq('id', id);
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
