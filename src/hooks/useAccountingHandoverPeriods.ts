/**
 * B — status „predano" po razdoblju za tvrtku (`accounting_handover_periods`).
 * Ne dira račune ni F1/F2 logiku: samo zapis da je mjesec predan.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { logDiagnostic } from '@/lib/diagnosticLogger';
import { describeDbError } from '@/lib/eracun/dbError';

export interface HandoverPeriodRow {
  id: string;
  business_profile_id: string;
  period: string;
  submitted_at: string;
  invoice_count: number;
  total_amount: number;
}

export interface MarkSubmittedInput {
  businessProfileId: string;
  period: string;
  invoiceCount: number;
  totalAmount: number;
}

export const useAccountingHandoverPeriods = (businessProfileId: string | null) => {
  const { user, authReady } = useAuth();
  const [periods, setPeriods] = useState<HandoverPeriodRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchPeriods = useCallback(async (): Promise<void> => {
    if (!user || !businessProfileId) {
      setPeriods([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('accounting_handover_periods')
        .select('id, business_profile_id, period, submitted_at, invoice_count, total_amount')
        .eq('business_profile_id', businessProfileId)
        .order('period', { ascending: false });
      if (error) throw error;
      setPeriods((data ?? []) as HandoverPeriodRow[]);
    } catch (err) {
      logDiagnostic({
        event: 'accounting_handover_periods.fetch_failed',
        severity: 'error',
        details: {
          business_profile_id: businessProfileId,
          reason: describeDbError(err),
          code: (err as { code?: string })?.code ?? null,
        },
      });
      throw err;
    } finally {
      setLoading(false);
    }
  }, [user, businessProfileId]);

  useEffect(() => {
    if (!authReady) return;
    void fetchPeriods().catch(() => { /* poruku prikazuje pozivatelj */ });
  }, [authReady, fetchPeriods]);

  /**
   * Upis „predano". Pad upisa → dijagnostika + greška pozivatelju.
   * Kad upis prođe a osvježenje padne, baca se `refresh_failed` da poruka
   * može reći oboje.
   */
  const markSubmitted = useCallback(async (input: MarkSubmittedInput): Promise<void> => {
    if (!user) throw new Error('not_authenticated');
    const { error } = await supabase
      .from('accounting_handover_periods')
      .upsert({
        user_id: user.id,
        business_profile_id: input.businessProfileId,
        period: input.period,
        submitted_at: new Date().toISOString(),
        invoice_count: input.invoiceCount,
        total_amount: input.totalAmount,
      }, { onConflict: 'user_id,business_profile_id,period' });

    if (error) {
      logDiagnostic({
        event: 'accounting_handover_periods.markSubmitted',
        severity: 'error',
        details: {
          business_profile_id: input.businessProfileId,
          period: input.period,
          code: error.code ?? null,
          message: error.message ?? null,
          details: error.details ?? null,
          hint: error.hint ?? null,
        },
      });
      throw error;
    }

    try {
      await fetchPeriods();
    } catch {
      throw new Error('refresh_failed');
    }
  }, [user, fetchPeriods]);

  const periodFor = useCallback(
    (period: string): HandoverPeriodRow | null => periods.find((p) => p.period === period) ?? null,
    [periods],
  );

  return { periods, loading, markSubmitted, periodFor, refetch: fetchPeriods };
};
