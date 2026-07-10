/**
 * Jedinstveni navigation handler za in-app zvono i native push tap.
 *
 * Bell flow: pozove `navigateFromNotification(payload)` koji postavi
 * `pendingHighlight` i navigira preko React Routera.
 *
 * Za /projects rutu koristimo React Router `state` umjesto query stringa jer
 * `ProjectsPanel` već konzumira `location.state.openProjectId` da auto-otvori
 * `ProjectFullScreenView` s ispravnim tabom (`state.initialTab`). Tab dolazi
 * iz `highlight.tab` (`phases` za milestone, `funding` za invoice, itd.).
 *
 * Native push: `nativePush.ts` postavlja `pendingHighlight` izvan React stabla
 * i koristi `window.location.replace` za cold start; nakon što se aplikacija
 * mountira, `ProjectsPanel` fallback pročita `peekPendingHighlight()` za tab,
 * a `HighlightTarget` izvrši pulse.
 */
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { showSuccess } from '@/hooks/useStatusFeedback';
import { normalizePayload, type NormalizedPayload } from '@/lib/notificationPayload';
import { setPendingHighlight } from '@/lib/pendingHighlight';
import { dispatchAttributionOpen, parseAttributionPayload } from '@/lib/attribution/events';

/**
 * Izvuče project id iz route oblika `/projects?id=<UUID>`. Vraća null ako
 * route nije projektna ili nema `id` parametra.
 */
function extractProjectId(route: string | null): string | null {
  if (!route || !route.startsWith('/projects')) return null;
  const qIdx = route.indexOf('?');
  if (qIdx === -1) return null;
  try {
    const params = new URLSearchParams(route.slice(qIdx + 1));
    return params.get('id');
  } catch {
    return null;
  }
}

export function useNotificationNavigation() {
  const navigate = useNavigate();
  const qc = useQueryClient();
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

      // Projektne obavijesti idu kroz state da ProjectsPanel može otvoriti
      // ispravan tab prije nego HighlightTarget počne tražiti DOM marker.
      const projectId = extractProjectId(target);
      if (projectId) {
        const h = payload.highlight;
        navigate('/projects', {
          state: {
            openProjectId: projectId,
            initialTab: h?.tab,
            openExpenseId: h?.type === 'expense' ? h.id : undefined,
          },
        });
        return true;
      }

      // Krug notifikacije (svih 6 krug_* tipova) vode na `/krug`. Realtime
      // kanal može biti stale iz backgrounda ili push cold-starta, pa prije
      // navigacije invalidiramo Krug namespace da lista/detail/queue/deletion
      // dočekaju korisnika s aktualnim stanjem umjesto prethodnog cache-a.
      if (target.startsWith('/krug')) {
        qc.invalidateQueries({ queryKey: ['krug'] });
      }

      navigate(target);
      return true;
    },
    [navigate, qc],
  );

  const navigateFromNotification = useCallback(
    (type: string | null | undefined, data: unknown): boolean => {
      // Attribution intercept: worker_payout_created/voided otvara AttributionSheet
      // overlay-em preko CustomEvent-a — bez rute promjene. Iznimka (WS2 / Faza 2.2):
      // ako je storno obavijest već zna za pripisan expense red radnika
      // (`worker_attribution_expense_id`), preskačemo sheet i vodimo radnika direktno
      // na tu transakciju u /wallet?highlight=<id>&voidedAttribution=1 gdje ga
      // dočekuje AlertDialog "Ukloni pripis".
      if (type === 'worker_payout_created' || type === 'worker_payout_voided') {
        if (type === 'worker_payout_voided' && data && typeof data === 'object') {
          const d = data as Record<string, unknown>;
          const expenseId = typeof d.worker_attribution_expense_id === 'string'
            && d.worker_attribution_expense_id.length > 0
              ? d.worker_attribution_expense_id
              : null;
          if (expenseId) {
            navigate(`/wallet?highlight=${expenseId}&voidedAttribution=1`);
            return true;
          }
        }
        const action = type === 'worker_payout_created' ? 'created' : 'voided';
        const attr = parseAttributionPayload(action, data);
        if (attr) {
          dispatchAttributionOpen(attr);
          return true;
        }
      }
      const payload = normalizePayload(
        type ?? null,
        (data && typeof data === 'object') ? (data as Record<string, unknown>) : null,
      );
      const ok = navigateFromPayload(payload);
      if (!ok) {
        showSuccess(t('notifications.itemNotAvailable', 'Stavka više nije dostupna'));
      }
      return ok;
    },
    [navigateFromPayload, t],
  );

  return { navigateFromPayload, navigateFromNotification };
}
