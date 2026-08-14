/**
 * Ulazni računi — čista logika podsjetnika za dospijeće.
 *
 * Načelo: "ako app zna, ne pita" — dospijeće je pročitano pri uvozu, pa se
 * podsjetnik aktivira sam. Ritam: 3 dana prije + na dan dospijeća. Ništa se
 * ne knjiži — podsjetnik je isključivo obavijest.
 *
 * POVIJEST NE ZVONI: račun čije je dospijeće prošlo NIKAD ne okida podsjetnik
 * (ni na dan uvoza, ni kasnije). Prekoračena dospijeća su STANJE i prikazuju
 * se kao jedna agregatna stavka u "Za pažnju" (klijentski detektor).
 */

export type InvoiceDueStage = "d3" | "d0";

export interface DueReminderInvoice {
  readonly id: string;
  readonly due_date: string | null;
  readonly paid_at: string | null;
  readonly direction?: string | null;
}

/** Broj cijelih dana od `today` (UTC ponoć) do datuma dospijeća. */
export const daysUntilDue = (dueDate: string | null, today: Date): number | null => {
  if (!dueDate) return null;
  const due = new Date(`${dueDate.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(due.getTime())) return null;
  const base = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((due.getTime() - base) / 86_400_000);
};

/**
 * Faza podsjetnika za DANAŠNJI prolaz crona, ili `null` kad se ne zvoni.
 * Zvoni SAMO na točno 3 dana prije i na dan dospijeća.
 */
export const pickDueStage = (
  invoice: DueReminderInvoice,
  today: Date,
): InvoiceDueStage | null => {
  if (invoice.paid_at) return null;
  if (invoice.direction && invoice.direction !== "in") return null;
  const days = daysUntilDue(invoice.due_date, today);
  if (days === null) return null;
  if (days === 3) return "d3";
  if (days === 0) return "d0";
  return null;
};

/** Željezni dedup: po računu + fazi točno jednom, zauvijek. */
export const invoiceDueDedupKey = (invoiceId: string, stage: InvoiceDueStage): string =>
  `invoice_due:${invoiceId}:${stage}`;

export const invoiceDueI18nKeys = (stage: InvoiceDueStage) => ({
  titleKey: stage === "d3"
    ? "notifications.invoice_due.upcoming.title"
    : "notifications.invoice_due.today.title",
  messageKey: stage === "d3"
    ? "notifications.invoice_due.upcoming.message"
    : "notifications.invoice_due.today.message",
});
