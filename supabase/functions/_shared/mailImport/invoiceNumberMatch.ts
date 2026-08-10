/**
 * MEKA BRANA DUPLIKATA — JEDNA usporedba broja računa za cijeli sustav.
 *
 * Živi slučaj (kolovoz 2026): isti FINA račun stigao dvaput — XML nosi službeni
 * ID "I08-0626-390029", AI s PDF-a čita otisnuto "08-0626-390029". Doslovna
 * usporedba je propustila duplikat.
 *
 * Pravila:
 *  - normalizacija SAMO za usporedbu (broj koji se sprema se NIKAD ne mijenja),
 *  - uppercase + izbaci sve osim slova i znamenki,
 *  - afiks-tolerancija: jedan broj smije biti prefiks/sufiks-proširenje drugog
 *    za najviše 2 alfanumerička znaka.
 */

export const MAX_AFFIX_TOLERANCE = 2;

/** Uppercase, samo slova i znamenke. Prazno → ''. */
export function normalizeInvoiceNumber(value: string | null | undefined): string {
  return (value ?? '').toString().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Jesu li dva broja „isti" po normalizaciji + afiks-toleranciji? */
export function invoiceNumbersMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const x = normalizeInvoiceNumber(a);
  const y = normalizeInvoiceNumber(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  const diff = long.length - short.length;
  if (diff > MAX_AFFIX_TOLERANCE) return false;
  // Kratki broj mora biti jezgra dugog (bez rupa u sredini).
  return long.startsWith(short) || long.endsWith(short);
}

const normOib = (v: unknown): string =>
  (v ?? '').toString().toUpperCase().replace(/[^0-9]/g, '');

const amountsEqual = (a: unknown, b: unknown): boolean => {
  const x = Number(a);
  const y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  return Math.abs(x - y) < 0.005;
};

const dateKey = (v: unknown): string => (v ?? '').toString().trim().slice(0, 10);

const sameDate = (a: unknown, b: unknown): boolean => {
  const x = dateKey(a);
  const y = dateKey(b);
  return x !== '' && x === y;
};

export interface DuplicateCandidateRow {
  id?: string | number;
  supplier_oib?: unknown;
  supplier_name?: unknown;
  invoice_number?: unknown;
  total_amount?: unknown;
  due_date?: unknown;
  issue_date?: unknown;
  doc_type?: unknown;
}

export interface DuplicateProbe {
  supplierOib?: unknown;
  invoiceNumber?: unknown;
  totalAmount?: unknown;
  dueDate?: unknown;
  issueDate?: unknown;
  docType?: unknown;
}

export type DuplicateMatchReason = 'broj' | 'iznos_datum';

export interface DuplicateMatch<T extends DuplicateCandidateRow = DuplicateCandidateRow> {
  candidate: T;
  reason: DuplicateMatchReason;
}

/**
 * Pronađi prvi kandidat duplikata. Uvjet (širi od dosadašnjeg):
 *  (a) isti OIB + isti iznos + isti dospijeće ili datum izdavanja, ILI
 *  (b) isti OIB + broj koji prolazi normaliziranu usporedbu.
 * Poziv je već direction/scope-omeđen (filtar radi pozivatelj).
 */
export function findDuplicateCandidate<T extends DuplicateCandidateRow>(
  candidates: readonly T[],
  probe: DuplicateProbe,
): DuplicateMatch<T> | null {
  const oib = normOib(probe.supplierOib);
  if (!oib) return null;
  const docType = (probe.docType ?? '').toString().trim() || '380';

  for (const row of candidates) {
    if (normOib(row.supplier_oib) !== oib) continue;

    const rowDocType = (row.doc_type ?? '').toString().trim() || '380';
    if (invoiceNumbersMatch(probe.invoiceNumber as string, row.invoice_number as string)) {
      if (rowDocType === docType) return { candidate: row, reason: 'broj' };
    }

    if (
      amountsEqual(probe.totalAmount, row.total_amount) &&
      (sameDate(probe.dueDate, row.due_date) || sameDate(probe.issueDate, row.issue_date))
    ) {
      return { candidate: row, reason: 'iznos_datum' };
    }
  }
  return null;
}
