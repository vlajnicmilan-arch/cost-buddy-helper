/**
 * Pure helper for resolving swipe-to-reveal state from a horizontal drag delta.
 *
 * Convention: negative deltaX = swipe LEFT (revealing right-side actions).
 * Positive deltaX (right swipe) is ignored — row stays closed.
 *
 * Used by SwipeableRow to decide whether to snap open or back to closed
 * after a drag ends.
 */

export type SwipeSnapTarget = 'open' | 'closed';

export interface ResolveSwipeOptions {
  /** Total width (px) of the revealed action panel. Must be > 0. */
  actionWidth: number;
  /** Fraction of actionWidth past which a left-drag snaps open. Default 0.4. */
  openThreshold?: number;
}

/**
 * Decide whether the row should snap open or closed after a drag ends.
 *
 * @param deltaX  signed horizontal offset from rest position (px). Negative = left.
 * @returns `'open'` if the row should reveal actions, `'closed'` otherwise.
 */
export const resolveSwipeSnap = (
  deltaX: number,
  { actionWidth, openThreshold = 0.4 }: ResolveSwipeOptions,
): SwipeSnapTarget => {
  if (!Number.isFinite(deltaX) || actionWidth <= 0) return 'closed';
  // Right swipes never open
  if (deltaX >= 0) return 'closed';
  const distance = Math.abs(deltaX);
  return distance >= actionWidth * openThreshold ? 'open' : 'closed';
};

/**
 * Clamp a raw drag offset to the valid left-swipe range [-actionWidth, 0].
 * Right swipes are clamped to 0 (row cannot move right past rest).
 */
export const clampSwipeOffset = (deltaX: number, actionWidth: number): number => {
  if (!Number.isFinite(deltaX)) return 0;
  if (deltaX >= 0) return 0;
  return Math.max(deltaX, -actionWidth);
};
