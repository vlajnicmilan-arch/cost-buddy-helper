import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { needsResubscribe } from '@/lib/appResume';

/**
 * MAIL UVOZ — živi kanal.
 *
 * Jedan kanal po prijavljenom korisniku (montira se JEDNOM, u `MailRealtimeHost`).
 * Sluša INSERT/UPDATE u `document_ingest_items` za vlastite stavke i emitira interni
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

const PENDING = 'na_pregledu';

/**
 * Odluka: emitiramo SAMO na PRIJELAZU u `na_pregledu`.
 * Stavka se rađa u među-statusu (obrada) i tek kasnijim UPDATE-om postaje
 * „na pregledu" — zato slušamo i INSERT i UPDATE. `REPLICA IDENTITY FULL` daje
 * stari redak, pa UPDATE bez promjene statusa preskačemo.
 */
export const isPendingTransition = (
  oldRow: { status?: string | null } | null | undefined,
  newRow: { status?: string | null } | null | undefined
): boolean => {
  if (newRow?.status !== PENDING) return false;
  // Nema starog retka (INSERT ili bez replica identity) → prijelaz je nov.
  if (!oldRow || oldRow.status === undefined || oldRow.status === null) return true;
  return oldRow.status !== PENDING;
};

export function useMailRealtime({ enabled, onNewPending }: Options) {
  const { user } = useAuth();
  const onNewPendingRef = useRef(onNewPending);
  onNewPendingRef.current = onNewPending;
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!enabled || !user?.id) return;

    // Dedup: ista stavka može stići i kroz INSERT i kroz UPDATE.
    const seen = new Set<string>();
    const handle = (payload: { new?: unknown; old?: unknown }) => {
      const row = (payload.new ?? null) as { id?: string; status?: string } | null;
      const prev = (payload.old ?? null) as { status?: string } | null;
      const pendingTransition = isPendingTransition(prev, row);
      const leftPending = prev?.status === PENDING && row?.status !== PENDING;
      if (!pendingTransition && !leftPending) return;
      const id = row?.id ?? null;
      if (pendingTransition && id) {
        if (seen.has(id)) return;
        seen.add(id);
      }
      emitMailPendingChanged({ itemId: id });
      if (pendingTransition) onNewPendingRef.current?.(id);
    };

    const filter = `owner_user_id=eq.${user.id}`;
    const open = () =>
      supabase
        .channel(`mail-ingest-${user.id}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'document_ingest_items', filter },
          handle
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'document_ingest_items', filter },
          handle
        )
        .subscribe();

    channelRef.current = open();

    // ŽIVI KANAL PREKO NOĆI: WebSocket zna umrijeti dok je tab u backgroundu.
    // Na povratak u fokus/mrežu provjeravamo stanje kanala i po potrebi ga
    // dižemo ponovno — inače serverska promjena statusa ne stigne do ekrana.
    const resume = () => {
      const state = (channelRef.current as { state?: string } | null)?.state;
      if (!needsResubscribe(state)) return;
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      channelRef.current = open();
      // Kanal je bio mrtav — red i brojač se odmah usklade sa serverom.
      emitMailPendingChanged({ itemId: null });
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') resume();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', resume);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', resume);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    };
  }, [enabled, user?.id]);
}
