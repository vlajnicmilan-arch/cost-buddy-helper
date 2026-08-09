import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { describeDbError } from '@/lib/eracun/dbError';
import { useMailPendingEvent } from '@/hooks/useMailRealtime';


/**
 * MAIL UVOZ (korak 2) — red "Na pregled".
 *
 * Sestrinski obrazac EracunImportDialogu: pregled → potvrda → poništi mentalna
 * slika. Potvrda je JEDAN RPC u JEDNOJ transakciji (`mail_item_confirm`), a
 * kolizija na jedinstvenom ključu NIKAD ne radi tihu zamjenu — vraća postojeći
 * zapis i pušta korisnika da odluči.
 *
 * NIJEMA GREŠKA (popravak, kolovoz 2026): `confirmItem` više NE baca iznimku i
 * ne gubi `reason`. Vraća strukturirani ishod, pa dijalog može pokazati
 * konkretan razlog umjesto generičkog „spremanje nije uspjelo".
 */

export interface MailReviewItem {
  id: string;
  classification: string | null;
  extraction: Record<string, unknown> | null;
  confidence: string | null;
  trust_level: string | null;
  warnings: string[];
  doc_type: string | null;
  created_at: string;
  subject: string | null;
  from_header: string | null;
  /** Odredište: 'user' (osobno) ili 'business_profile'. */
  scope_type: string | null;
  scope_id: string | null;
  /** Korisnik je ručno odabrao odredište — reprocess ga ne smije pregaziti. */
  scope_set_by_user: boolean;
}

export interface ConfirmCollision {
  reason: 'mozda_vec_postoji';
  existing: Record<string, unknown>;
}

export type ConfirmResult =
  | { ok: true; invoiceId: string | null; already: boolean }
  | { ok: false; reason: 'mozda_vec_postoji'; existing: Record<string, unknown>; detail?: string }
  | { ok: false; reason: string; existing?: undefined; detail?: string };

const asWarnings = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((v) => String(v)) : [];


export function useMailReviewQueue(enabled: boolean) {
  const { user } = useAuth();
  const [items, setItems] = useState<MailReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  const fetchItems = useCallback(async () => {
    if (!enabled || !user?.id) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('document_ingest_items')
      .select(
        'id, classification, extraction, confidence, trust_level, warnings, doc_type, created_at, scope_type, scope_id, scope_set_by_user, inbound_messages(subject, from_header)'
      )
      .eq('owner_user_id', user.id)
      .eq('status', 'na_pregledu')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.warn('[useMailReviewQueue] fetch error:', error.message);
      setItems([]);
    } else {
      setItems(
        (data ?? []).map((row: any) => ({
          id: row.id,
          classification: row.classification,
          extraction: (row.extraction ?? null) as Record<string, unknown> | null,
          confidence: row.confidence,
          trust_level: row.trust_level,
          warnings: asWarnings(row.warnings),
          doc_type: row.doc_type,
          created_at: row.created_at,
          subject: row.inbound_messages?.subject ?? null,
          from_header: row.inbound_messages?.from_header ?? null,
          scope_type: row.scope_type ?? null,
          scope_id: row.scope_id ?? null,
          scope_set_by_user: row.scope_set_by_user === true,
        }))
      );
    }
    setLoading(false);
  }, [enabled, user?.id]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Živi kanal (vidi useMailRealtime) — red se puni sam dok je app otvoren.
  useMailPendingEvent(fetchItems);


  /**
   * Potvrda stavke. NIKAD ne baca — vraća strukturirani ishod s razlogom, da
   * dijalog može reći ŠTO je pošlo po zlu (uklj. koliziju i greške baze).
   */
  const confirmItem = useCallback(
    async (
      itemId: string,
      payload: Record<string, unknown>,
      replaceExistingId?: string
    ): Promise<ConfirmResult> => {
      setWorking(true);
      try {
        const { data, error } = await supabase.rpc('mail_item_confirm', {
          p_item_id: itemId,
          p_payload: payload as never,
          p_replace_existing_id: replaceExistingId ?? null,
        });
        if (error) {
          const detail = describeDbError(error, 'mail_item_confirm');
          console.warn('[useMailReviewQueue] confirm db error:', detail);
          const raw = String(error.message ?? '');
          const known = ['nije_prijavljen', 'stavka_ne_postoji', 'nije_dopusteno'].find((r) =>
            raw.includes(r)
          );
          return { ok: false, reason: known ?? 'baza', detail };
        }
        const result = (data ?? {}) as unknown as Record<string, unknown>;
        if (result?.ok === false && result.reason === 'mozda_vec_postoji') {
          return {
            ok: false,
            reason: 'mozda_vec_postoji',
            existing: (result.existing ?? {}) as Record<string, unknown>,
          };
        }
        if (result?.ok === false) {
          return { ok: false, reason: String(result.reason ?? 'baza') };
        }
        await fetchItems();
        return {
          ok: true,
          invoiceId: (result.invoice_id as string | null) ?? null,
          already: result.already === true,
        };
      } finally {
        setWorking(false);
      }

    },
    [fetchItems]
  );

  /**
   * Ručna korekcija odredišta (osobno ↔ tvrtka) PRIJE potvrde.
   * Ide kroz RPC jer je odluka: RPC ujedno postavlja `scope_set_by_user`.
   */
  const setScope = useCallback(
    async (itemId: string, scopeType: 'user' | 'business_profile', scopeId: string | null) => {
      setWorking(true);
      try {
        const { data, error } = await supabase.rpc('mail_item_set_scope', {
          p_item_id: itemId,
          p_scope_type: scopeType,
          p_scope_id: scopeId,
        });
        if (error) {
          console.warn('[useMailReviewQueue] setScope error:', describeDbError(error, 'mail_item_set_scope'));
          return false;
        }
        const result = (data ?? {}) as Record<string, unknown>;
        if (result?.ok === false) return false;
        await fetchItems();
        return true;
      } finally {
        setWorking(false);
      }
    },
    [fetchItems]
  );

  const discardItem = useCallback(
    async (itemId: string) => {
      setWorking(true);
      try {
        const { error } = await supabase
          .from('document_ingest_items')
          .update({ status: 'odbacio_korisnik' })
          .eq('id', itemId);
        if (error) throw error;
        await fetchItems();
      } finally {
        setWorking(false);
      }
    },
    [fetchItems]
  );

  return { items, loading, working, confirmItem, discardItem, setScope, refetch: fetchItems };
}
