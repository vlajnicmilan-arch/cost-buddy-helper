/**
 * ImportBatchDialogHost — globalni renderer za ImportBatchDialog otvoren
 * iz post-import toasta, ReconciliationDialoga ili Resume bannera.
 *
 * Dohvaća expenses po batchId (samo tog batcha) i renderira postojeći
 * ImportBatchDialog. Ne duplicira klijentsku undo logiku — dijalog i dalje
 * poziva RPC `undo_import_batch`.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { subscribeImportUndo, closeImportBatch, type OpenImportBatchRequest } from '@/lib/importUndo/host';
import { ImportBatchDialog } from '@/components/ImportBatchDialog';
import type { Expense } from '@/types/expense';

export function ImportBatchDialogHost() {
  const [req, setReq] = useState<OpenImportBatchRequest | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);

  useEffect(() => subscribeImportUndo(setReq), []);

  useEffect(() => {
    if (!req?.batchId) { setExpenses([]); return; }
    let cancelled = false;
    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (supabase as any)
          .from('expenses')
          .select('id,user_id,amount,description,category,date,type,payment_source,merchant_name,created_at,updated_at,import_batch_id,bank_match_status,bank_transaction_id')
          .eq('import_batch_id', req.batchId);
        if (cancelled) return;
        const rows: Expense[] = Array.isArray(data)
          ? data.map((r: any) => ({
              ...r,
              date: r.date ? new Date(r.date) : new Date(),
            }))
          : [];
        setExpenses(rows);
      } catch {
        if (!cancelled) setExpenses([]);
      }
    })();
    return () => { cancelled = true; };
  }, [req?.batchId]);

  if (!req) return null;

  return (
    <ImportBatchDialog
      open={true}
      onOpenChange={(o) => { if (!o) closeImportBatch(); }}
      batchId={req.batchId}
      allExpenses={expenses}
      onUndone={async () => {
        if (req.onUndone) { try { await req.onUndone(); } catch { /* noop */ } }
      }}
    />
  );
}
