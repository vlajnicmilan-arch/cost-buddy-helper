/**
 * Boot timing marks — lightweight, module-level performance markers used to
 * measure how long it takes from app start until the Home page is ready
 * (`home_ready` diagnostic event in src/pages/Index.tsx).
 *
 * - markOnce(name) records performance.now() ONLY the first time a name is
 *   seen; later calls return the stored value unchanged.
 * - All values are integer milliseconds since performance.timeOrigin.
 * - Purely observational: must never throw and never change app behavior.
 */

const marks: Record<string, number> = {};

export const markOnce = (name: string, at?: number): number => {
  if (marks[name] === undefined) {
    marks[name] = Math.round(at ?? performance.now());
  }
  return marks[name];
};

export const getMarks = (): Record<string, number> => ({ ...marks });

// ----- home_ready once-per-load gate -----
// Module-level flag (not React state) so re-renders and navigating back to
// Home within the same page load cannot produce duplicate events.
let homeReadyReported = false;

/** Returns true exactly once per page load — the caller may then log. */
export const claimHomeReadyReport = (): boolean => {
  if (homeReadyReported) return false;
  homeReadyReported = true;
  return true;
};

export const homeReadySeverity = (tTotal: number): 'warning' | 'info' =>
  tTotal > 5000 ? 'warning' : 'info';

/** Test-only: reset module state between test cases. */
export const __resetBootTimingForTests = (): void => {
  for (const key of Object.keys(marks)) delete marks[key];
  homeReadyReported = false;
};
