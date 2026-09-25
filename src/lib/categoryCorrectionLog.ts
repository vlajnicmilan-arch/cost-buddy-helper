/**
 * Nalog 6: ispravak kategorije u uređivanju zapisa → `category_corrections`
 * (isti oblik kao Pregled kategorija). Iz toga automatsko razvrstavanje uči.
 * Samo osobni zapisi; poslovni i projektni način se ne dira.
 */
import { EXEMPT_CATEGORY_ID } from '@/lib/categoryAssign';

export interface CorrectionSourceRow {
  id: string;
  category: string;
  type?: string | null;
  category_origin?: string | null;
  movement_kind?: string | null;
  tags?: string[] | null;
  merchant_name?: string | null;
  description?: string | null;
  business_profile_id?: string | null;
  project_id?: string | null;
}

export interface EditCorrectionRow {
  user_id: string;
  expense_id: string;
  original_category: string;
  corrected_category: string;
  original_origin: string;
  merchant_name: string | null;
  description: string | null;
  original_movement_kind: string | null;
  corrected_movement_kind: string | null;
  original_tags: string[];
  corrected_tags: string[];
}

export const buildEditCorrection = (
  oldRow: CorrectionSourceRow | null | undefined,
  next: CorrectionSourceRow,
  userId: string,
): EditCorrectionRow | null => {
  if (!oldRow || !userId) return null;
  if (oldRow.category === next.category) return null;
  if (next.type === 'transfer' || oldRow.type === 'transfer') return null;
  if (oldRow.business_profile_id || oldRow.project_id || next.business_profile_id || next.project_id) return null;
  if (oldRow.category === EXEMPT_CATEGORY_ID || next.category === EXEMPT_CATEGORY_ID) return null;
  if (!next.category) return null;
  const oldTags = oldRow.tags ?? [];
  return {
    user_id: userId,
    expense_id: next.id,
    original_category: oldRow.category,
    corrected_category: next.category,
    original_origin: oldRow.category_origin || 'user_edit',
    merchant_name: next.merchant_name ?? null,
    description: next.description ?? null,
    original_movement_kind: oldRow.movement_kind ?? null,
    corrected_movement_kind: next.movement_kind !== undefined ? next.movement_kind ?? null : oldRow.movement_kind ?? null,
    original_tags: oldTags,
    corrected_tags: Array.isArray(next.tags) ? next.tags : oldTags,
  };
};
