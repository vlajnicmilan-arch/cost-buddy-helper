/**
 * Šifra obračunskog mjesta — JEDINA implementacija živi u
 * `supabase/functions/_shared/mailImport/paymentReference.ts`. Ovdje je samo
 * re-export, obrazac kao kod `oib.ts`.
 */

export {
  findPlaceCode,
  PLACE_CODE_AMBIGUOUS_WARNING,
} from '../../../supabase/functions/_shared/mailImport/paymentReference.ts';
export type { PlaceCodePick } from '../../../supabase/functions/_shared/mailImport/paymentReference.ts';
