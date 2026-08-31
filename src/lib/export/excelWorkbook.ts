/**
 * Excel (.xlsx) glavni sadržaj izvoza — više listova, zamrznuto zaglavlje,
 * datumi kao datumi i iznosi kao brojevi.
 *
 * Biblioteka se učitava LIJENO (dynamic import) — ne smije završiti u glavnom
 * paketu aplikacije.
 */

export interface SheetSpec {
  /** Naziv lista u Excelu (max 31 znak). */
  name: string;
  /** Tablica iz registra izvoza. */
  table: string;
}

/** Listovi glavne knjige — redoslijed je i redoslijed u datoteci. */
export const SHEET_SPECS: readonly SheetSpec[] = [
  { name: 'Troškovi', table: 'expenses' },
  { name: 'Novčanici', table: 'custom_payment_sources' },
  { name: 'Budžeti', table: 'budget_plans' },
  { name: 'Projekti', table: 'projects' },
  { name: 'Faze', table: 'project_milestones' },
  { name: 'Radnici', table: 'project_workers' },
  { name: 'Isplate radnicima', table: 'project_worker_payouts' },
  { name: 'Suradnici', table: 'project_collaborators' },
  { name: 'Izlazni računi', table: 'project_invoices' },
  { name: 'Ulazni računi', table: 'incoming_invoices' },
  { name: 'Obveze', table: 'business_debts' },
  { name: 'Rate', table: 'installments' },
  { name: 'Krug — poravnanja', table: 'krug_settlement_ledger' },
] as const;

const PREFERRED_FIRST = [
  'id', 'date', 'event_at', 'type', 'amount', 'currency', 'description', 'name', 'title',
  'category', 'merchant_name', 'status', 'payment_source', 'project_id', 'budget_id',
  'business_profile_id', 'created_at',
];

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

type CellType = 'date' | 'datetime' | 'number' | 'boolean' | 'text';

const detectType = (values: unknown[]): CellType => {
  let seen: CellType | null = null;
  for (const v of values) {
    if (v === null || v === undefined || v === '') continue;
    let current: CellType;
    if (typeof v === 'number') current = 'number';
    else if (typeof v === 'boolean') current = 'boolean';
    else if (typeof v === 'string' && DATE_ONLY.test(v)) current = 'date';
    else if (typeof v === 'string' && DATE_TIME.test(v)) current = 'datetime';
    else current = 'text';
    if (seen && seen !== current) return 'text';
    seen = current;
  }
  return seen ?? 'text';
};

const columnWidth = (header: string, values: unknown[]): number => {
  let max = header.length;
  for (const v of values.slice(0, 200)) {
    const len = v === null || v === undefined ? 0 : String(v).length;
    if (len > max) max = len;
  }
  return Math.min(Math.max(max + 2, 10), 44);
};

const toCell = (value: unknown, type: CellType) => {
  if (value === null || value === undefined || value === '') return null;
  if (type === 'number' && typeof value === 'number') return { type: Number, value, format: '#,##0.00' };
  if (type === 'boolean' && typeof value === 'boolean') return { type: Boolean, value };
  if (type === 'date' || type === 'datetime') {
    const parsed = new Date(String(value));
    if (!Number.isNaN(parsed.getTime())) {
      return { type: Date, value: parsed, format: type === 'date' ? 'dd.mm.yyyy' : 'dd.mm.yyyy hh:mm' };
    }
  }
  if (typeof value === 'object') {
    return { type: String, value: JSON.stringify(value) };
  }
  return { type: String, value: String(value) };
};

const HEADER = { fontWeight: 'bold' as const, backgroundColor: '#E6F4F1' };

/** Jedan list iz niza redaka (generički, iz stvarnih ključeva). */
function buildSheet(name: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) {
    return {
      sheet: name,
      data: [[{ ...HEADER, type: String, value: 'Nema zapisa' }]],
      columns: [{ width: 20 }],
      stickyRowsCount: 1,
    };
  }
  const keys = new Set<string>();
  rows.forEach((r) => Object.keys(r).forEach((k) => keys.add(k)));
  const ordered = [
    ...PREFERRED_FIRST.filter((k) => keys.has(k)),
    ...Array.from(keys).filter((k) => !PREFERRED_FIRST.includes(k)).sort(),
  ];
  const types = ordered.map((k) => detectType(rows.map((r) => r[k])));
  const header = ordered.map((k) => ({ ...HEADER, type: String, value: k }));
  const body = rows.map((r) => ordered.map((k, i) => toCell(r[k], types[i])));
  const columns = ordered.map((k) => ({ width: columnWidth(k, rows.map((r) => r[k])) }));
  return { sheet: name, data: [header, ...body], columns, stickyRowsCount: 1 };
}

export interface SummaryRow {
  table: string;
  rows: number | null;
  note: string;
}

function buildSummarySheet(summary: SummaryRow[]) {
  const header = ['Tablica', 'Broj zapisa', 'Napomena'].map((v) => ({ ...HEADER, type: String, value: v }));
  const body = summary.map((s) => [
    { type: String, value: s.table },
    s.rows === null ? null : { type: Number, value: s.rows, format: '#,##0' },
    { type: String, value: s.note },
  ]);
  return {
    sheet: 'Sažetak',
    data: [header, ...body],
    columns: [{ width: 34 }, { width: 14 }, { width: 70 }],
    stickyRowsCount: 1,
  };
}

/**
 * Sastavi .xlsx kao Blob. `data` su svi izvezeni redci po tablici.
 */
export async function buildExcelBlob(
  data: Record<string, Record<string, unknown>[]>,
  summary: SummaryRow[],
): Promise<Blob> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const sheets: any[] = [buildSummarySheet(summary)];
  for (const spec of SHEET_SPECS) {
    sheets.push(buildSheet(spec.name, data[spec.table] ?? []));
  }
  return (writeXlsxFile as any)(sheets).toBlob();
}
