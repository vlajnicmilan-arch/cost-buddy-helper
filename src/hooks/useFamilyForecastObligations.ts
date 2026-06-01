import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { SettlementForecastRow } from '@/lib/familyForecastContrib';

/**
 * Učitava sve pending family_settlements gdje je trenutni korisnik dugovnik
 * (preko svih grupa kojima pripada). RLS već filtrira po `is_family_member`.
 */
export function useFamilyForecastObligations() {
  const { user } = useAuth();
  const [settlements, setSettlements] = useState<SettlementForecastRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setSettlements([]);
      return;
    }
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('family_settlements')
          .select('debtor_user_id, amount, status, period_end')
          .eq('debtor_user_id', user.id)
          .eq('status', 'pending');
        if (cancelled) return;
        if (error) {
          setSettlements([]);
        } else {
          setSettlements((data || []) as SettlementForecastRow[]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return { settlements, loading };
}
