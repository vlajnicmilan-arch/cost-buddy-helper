import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * MAIL UVOZ — živi kanal.
 *
 * Jedan kanal po prijavljenom korisniku (montira se JEDNOM, u `MailRealtimeHost`).
 * Sluša INSERT u `document_ingest_items` za vlastite stavke i emitira interni
 * DOM event; postojeći `useState` hookovi (`useMailPendingCount`,
 * `useMailReviewQueue`) na taj event rade refetch — bez izlaska i ulaska u app.
 *
 * Zvonce (`notifications`) već ima vlastiti realtime kanal u `useNotifications`,
 * pa ga ovdje NE dupliciramo.
 */

/** Interni event: nova stavka čeka pregled. */
export const MAIL_PENDING_EVENT = 'vm:mail-pending-changed';

export interface MailPendingEventDetail {
  itemId: string | null;
}

export function emitMailPendingChanged(detail: MailPendingEventDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(MAIL_PENDING_EVENT, { detail }));
}

/** Pretplata na interni event (koriste je brojač i red na pregled). */
export function useMailPendingEvent(handler: () => void) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const listener = () => handler();
    window.addEventListener(MAIL_PENDING_EVENT, listener);
    return () => window.removeEventListener(MAIL_PENDING_EVENT, listener);
  }, [handler]);
}

interface Options {
  enabled: boolean;
  /** Poziva se za svaku novu stavku u statusu `na_pregledu`. */
  onNewPending?: (itemId: string | null) => void;
}

export function useMailRealtime({ enabled, onNewPending }: Options) {
  const { user } = useAuth();

  useEffect(() => {
    if (!enabled || !user?.id) return;

    const channel = supabase
      .channel(`mail-ingest-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'document_ingest_items',
          filter: `owner_user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as { id?: string; status?: string };
          if (row?.status !== 'na_pregledu') return;
          emitMailPendingChanged({ itemId: row.id ?? null });
          onNewPending?.(row.id ?? null);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // onNewPending se namjerno ne veže u dependency lanac (host ga drži stabilnim
    // kroz useCallback) — inače bi svaki render rušio i podizao kanal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, user?.id]);
}
