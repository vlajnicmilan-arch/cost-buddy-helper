/**
 * BRIEF-VRATA V1 — kontinuitet po uredaju (localStorage, 0 ms).
 * Ne ide u bazu i ne trosi budzet od 400 ms.
 */
import type { BriefContinuity } from './types';

export const BRIEF_CONTINUITY_KEY = 'vmb-brief-gate:continuity:v1';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function safeStorage(override?: StorageLike | null): StorageLike | null {
  if (override) return override;
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readContinuity(storage?: StorageLike | null): BriefContinuity {
  try {
    const raw = safeStorage(storage)?.getItem(BRIEF_CONTINUITY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as BriefContinuity) : {};
  } catch {
    return {};
  }
}

export function writeContinuity(value: BriefContinuity, storage?: StorageLike | null): void {
  try {
    safeStorage(storage)?.setItem(BRIEF_CONTINUITY_KEY, JSON.stringify(value));
  } catch {
    /* private mode / quota — fail-open */
  }
}
