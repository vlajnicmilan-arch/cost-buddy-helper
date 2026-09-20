/**
 * PRISTUP REDCIMA NA DIJELJENOM NOVČANIKU — izdvojeno iz `useExpenseFetch`.
 *
 * Pravilo je do sada živjelo samo u `dashboardExpenses`, pa su tuđi redci s
 * dijeljenog novčanika curili u `expenses` / `contextFilteredExpenses` i time
 * u statistike, grafove i sažetke. Ovo je jedini izvor istine:
 *
 *   - redak na dijeljenom novčaniku vidi se u osobnim skupovima samo ako je
 *     korisnikov ILI ako korisnik na tom novčaniku ima ulogu 'full';
 *   - isto vrijedi za prijenos čije je ODREDIŠTE dijeljeni novčanik;
 *   - redci izvan dijeljenih novčanika ovdje se ne diraju (true).
 *
 * Tuđi redci ostaju vidljivi isključivo u popisu samog novčanika
 * (`rawExpenses` / `PaymentSourceTransactionsDialog`).
 */

export interface SharedAccessContext {
  userId: string;
  sharedPaymentSourceIds: ReadonlySet<string>;
  fullAccessSourceIds: ReadonlySet<string>;
}

export interface SharedAccessRow {
  user_id?: string | null;
  payment_source?: string | null;
  income_source_id?: string | null;
  type?: string | null;
}

/** `custom:UUID` → UUID; ostalo vraća kako jest. */
const cleanSourceId = (paymentSource: string | null | undefined): string | null => {
  if (!paymentSource || typeof paymentSource !== 'string') return null;
  return paymentSource.startsWith('custom:') ? paymentSource.slice('custom:'.length) : paymentSource;
};

export const isSharedRowVisible = (row: SharedAccessRow, ctx: SharedAccessContext): boolean => {
  const { userId, sharedPaymentSourceIds, fullAccessSourceIds } = ctx;

  const ps = cleanSourceId(row.payment_source ?? null);
  if (ps && sharedPaymentSourceIds.has(ps)) {
    if (fullAccessSourceIds.has(ps)) return true;
    return row.user_id === userId;
  }

  if (row.type === 'transfer' && row.income_source_id) {
    const dest = row.income_source_id;
    if (sharedPaymentSourceIds.has(dest)) {
      if (fullAccessSourceIds.has(dest)) return true;
      return row.user_id === userId;
    }
  }

  return true;
};

export const applySharedAccessFilter = <T extends SharedAccessRow>(
  list: readonly T[],
  ctx: SharedAccessContext,
): T[] => list.filter((row) => isSharedRowVisible(row, ctx));
