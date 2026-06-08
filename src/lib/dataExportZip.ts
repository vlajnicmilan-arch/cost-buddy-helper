import JSZip from 'jszip';
import { supabase } from '@/integrations/supabase/client';
import { exportFile, type ExportMode } from './fileExport';
import { sanitizeCsvField } from './csvSecurity';

/**
 * Full data export: ZIP archive containing
 *  - expenses.csv (all transactions, spreadsheet-friendly)
 *  - data.json   (all other user-owned tables)
 *  - README.txt  (short description)
 *
 * Designed to give the user a one-click "download everything I have" experience
 * (GDPR-style data portability).
 */

// Tables that belong directly to a user via `user_id`. Best-effort — if a table
// is missing or the column is renamed, the fetch is skipped silently.
const USER_OWNED_TABLES = [
  'profiles',
  'app_settings',
  'notification_preferences',
  'custom_categories',
  'custom_payment_sources',
  'payment_source_cards',
  'income_sources',
  'business_profiles',
  'business_premises',
  'business_debts',
  'cash_registers',
  'clients',
  'projects',
  'project_milestones',
  'project_work_logs',
  'project_work_entries',
  'project_workers',
  'project_documents',
  'project_estimates',
  'project_funding',
  'project_templates',
  'budget_plans',
  'budget_categories',
  'savings_goals',
  'recurring_transactions',
  'installment_plans',
  'installments',
  'reminders',
  'notifications',
  'inventory_items',
  'inventory_movements',
  'invoices',
  'invoice_items',
  'travel_order_expenses',
  'transaction_notes',
  'receipt_items',
  'bank_connections',
  'referrals',
] as const;

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let str: string;
  if (typeof value === 'object') {
    try { str = JSON.stringify(value); } catch { str = String(value); }
  } else {
    str = String(value);
  }
  // CSV injection zaštita: ako vrijednost počinje s =, +, -, @ — prefixaj razmakom.
  // Vidi src/lib/csvSecurity.ts za detaljno objašnjenje napada.
  str = sanitizeCsvField(str);
  // Quote if contains delimiter, quote, or newline
  if (/[",\n\r;]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function rowsToCsv(rows: Record<string, any>[]): string {
  if (!rows.length) return '';
  // Stable column order: union of all keys, with common ones first
  const preferred = ['id', 'date', 'type', 'amount', 'currency', 'description', 'category', 'merchant_name', 'payment_source', 'project_id', 'budget_id', 'business_profile_id', 'created_at'];
  const allKeys = new Set<string>();
  rows.forEach(r => Object.keys(r).forEach(k => allKeys.add(k)));
  const ordered = [
    ...preferred.filter(k => allKeys.has(k)),
    ...Array.from(allKeys).filter(k => !preferred.includes(k)).sort(),
  ];
  const header = ordered.join(',');
  const lines = rows.map(r => ordered.map(k => escapeCsvCell(r[k])).join(','));
  return [header, ...lines].join('\n');
}

async function fetchAllRows(table: string, userId: string): Promise<any[] | null> {
  try {
    // Paginate to bypass 1000-row limit
    const all: any[] = [];
    const pageSize = 1000;
    let from = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await (supabase as any)
        .from(table)
        .select('*')
        .eq('user_id', userId)
        .range(from, from + pageSize - 1);
      if (error) {
        // Table may not have user_id column or may not exist — skip silently
        return null;
      }
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
    }
    return all;
  } catch {
    return null;
  }
}

export interface DataExportProgress {
  current: number;
  total: number;
  table: string;
}

export async function exportAllUserDataAsZip(
  mode: ExportMode = 'save',
  onProgress?: (p: DataExportProgress) => void,
): Promise<boolean> {
  const { data: userResult, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userResult?.user) {
    throw new Error('Not authenticated');
  }
  const user = userResult.user;

  const zip = new JSZip();
  const summary: Record<string, number> = {};
  const dataPayload: Record<string, any[]> = {};

  // 1. Expenses → CSV (separately, since it's the primary data)
  onProgress?.({ current: 1, total: USER_OWNED_TABLES.length + 1, table: 'expenses' });
  const expenses = (await fetchAllRows('expenses', user.id)) ?? [];
  summary.expenses = expenses.length;
  zip.file('expenses.csv', rowsToCsv(expenses));
  // Also include in JSON for completeness
  dataPayload.expenses = expenses;

  // 2. Other tables → JSON
  let idx = 1;
  for (const table of USER_OWNED_TABLES) {
    idx++;
    onProgress?.({ current: idx, total: USER_OWNED_TABLES.length + 1, table });
    const rows = await fetchAllRows(table, user.id);
    if (rows === null) continue; // skipped
    summary[table] = rows.length;
    dataPayload[table] = rows;
  }

  const manifest = {
    version: 1,
    exportedAt: new Date().toISOString(),
    userId: user.id,
    userEmail: user.email,
    source: 'cloud',
    summary,
  };

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('data.json', JSON.stringify(dataPayload, null, 2));
  zip.file(
    'README.txt',
    [
      'V&M Balance — Data Export',
      '==========================',
      '',
      `Exported at: ${manifest.exportedAt}`,
      `User: ${user.email}`,
      '',
      'Files:',
      '  - expenses.csv   All transactions (spreadsheet-friendly)',
      '  - data.json      Full data dump of all your tables',
      '  - manifest.json  Export metadata + row counts per table',
      '',
      'This export contains only data that belongs to you.',
      'Keep this archive secure — it contains personal financial information.',
    ].join('\n'),
  );

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  const fileName = `vm-balance-export-${new Date().toISOString().split('T')[0]}.zip`;
  return exportFile(blob, fileName, mode);
}
