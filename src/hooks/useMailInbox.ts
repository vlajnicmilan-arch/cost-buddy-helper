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
      .order('created_at', { ascending: false })
      .limit(1);

    if (aliasErr) console.warn('[useMailInbox] alias fetch error:', aliasErr.message);
    const active = (aliasRows ?? [])[0] ?? null;
    setAlias(active);

    const { data: msgRows, error: msgErr } = await supabase
      .from('inbound_messages')
      .select('id, from_header, subject, received_at, status, inbound_attachments(id)')
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
          attachment_count: Array.isArray(r.inbound_attachments) ? r.inbound_attachments.length : 0,
        }))
      );
    }
    setLoading(false);
  }, [enabled, user?.id]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  /** Stvara alias ako ga korisnik još nema (poziva se pri prvom otvaranju kartice). */
  const ensureAlias = useCallback(async () => {
    if (!user?.id || alias || working) return;
    setWorking(true);
    const { data, error } = await supabase
      .from('mail_aliases')
      .insert({ user_id: user.id, alias_local: generateAliasLocal() })
      .select('id, alias_local, created_at, disabled_at')
      .single();
    if (error) console.warn('[useMailInbox] alias create error:', error.message);
    else setAlias(data);
    setWorking(false);
  }, [user?.id, alias, working]);

  /** Gasi staru adresu ODMAH i stvara novu. */
  const regenerateAlias = useCallback(async () => {
    if (!user?.id) return;
    setWorking(true);
    try {
      if (alias) {
        await supabase
          .from('mail_aliases')
          .update({ disabled_at: new Date().toISOString() })
          .eq('id', alias.id);
      }
      const { data, error } = await supabase
        .from('mail_aliases')
        .insert({ user_id: user.id, alias_local: generateAliasLocal() })
        .select('id, alias_local, created_at, disabled_at')
        .single();
      if (error) throw error;
      setAlias(data);
    } catch (e) {
      console.warn('[useMailInbox] regenerate error:', (e as Error).message);
      throw e;
    } finally {
      setWorking(false);
    }
  }, [user?.id, alias]);

  return { alias, messages, loading, working, ensureAlias, regenerateAlias, refetch: fetchAll };
}
