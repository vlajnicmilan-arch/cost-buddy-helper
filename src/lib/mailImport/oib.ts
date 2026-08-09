/**
 * OIB validacija — JEDINA implementacija živi u
 * `supabase/functions/_shared/mailImport/oib.ts` (dijele je preglednik i edge
 * funkcije). Ovdje je samo re-export, obrazac kao kod `parseUbl`.
 */

export {
  isValidOib,
  normalizeOib,
  findValidOibs,
  pickSupplierOib,
  OIB_AMBIGUOUS_WARNING,
} from '../../../supabase/functions/_shared/mailImport/oib.ts';
export type { SupplierOibPick } from '../../../supabase/functions/_shared/mailImport/oib.ts';
