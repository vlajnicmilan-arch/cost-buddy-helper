/**
 * useKrugSettlement — dohvaća read-only settlement preview iz RPC-a
 * `krug_settlement_preview`. FX rate mapu prosljeđuje klijent (frankfurter.app
 * kroz `useExchangeRates`), pa RPC ostaje deterministički bez HTTP izlaza.
 *
 * Faza A: NULA write akcija. "Označi podmireno" i povijest su Faza B.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useExchangeRates } from './useExchangeRates';

export interface SettlementMember {
  user_id: string;
  paid: number;
  owed: number;
  net: number;
}

export interface SettlementTransfer {
  from_user: string;
  to_user: string;
  amount: number;
  currency: string;
}

export interface SettlementPreview {
  krug_id: string;
  period_start: string;
  period_end: string;
  display_currency: string;
  split_mode: 'equal' | 'proportional_income' | 'manual';
  members: SettlementMember[];
  transfers: SettlementTransfer[];
  fx: {
    rates_used: Record<string, number | null>;
    snapshot_date: string;
    source: string;
  };
  flags: {
    missing_income_data: boolean;
    manual_mode_fallback_equal: boolean;
    mixed_currencies: boolean;
    no_members?: boolean;
  };
}

interface Args {
  krugId: string | null | undefined;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string;
  displayCurrency?: string | null;
  enabled?: boolean;
}

export function useKrugSettlement({ krugId, periodStart, periodEnd, displayCurrency, enabled = true }: Args) {
  const { rates, loading: ratesLoading } = useExchangeRates(!!krugId && enabled);

  const query = useQuery({
    queryKey: ['krug', 'settlement', krugId, periodStart, periodEnd, displayCurrency, rates],
    enabled: !!krugId && enabled && !ratesLoading && Object.keys(rates).length > 0,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<SettlementPreview> => {
      if (!krugId) throw new Error('missing_krug');
      const { data, error } = await (supabase as any).rpc('krug_settlement_preview', {
        p_krug_id: krugId,
        p_period_start: periodStart,
        p_period_end: periodEnd,
        p_display_currency: displayCurrency ?? null,
        p_fx_rates: rates,
      });
      if (error) throw error;
      return data as SettlementPreview;
    },
  });

  return { ...query, ratesLoading };
}

export function currentMonthRange(now = new Date()): { start: string; end: string } {
  const y = now.getFullYear();
  const m = now.getMonth();
  const start = new Date(Date.UTC(y, m, 1));
  const end = new Date(Date.UTC(y, m + 1, 0));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
}

export function shiftMonth(range: { start: string; end: string }, delta: number): { start: string; end: string } {
  const d = new Date(range.start + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + delta);
  return currentMonthRange(d);
}
