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
  /** Privitak u pohrani — most prema uvozu izvoda. */
  attachment_id: string | null;
  storage_path: string | null;
  file_name: string | null;
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
        'id, classification, extraction, confidence, trust_level, warnings, doc_type, created_at, scope_type, scope_id, scope_set_by_user, attachment_id, inbound_messages(subject, from_header), inbound_attachments(storage_path)'
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
          attachment_id: row.attachment_id ?? null,
          storage_path: row.inbound_attachments?.storage_path ?? null,
          file_name: String(row.inbound_attachments?.storage_path ?? '').split('/').pop() || null,
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

  /**
   * Korisnik potvrđuje da je sumnjiva stavka izvod.
   *
   * Sama promjena oznake NIJE dovoljna: ekstrakcija izvoda (banka, IBAN,
   * razdoblje, novo stanje) radi se tek u obradi poruke. Zato ovdje ide RPC
   * koji upiše korisnikovu odluku I vrati poruku u red za ponovnu obradu.
   */
  const confirmAsStatement = useCallback(
    async (itemId: string): Promise<{ ok: boolean; reason?: string }> => {
      setWorking(true);
      try {
        const { data, error } = await supabase.rpc('mail_item_reprocess', {
          p_item_id: itemId,
          p_classification: 'izvod',
        });
        if (error) {
          console.warn(
            '[useMailReviewQueue] confirmAsStatement error:',
            describeDbError(error, 'mail_item_reprocess'),
          );
          return { ok: false, reason: error.message };
        }
        const result = (data ?? {}) as { ok?: boolean; reason?: string };
        if (result.ok === false) {
          console.warn('[useMailReviewQueue] confirmAsStatement refused:', result.reason);
          return { ok: false, reason: result.reason };
        }
        await fetchItems();
        return { ok: true };
      } finally {
        setWorking(false);
      }
    },
    [fetchItems],
  );

  /**
   * „OVO JE RAČUN" — suprotan izlaz iz istog pitanja.
   * Isti put kao potvrda izvoda: odluka se zapiše i poruka se vraća u obradu,
   * gdje AI dopunjava polja računa. Stavka NIKAD ne ide u odbacivanje.
   */
  const confirmAsInvoice = useCallback(
    async (itemId: string): Promise<{ ok: boolean; reason?: string }> => {
      setWorking(true);
      try {
        const { data, error } = await supabase.rpc('mail_item_reprocess', {
          p_item_id: itemId,
          p_classification: 'racun',
        });
        if (error) {
          console.warn(
            '[useMailReviewQueue] confirmAsInvoice error:',
            describeDbError(error, 'mail_item_reprocess'),
          );
          return { ok: false, reason: error.message };
        }
        const result = (data ?? {}) as { ok?: boolean; reason?: string };
        if (result.ok === false) return { ok: false, reason: result.reason };
        await fetchItems();
        return { ok: true };
      } finally {
        setWorking(false);
      }
    },
    [fetchItems],
  );

  /**
   * „NEŠTO DRUGO — ZADRŽI": stavka izlazi iz reda pitanja, ostaje u Primljeno
   * i više ne zvoca. Nije odbacivanje — dokument je i dalje tu.
   */
  const keepItem = useCallback(
    async (itemId: string): Promise<boolean> => {
      setWorking(true);
      try {
        const { data, error } = await supabase.rpc('mail_item_decide', {
          p_item_id: itemId,
          p_decision: 'zadrzi',
        });
        if (error) {
          console.warn('[useMailReviewQueue] keepItem error:', describeDbError(error, 'mail_item_decide'));
          return false;
        }
        const result = (data ?? {}) as { ok?: boolean };
        if (result.ok === false) return false;
        await fetchItems();
        return true;
      } finally {
        setWorking(false);
      }
    },
    [fetchItems],
  );

  /** Klik na Googleovu potvrdu: stavka odmah prelazi u „čeka prvi mail". */
  const markVerificationClicked = useCallback(
    async (itemId: string): Promise<boolean> => {
      const { data, error } = await supabase.rpc('mail_verification_clicked', {
        p_item_id: itemId,
      });
      if (error) {
        console.warn(
          '[useMailReviewQueue] markVerificationClicked error:',
          describeDbError(error, 'mail_verification_clicked'),
        );
        return false;
      }
      const result = (data ?? {}) as { ok?: boolean };
      if (result.ok === false) return false;
      await fetchItems();
      return true;
    },
    [fetchItems],
  );

  return {
    items,
    loading,
    working,
    confirmItem,
    discardItem,
    confirmAsStatement,
    confirmAsInvoice,
    keepItem,
    markVerificationClicked,
    setScope,
    refetch: fetchItems,
  };
}

