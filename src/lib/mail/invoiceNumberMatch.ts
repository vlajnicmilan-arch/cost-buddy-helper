/**
 * Usporedba brojeva računa za meku branu duplikata — JEDINA implementacija živi
 * u `supabase/functions/_shared/mailImport/invoiceNumberMatch.ts`. Ovdje je samo
 * re-export, obrazac kao kod `docType.ts` / `dateNormalize.ts`.
 */

export {
  normalizeInvoiceNumber,
  invoiceNumbersMatch,
  findDuplicateCandidate,
  MAX_AFFIX_TOLERANCE,
} from '../../../supabase/functions/_shared/mailImport/invoiceNumberMatch.ts';
export type {
  DuplicateCandidateRow,
  DuplicateMatch,
  DuplicateMatchReason,
  DuplicateProbe,
} from '../../../supabase/functions/_shared/mailImport/invoiceNumberMatch.ts';

/** Ključ meke najave duplikata (dijele ga worker i UI). */
export { PROBABLE_DUPLICATE_WARNING } from '../../../supabase/functions/_shared/mailImport/softDuplicate.ts';
