import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { EXPENSE_DETAIL_LAZY_SELECT } from '@/lib/expenseColumns';
import type { ExpenseHeavyFields } from '@/lib/expenseHeavyFields';

/**
 * Lijeni dohvat teških polja transakcije (doslovan bankovni redak, lokacija).
 * Lista ih više ne povlači — detalj ih dohvaća tek pri otvaranju, po id-u.
 */
export const useExpenseDetailFields = (
  expenseId: string | null | undefined,
  enabled: boolean,
): ExpenseHeavyFields | null => {
  const [fields, setFields] = useState<ExpenseHeavyFields | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!enabled || !expenseId) {
      setFields(null);
      return;
    }
    (async () => {
      try {
        const { data, error } = await supabase
          .from('expenses')
          .select(EXPENSE_DETAIL_LAZY_SELECT)
          .eq('id', expenseId)
          .maybeSingle();
        if (cancelled || error || !data) return;
        const row = data as unknown as ExpenseHeavyFields;
        setFields({
          bank_raw_line: row.bank_raw_line ?? null,
          bank_raw_line_source: row.bank_raw_line_source ?? null,
          location_name: row.location_name ?? null,
        });
      } catch {
        /* detalj ostaje bez citata — nikad ne ruši dijalog */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [expenseId, enabled]);

  return fields;
};
