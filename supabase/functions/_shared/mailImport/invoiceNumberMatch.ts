/**
 * Usporedba brojeva računa — JEDINA implementacija živi u `softDuplicate.ts`
 * (isti direktorij), jer edge bundler mora vidjeti samo poznate module.
 * Ovdje je imenovani ulaz za preglednik.
 */
export {
  normalizeInvoiceNumber,
  invoiceNumbersMatch,
  findDuplicateCandidate,
  MAX_AFFIX_TOLERANCE,
  PROBABLE_DUPLICATE_WARNING,
} from "./softDuplicate.ts";
export type {
  DuplicateCandidateRow,
  DuplicateMatch,
  DuplicateMatchReason,
  DuplicateProbe,
} from "./softDuplicate.ts";
