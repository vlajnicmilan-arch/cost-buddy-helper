import { useEffect } from 'react';
import {
  applyBusinessBodyTheme,
  clearBusinessBodyTheme,
  FORCED_BUSINESS_THEME,
} from '@/lib/businessBodyTheme';

/**
 * Keeps `document.body` carrying the active business theme class so Radix
 * portals (dialogs, popovers, toasts) render inside the business theme too.
 *
 * Business mode has a single look (Onyx / `premium-dark`) — the per-company
 * `theme_color` is intentionally ignored for rendering.
 *
 * Pass `null` for `businessProfileId` in personal mode — the body is then
 * byte-identical to the personal setup.
 */
export function useBusinessBodyTheme(
  businessProfileId: string | null | undefined,
): void {
  useEffect(() => {
    if (!businessProfileId) {
      clearBusinessBodyTheme();
      return;
    }
    applyBusinessBodyTheme(FORCED_BUSINESS_THEME);
    return () => clearBusinessBodyTheme();
  }, [businessProfileId]);
}
