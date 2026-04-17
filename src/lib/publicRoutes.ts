/**
 * Centralized public-route detection.
 *
 * Public routes are screens that must work BEFORE the user is authenticated
 * or has selected a storage mode. On these routes:
 *   - The global Android/browser back-button manager must NOT intercept
 *     navigation or push synthetic history entries.
 *   - The lock screen must never render.
 *   - GDPR / cookie banners and other authenticated overlays must stay hidden.
 *
 * Keep this list in sync with the routes registered in `src/App.tsx`.
 */

const PUBLIC_ROUTES: ReadonlyArray<string> = [
  "/",
  "/app", // transient redirect target — treat as public so overlays don't flash
  "/auth",
  "/setup",
  "/install",
  "/reset-password",
  "/onboarding",
  "/privacy-policy",
  "/terms-of-service",
  "/unsubscribe",
  "/landing",
];

const PUBLIC_ROUTE_PREFIXES: ReadonlyArray<string> = [
  "/join-project/",
  "/join-budget/",
  "/join-family/",
];

/** Normalize a pathname so trailing slashes / casing don't create gaps. */
const normalize = (pathname: string): string => {
  if (!pathname) return "/";
  let p = pathname.toLowerCase();
  // Strip trailing slash except for the root
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p;
};

export const isPublicRoute = (pathname: string): boolean => {
  const p = normalize(pathname);
  if (PUBLIC_ROUTES.includes(p)) return true;
  return PUBLIC_ROUTE_PREFIXES.some((prefix) => p.startsWith(prefix));
};

/** Routes that count as the app's "root" — back from anywhere else navigates here. */
const ROOT_APP_ROUTES: ReadonlyArray<string> = ["/home", "/dashboard"];

export const isRootAppRoute = (pathname: string): boolean => {
  return ROOT_APP_ROUTES.includes(normalize(pathname));
};
