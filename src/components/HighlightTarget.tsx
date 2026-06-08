/**
 * Globalni listener koji čeka da se DOM element s
 * `[data-highlight-id="<type>:<id>"]` ili `[data-highlight-id="<id>"]` mountira,
 * scrolla ga u vidno polje i dodaje klasu `highlight-pulse` na ~2s.
 *
 * Dizajniran za cold start: pending highlight može stići prije nego što ruta
 * uopće rendera ciljanu listu. Koristimo MutationObserver + timeout fallback.
 */
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { peekPendingHighlight, clearPendingHighlight } from '@/lib/pendingHighlight';
import { useTranslation } from '@/i18n';
import { showInfo } from '@/lib/statusFeedback';

const PULSE_MS = 2000;
const WAIT_MS = 8000;

function tryFind(type: string, id: string): HTMLElement | null {
  // Preferiraj precizan match `<type>:<id>`, fallback na čisti id.
  return (
    document.querySelector<HTMLElement>(`[data-highlight-id="${CSS.escape(`${type}:${id}`)}"]`) ||
    document.querySelector<HTMLElement>(`[data-highlight-id="${CSS.escape(id)}"]`)
  );
}

function pulse(el: HTMLElement) {
  try {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch {
    /* ignore */
  }
  el.classList.add('highlight-pulse');
  window.setTimeout(() => {
    el.classList.remove('highlight-pulse');
  }, PULSE_MS);
  // Korisno za testove i tracking.
  window.dispatchEvent(
    new CustomEvent('notification:highlight', {
      detail: { id: el.getAttribute('data-highlight-id') },
    }),
  );
}

export function HighlightTarget() {
  const location = useLocation();
  const { t } = useTranslation();

  useEffect(() => {
    const pending = peekPendingHighlight();
    if (!pending) return;

    let cancelled = false;
    let observer: MutationObserver | null = null;
    let timeout: number | null = null;

    const attempt = (): boolean => {
      const el = tryFind(pending.type, pending.id);
      if (!el) return false;
      clearPendingHighlight();
      pulse(el);
      return true;
    };

    // Quick first try — često je element već u DOM-u.
    if (attempt()) return;

    observer = new MutationObserver(() => {
      if (cancelled) return;
      if (attempt()) {
        observer?.disconnect();
        if (timeout != null) window.clearTimeout(timeout);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    timeout = window.setTimeout(() => {
      if (cancelled) return;
      observer?.disconnect();
      // Stavka više ne postoji — bili smo barem na ispravnoj ruti.
      clearPendingHighlight();
      showInfo(t('notifications.itemNotAvailable', 'Stavka više nije dostupna'));
    }, WAIT_MS);

    return () => {
      cancelled = true;
      observer?.disconnect();
      if (timeout != null) window.clearTimeout(timeout);
    };
    // Re-run on every route change — to je trenutak kad cilj postaje vidljiv.
  }, [location.pathname, location.search, t]);

  return null;
}

export default HighlightTarget;
