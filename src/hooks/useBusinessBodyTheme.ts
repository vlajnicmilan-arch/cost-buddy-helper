import { useEffect } from 'react';
import {
  applyBusinessBodyTheme,
  clearBusinessBodyTheme,
  DEFAULT_BUSINESS_THEME,
} from '@/lib/businessBodyTheme';

/**
 * Keeps `document.body` carrying the active business theme class so Radix
 * portals (dialogs, popovers, toasts) render inside the business theme too.
 *
 * Pass `null` for `businessProfileId` in personal mode — the body is then
 * byte-identical to the personal setup.
 */
export function useBusinessBodyTheme(
  businessProfileId: string | null | undefined,
  themeColor: string | null | undefined,
): void {
  useEffect(() => {
    if (!businessProfileId) {
      clearBusinessBodyTheme();
      return;
    }
    applyBusinessBodyTheme(themeColor || DEFAULT_BUSINESS_THEME);
    return () => clearBusinessBodyTheme();
  }, [businessProfileId, themeColor]);
}
