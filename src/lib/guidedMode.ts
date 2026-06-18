/**
 * Guided home — pure logic. UI-agnostic; testabilan.
 *
 * Threshold je klijentska konstanta (UX odluka, ne podatak). Promjena ne traži
 * migraciju.
 */

export const GUIDED_EXPENSE_THRESHOLD = 3;

export type GuidedHomeStatus =
  | 'standard'   // korisnik je izvan guideda (po server signalu ili po pragu unosa)
  | 'zero_data'  // u guidedu, još 0 stvarnih unosa
  | 'guided';    // u guidedu, 1..THRESHOLD-1 unosa

export interface GuidedStatusInput {
  /** ISO string ili Date iz `profiles.guided_home_exited_at`. `null` = još u guidedu. */
  guidedHomeExitedAt: string | null | undefined;
  /** Broj stvarnih unosa korisnika (sve transakcije, sve vrste). */
  expenseCount: number;
}

export function getGuidedHomeStatus(input: GuidedStatusInput): GuidedHomeStatus {
  if (input.guidedHomeExitedAt) return 'standard';
  if (input.expenseCount >= GUIDED_EXPENSE_THRESHOLD) return 'standard';
  if (input.expenseCount <= 0) return 'zero_data';
  return 'guided';
}

/** Treba li klijent pozvati `mark_guided_home_exited()` RPC sada. */
export function shouldAutoExitGuided(input: GuidedStatusInput): boolean {
  return !input.guidedHomeExitedAt && input.expenseCount >= GUIDED_EXPENSE_THRESHOLD;
}
