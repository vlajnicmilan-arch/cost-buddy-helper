/**
 * Jedinstveni navigation handler za in-app zvono i native push tap.
 *
 * Bell flow: pozove `navigateFromNotification(payload)` koji postavi
 * `pendingHighlight` i navigira preko React Routera.
 *
 * Native push: `nativePush.ts` postavlja `pendingHighlight` izvan React stabla
 * i koristi `window.location.replace` za cold start; nakon što se aplikacija
 * mountira, `HighlightTarget` pokupi pending i izvrši pulse.
 */
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { showSuccess } from '@/hooks/useStatusFeedback';
import { normalizePayload, type NormalizedPayload } from '@/lib/notificationPayload';
import { setPendingHighlight } from '@/lib/pendingHighlight';

export function useNotificationNavigation() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const navigateFromPayload = useCallback(
    (payload: NormalizedPayload): boolean => {
      const target = payload.route ?? payload.fallback_route;
      if (!target) {
        if (payload.highlight) {
          // Highlight without route — still try to pulse on current screen.
          setPendingHighlight(payload.highlight, null);
          return true;
        }
        return false;
      }
      if (payload.highlight) {
        setPendingHighlight(payload.highlight, target);
      }
      navigate(target);
      return true;
    },
    [navigate],
  );

  const navigateFromNotification = useCallback(
    (type: string | null | undefined, data: unknown): boolean => {
      const payload = normalizePayload(
        type ?? null,
        (data && typeof data === 'object') ? (data as Record<string, unknown>) : null,
      );
      const ok = navigateFromPayload(payload);
      if (!ok) {
        showInfo(t('notifications.itemNotAvailable', 'Stavka više nije dostupna'));
      }
      return ok;
    },
    [navigateFromPayload, t],
  );

  return { navigateFromPayload, navigateFromNotification };
}
