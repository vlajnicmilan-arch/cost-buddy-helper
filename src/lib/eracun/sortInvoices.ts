/**
 * eRačun v1 — poredak popisa ulaznih računa.
 *
 * Ekran se otvara da se vidi ŠTO ČEKA, ne kronologija uvoza:
 *  1. neplaćeni prije plaćenih,
 *  2. unutar neplaćenih: dospijeće uzlazno (prije dospijeva = gore),
 *     računi bez dospijeća idu na kraj neplaćenih,
 *  3. unutar plaćenih: najnovije plaćeno prvo,
 *  4. tie-break: datum izdavanja pa broj računa — stabilan i deterministički.
 */

export interface SortableIncomingInvoice {
  readonly invoice_number: string;
  readonly issue_date: string | null;
  readonly due_date: string | null;
  readonly paid_at: string | null;
}

const cmpStr = (a: string | null, b: string | null, nullsLast: boolean): number => {
  if (a === b) return 0;
  if (!a) return nullsLast ? 1 : -1;
  if (!b) return nullsLast ? -1 : 1;
  return a < b ? -1 : 1;
};

export const sortIncomingInvoices = <T extends SortableIncomingInvoice>(
  invoices: readonly T[],
): T[] =>
  [...invoices].sort((a, b) => {
    const aPaid = !!a.paid_at;
    const bPaid = !!b.paid_at;
    if (aPaid !== bPaid) return aPaid ? 1 : -1;

    if (aPaid && bPaid) {
      // Najnovije plaćeno prvo.
      const paid = cmpStr(b.paid_at, a.paid_at, true);
      if (paid !== 0) return paid;
    } else {
      const due = cmpStr(a.due_date, b.due_date, true);
      if (due !== 0) return due;
    }

    const issue = cmpStr(a.issue_date, b.issue_date, true);
    if (issue !== 0) return issue;
    return cmpStr(a.invoice_number, b.invoice_number, true);
  });

/** Dana do dospijeća (negativno = kasni). `null` kad dospijeće nije poznato. */
export const daysUntilDue = (dueDate: string | null, today: Date): number | null => {
  if (!dueDate) return null;
  const due = new Date(`${dueDate}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((due.getTime() - base.getTime()) / 86_400_000);
};
