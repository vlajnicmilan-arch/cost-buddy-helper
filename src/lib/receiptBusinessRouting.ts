/**
 * USMJERAVANJE PREMA POSLOVNOM PROFILU — JEDINA implementacija živi u
 * `supabase/functions/_shared/businessRouting/receiptBusinessRouting.ts`
 * (dijele je preglednik i edge funkcije: sken računa i mail uvoz moraju
 * odlučivati ISTIM pravilima). Ovdje je samo re-export, obrazac kao kod `oib`.
 */

export {
  normalizeOibDigits,
  normalizeCompanyName,
  resolveReceiptBusinessRouting,
  isPersonalSourceForProfile,
} from '../../supabase/functions/_shared/businessRouting/receiptBusinessRouting.ts';

export type {
  RoutableBusinessProfile,
  ReceiptRouting,
  OwnerFundingChoice,
} from '../../supabase/functions/_shared/businessRouting/receiptBusinessRouting.ts';
