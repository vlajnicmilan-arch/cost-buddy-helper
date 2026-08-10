/**
 * MEKA BRANA DUPLIKATA — kandidati za stavke reda „Na pregled".
 *
 * Dohvat je jedan upit po OIB-ovima vidljivih stavki; odluku donosi ista
 * usporedba koju koristi poslužitelj (`invoiceNumberMatch.ts`). Ništa se ne
 * blokira — kartica samo vidljivo najavi mogući duplikat.
 */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { findDuplicateCandidate, type DuplicateMatch } from '@/lib/mail/invoiceNumberMatch';
import { resolveConfirmDocType } from '@/lib/mail/docType';
import type { MailReviewItem } from '@/hooks/useMailReviewQueue';

interface InvoiceRow extends Record<string, unknown> {
  id: string;
  business_profile_id: string | null;
}

export const useMailDuplicateCandidates = (items: readonly MailReviewItem[]) => {
  const [rows, setRows] = useState<InvoiceRow[]>([]);

  const oibs = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      const oib = String((item.extraction ?? {}).supplier_oib ?? '').trim();
      if (oib) set.add(oib);
    }
    return Array.from(set).sort();
  }, [items]);

  const oibKey = oibs.join(',');

  useEffect(() => {
    let cancelled = false;
    if (oibs.length === 0) {
      setRows([]);
      return;
    }
    void (async () => {
      const { data, error } = await supabase
        .from('incoming_invoices')
        .select(
          'id, business_profile_id, supplier_oib, supplier_name, invoice_number, total_amount, due_date, issue_date, doc_type',
        )
        .eq('direction', 'in')
        .in('supplier_oib', oibs)
        .limit(500);
      if (cancelled) return;
      if (error) {
        console.warn('[useMailDuplicateCandidates] fetch error:', error.message);
        setRows([]);
        return;
      }
      setRows((data ?? []) as unknown as InvoiceRow[]);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oibKey]);

  return useMemo(() => {
    const map = new Map<string, DuplicateMatch>();
    for (const item of items) {
      const extraction = (item.extraction ?? {}) as Record<string, unknown>;
      const scoped = rows.filter((r) =>
        item.scope_type === 'business_profile'
          ? r.business_profile_id === item.scope_id
          : r.business_profile_id === null,
      );
      const match = findDuplicateCandidate(scoped, {
        supplierOib: extraction.supplier_oib,
        invoiceNumber: extraction.invoice_number,
        totalAmount: extraction.total_amount,
        dueDate: extraction.due_date,
        issueDate: extraction.issue_date,
        docType: resolveConfirmDocType(item.doc_type),
      });
      if (match) map.set(item.id, match);
    }
    return map;
  }, [items, rows]);
};
