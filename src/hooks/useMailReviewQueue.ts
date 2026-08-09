import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { describeDbError } from '@/lib/eracun/dbError';

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
        'id, classification, extraction, confidence, trust_level, warnings, doc_type, created_at, inbound_messages(subject, from_header)'
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
        }))
      );
    }
    setLoading(false);
  }, [enabled, user?.id]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  /**
   * Potvrda stavke. Vraća `null` kad je sve prošlo, ili podatke o koliziji kad
   * već postoji zapis s istim ključem — tada odluku donosi korisnik.
   */
  const confirmItem = useCallback(
    async (
      itemId: string,
      payload: Record<string, unknown>,
      replaceExistingId?: string
    ): Promise<ConfirmCollision | null> => {
      setWorking(true);
      try {
        const { data, error } = await supabase.rpc('mail_item_confirm', {
          p_item_id: itemId,
          p_payload: payload as never,
          p_replace_existing_id: replaceExistingId ?? null,
        });
        if (error) throw error;
        const result = data as unknown as Record<string, unknown>;
        if (result?.ok === false && result.reason === 'mozda_vec_postoji') {
          return {
            reason: 'mozda_vec_postoji',
            existing: (result.existing ?? {}) as Record<string, unknown>,
          };
        }
        if (result?.ok === false) throw new Error(String(result.reason));
        await fetchItems();
        return null;
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

  return { items, loading, working, confirmItem, discardItem, refetch: fetchItems };
}
