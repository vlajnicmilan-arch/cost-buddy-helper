import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { generateAliasLocal } from '@/lib/mailAlias';

export interface MailAliasRow {
  id: string;
  alias_local: string;
  created_at: string;
  disabled_at: string | null;
}

export interface InboundMessageRow {
  id: string;
  from_header: string | null;
  subject: string | null;
  received_at: string;
  status: string;
  last_error: string | null;
  attachment_count: number;
}


/**
 * MAIL UVOZ (korak 1) — aktivni alias korisnika + sirovi popis zadnjih 20 poruka.
 * Ništa se ne analizira; ovo je samo prikaz prijema.
 */
export function useMailInbox(enabled: boolean) {
  const { user } = useAuth();
  const [alias, setAlias] = useState<MailAliasRow | null>(null);
  const [messages, setMessages] = useState<InboundMessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!enabled || !user?.id) {
      setAlias(null);
      setMessages([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data: aliasRows, error: aliasErr } = await supabase
      .from('mail_aliases')
      .select('id, alias_local, created_at, disabled_at')
      .eq('user_id', user.id)
      .is('disabled_at', null)
      .order('created_at', { ascending: true })
      .limit(1);

    if (aliasErr) console.warn('[useMailInbox] alias fetch error:', aliasErr.message);
    const active = (aliasRows ?? [])[0] ?? null;
    setAlias(active);

    const { data: msgRows, error: msgErr } = await supabase
      .from('inbound_messages')
      .select('id, from_header, subject, received_at, status, last_error, inbound_attachments(id)')
      .eq('owner_user_id', user.id)
      .order('received_at', { ascending: false })
      .limit(20);

    if (msgErr) {
      console.warn('[useMailInbox] messages fetch error:', msgErr.message);
      setMessages([]);
    } else {
      setMessages(
        (msgRows ?? []).map((r: any) => ({
          id: r.id,
          from_header: r.from_header,
          subject: r.subject,
          received_at: r.received_at,
          status: r.status,
          last_error: r.last_error ?? null,
          attachment_count: Array.isArray(r.inbound_attachments) ? r.inbound_attachments.length : 0,
        }))
      );
    }
    setLoading(false);
  }, [enabled, user?.id]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  /**
   * GET-OR-CREATE. Baza je jedini arbitar: RPC vraća postojeći AKTIVNI alias,
   * a novi stvara samo ako korisnik nema nijedan (parcijalni unique indeks
   * jamči najviše jedan aktivan po korisniku).
   */
  const ensureAlias = useCallback(async () => {
    if (!user?.id || alias || working) return;
    setWorking(true);
    const { data, error } = await supabase.rpc('mail_alias_get_or_create');
    if (error) console.warn('[useMailInbox] alias get-or-create error:', error.message);
    else {
      const row = (data as MailAliasRow[] | null)?.[0] ?? null;
      if (row) setAlias(row);
    }
    setWorking(false);
  }, [user?.id, alias, working]);

  /** Gasi staru adresu i stvara novu — atomarno, u jednoj transakciji. */
  const regenerateAlias = useCallback(async () => {
    if (!user?.id) return;
    setWorking(true);
    try {
      const { data, error } = await supabase.rpc('mail_alias_regenerate');
      if (error) throw error;
      const row = (data as MailAliasRow[] | null)?.[0] ?? null;
      if (row) setAlias(row);
    } catch (e) {
      console.warn('[useMailInbox] regenerate error:', (e as Error).message);
      throw e;
    } finally {
      setWorking(false);
    }
  }, [user?.id]);


  return { alias, messages, loading, working, ensureAlias, regenerateAlias, refetch: fetchAll };
}
