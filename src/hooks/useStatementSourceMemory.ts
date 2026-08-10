import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * PRIPADNOST IZVORU — pamćenje „IBAN → novčanik" (obrazac „Moji izdavatelji").
 *
 * Pravilo NIKAD ne nastaje tiho: upisuje ga izričita kvačica pri uvozu izvoda.
 * Zaborav je jedan dodir (Postavke → Uvoz iz e-maila → Računi s izvoda).
 * Kad je IBAN već poznat kroz `bank_accounts`, taj mapping ima prednost —
 * ovdje se pamti samo ono što je korisnik odabrao rukom.
 */

export interface StatementSourceRule {
  id: string;
  /** Identitet pravila: IBAN kad postoji, inače broj računa (e-novčanici). */
  account_identifier: string;
  account_iban: string | null;
  bank_name: string | null;
  payment_source_id: string | null;
  business_profile_id: string | null;
  confirmed_count: number;
  last_used_at: string;
}

/** Usporedba IBAN-a bez razmaka i velikih/malih slova. */
export const normalizeIban = (raw: string | null | undefined): string =>
  String(raw ?? '').replace(/\s+/g, '').toUpperCase();

/** Ključ pravila — isti postupak za IBAN i za goli broj računa. */
export const normalizeAccountIdentifier = normalizeIban;

export function useStatementSourceMemory(enabled: boolean) {
  const { user } = useAuth();
  const [rules, setRules] = useState<StatementSourceRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  const fetchRules = useCallback(async () => {
    if (!enabled || !user?.id) {
      setRules([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('mail_statement_source_map')
      .select('id, account_identifier, account_iban, bank_name, payment_source_id, business_profile_id, confirmed_count, last_used_at')
      .eq('user_id', user.id)
      .order('confirmed_count', { ascending: false })
      .limit(200);

    if (error) {
      console.warn('[useStatementSourceMemory] fetch error:', error.message);
      setRules([]);
    } else {
      setRules(
        (data ?? []).map((row: Record<string, unknown>) => ({
          id: String(row.id),
          account_identifier: String(row.account_identifier ?? row.account_iban ?? ''),
          account_iban: (row.account_iban as string | null) ?? null,
          bank_name: (row.bank_name as string | null) ?? null,
          payment_source_id: (row.payment_source_id as string | null) ?? null,
          business_profile_id: (row.business_profile_id as string | null) ?? null,
          confirmed_count: Number(row.confirmed_count ?? 0),
          last_used_at: String(row.last_used_at ?? ''),
        })),
      );
    }
    setLoading(false);
  }, [enabled, user?.id]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  /** Prijedlog izvora za identitet računa s izvoda — samo iz zapamćenih pravila. */
  const suggestSourceId = useCallback(
    (identifier: string | null | undefined): string | null => {
      const key = normalizeAccountIdentifier(identifier);
      if (!key) return null;
      const hit = rules.find((r) => normalizeAccountIdentifier(r.account_identifier) === key);
      return hit?.payment_source_id ?? null;
    },
    [rules],
  );

  /** Zapamti izbor. Poziva se ISKLJUČIVO uz uključenu kvačicu. */
  const rememberRule = useCallback(
    async (params: {
      /** IBAN ili broj računa — što god dokument nosi. */
      identifier: string;
      iban?: string | null;
      bankName?: string | null;
      paymentSourceId: string;
      businessProfileId?: string | null;
    }) => {
      if (!user?.id) return false;
      const key = normalizeAccountIdentifier(params.identifier);
      if (!key) return false;
      setWorking(true);
      try {
        const { error } = await supabase
          .from('mail_statement_source_map')
          .upsert(
            {
              user_id: user.id,
              account_identifier: key,
              account_iban: params.iban ? normalizeIban(params.iban) : null,
              bank_name: params.bankName ?? null,
              payment_source_id: params.paymentSourceId,
              business_profile_id: params.businessProfileId ?? null,
              last_used_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,account_identifier' },
          );
        if (error) {
          console.warn('[useStatementSourceMemory] upsert error:', error.message);
          return false;
        }
        await fetchRules();
        return true;
      } finally {
        setWorking(false);
      }
    },
    [fetchRules, user?.id],
  );

  const forgetRule = useCallback(
    async (id: string) => {
      setWorking(true);
      try {
        const { error } = await supabase.from('mail_statement_source_map').delete().eq('id', id);
        if (error) {
          console.warn('[useStatementSourceMemory] delete error:', error.message);
          return false;
        }
        await fetchRules();
        return true;
      } finally {
        setWorking(false);
      }
    },
    [fetchRules],
  );

  return { rules, loading, working, suggestSourceId, rememberRule, forgetRule, refetch: fetchRules };
}

/**
 * Prijedlog iz već povezanih bankovnih računa (`bank_accounts`). Ima PREDNOST
 * nad ručnim pamćenjem jer je nastao povezivanjem banke, ne pogađanjem.
 */
export async function suggestSourceFromBankAccounts(
  userId: string,
  iban: string | null | undefined,
): Promise<string | null> {
  const key = normalizeIban(iban);
  if (!key || !userId) return null;
  const { data, error } = await supabase
    .from('bank_accounts')
    .select('iban, linked_payment_source_id')
    .eq('user_id', userId)
    .not('linked_payment_source_id', 'is', null)
    .limit(200);
  if (error) {
    console.warn('[suggestSourceFromBankAccounts] error:', error.message);
    return null;
  }
  const hit = (data ?? []).find(
    (row: Record<string, unknown>) => normalizeIban(row.iban as string) === key,
  );
  return (hit?.linked_payment_source_id as string | null) ?? null;
}
