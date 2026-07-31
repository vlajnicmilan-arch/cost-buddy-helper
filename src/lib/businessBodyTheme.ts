/**
 * Body-scoped business theme.
 *
 * The business theme class used to live only on the BusinessModeView wrapper
 * div. Radix dialogs portal to `document.body`, i.e. OUTSIDE that div, so in
 * business mode every portal rendered with the user's personal theme.
 * Putting the theme class on <body> makes portals inherit it too.
 *
 * Inherently dark business themes (Onyx / premium-dark) must look identical
 * regardless of the personal light/dark setting. The personal `dark` class
 * lives on <html>; while such a theme is active we additionally place `dark`
 * on <body> so Tailwind `dark:` variants inside business UI behave the same
 * in both personal settings. Removal is tracked via a marker attribute so we
 * never strip a class we did not add.
 */
export const BUSINESS_THEME_PREFIX = 'business-theme-';
export const DEFAULT_BUSINESS_THEME = 'ocean-blue';

/** Business themes that define a full, inherently dark palette. */
export const DARK_BUSINESS_THEMES = new Set(['premium-dark']);

const DARK_MARKER = 'data-business-dark';

/**
 * Applies (or clears) the business theme on the given body element.
 * Idempotent: always removes any previously applied business theme class
 * first, so switching companies can never leave two classes behind.
 */
export function applyBusinessBodyTheme(
  themeColor: string | null | undefined,
  body: HTMLElement = document.body,
): void {
  Array.from(body.classList)
    .filter((c) => c.startsWith(BUSINESS_THEME_PREFIX))
    .forEach((c) => body.classList.remove(c));

  if (body.hasAttribute(DARK_MARKER)) {
    body.classList.remove('dark');
    body.removeAttribute(DARK_MARKER);
  }

  if (!themeColor) return;

  body.classList.add(`${BUSINESS_THEME_PREFIX}${themeColor}`);

  if (DARK_BUSINESS_THEMES.has(themeColor)) {
    body.classList.add('dark');
    body.setAttribute(DARK_MARKER, 'true');
  }
}

/** Convenience for cleanup paths. */
export function clearBusinessBodyTheme(body: HTMLElement = document.body): void {
  applyBusinessBodyTheme(null, body);
}
