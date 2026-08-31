import JSZip from 'jszip';
import { supabase } from '@/integrations/supabase/client';
import { exportFile, type ExportMode } from './fileExport';
import { EXPORT_REGISTRY, EXPORTED_TABLES, EXCLUDED_TABLES } from './export/exportRegistry';
import { OwnedDataReader } from './export/fetchOwnedRows';
import { buildExcelBlob, SHEET_SPECS, type SummaryRow } from './export/excelWorkbook';

/**
 * Potpun izvoz korisnikovih podataka: ZIP s
 *  - podaci.xlsx    glavni sadržaj, više listova (Excel)
 *  - data.json      potpuna kopija sa svim id-evima i vezama
 *  - manifest.json  što je izvezeno (s brojem redaka), što preskočeno i zašto
 *  - README.txt     objašnjenje paketa
 *
 * Popis onoga što pripada korisniku živi ISKLJUČIVO u `export/exportRegistry.ts`.
 * Nijedna greška se ne guta — svaki pad završi u manifestu i u poruci korisniku.
 */

export interface DataExportProgress {
  current: number;
  total: number;
  table: string;
}

export interface ExportedTableInfo {
  table: string;
  rows: number;
  via: string;
}

export interface SkippedTableInfo {
  table: string;
  reason: string;
  code?: string;
}

export interface DataExportResult {
  delivered: boolean;
  exported: ExportedTableInfo[];
  skipped: SkippedTableInfo[];
  /** Izvoz je nepotpun ako je bar jedna tablica pala. */
  complete: boolean;
}

export async function exportAllUserDataAsZip(
  mode: ExportMode = 'save',
  onProgress?: (p: DataExportProgress) => void,
): Promise<DataExportResult> {
  const { data: userResult, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userResult?.user) {
    throw new Error('Not authenticated');
  }
  const user = userResult.user;

  const reader = new OwnedDataReader(user.id);
  const dataPayload: Record<string, Record<string, unknown>[]> = {};
  const exported: ExportedTableInfo[] = [];
  const skipped: SkippedTableInfo[] = [];

  const total = EXPORTED_TABLES.length;
  let idx = 0;
  for (const table of EXPORTED_TABLES) {
    idx++;
    onProgress?.({ current: idx, total, table });
    const outcome = await reader.fetchTable(table);
    if (outcome.ok) {
      dataPayload[table] = outcome.rows;
      exported.push({ table, rows: outcome.rows.length, via: outcome.via });
    } else {
      skipped.push({ table, reason: outcome.reason, code: outcome.code });
    }
  }

  const excluded = EXCLUDED_TABLES.map((table) => {
    const rule = EXPORT_REGISTRY[table].rule;
    return { table, reason: rule.via === 'excluded' ? rule.reason : '' };
  });

  const complete = skipped.length === 0;
  const exportedAt = new Date().toISOString();

  const manifest = {
    version: 2,
    exportedAt,
    userId: user.id,
    userEmail: user.email,
    source: 'cloud',
    complete,
    exported,
    skipped,
    excluded,
  };

  const summary: SummaryRow[] = [
    ...exported.map((e) => ({ table: e.table, rows: e.rows, note: `vlasništvo: ${e.via}` })),
    ...skipped.map((s) => ({ table: s.table, rows: null, note: `NIJE IZVEZENO — ${s.reason}` })),
  ];

  const zip = new JSZip();
  zip.file('podaci.xlsx', await buildExcelBlob(dataPayload, summary));
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('data.json', JSON.stringify(dataPayload, null, 2));
  zip.file('README.txt', buildReadme({ exportedAt, email: user.email ?? '', complete, skipped }));

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  const fileName = `vm-balance-izvoz-${exportedAt.split('T')[0]}.zip`;
  const delivered = await exportFile(blob, fileName, mode);

  return { delivered, exported, skipped, complete };
}

function buildReadme(args: {
  exportedAt: string;
  email: string;
  complete: boolean;
  skipped: SkippedTableInfo[];
}): string {
  const lines: string[] = [
    'V&M Balance — izvoz tvojih podataka',
    '===================================',
    '',
    `Izvezeno: ${args.exportedAt}`,
    `Korisnik: ${args.email}`,
    '',
    'ŠTO JE U PAKETU',
    '  podaci.xlsx    Glavni sadržaj u Excelu, po listovima. Otvara se dvoklikom.',
    '  data.json      Potpuna kopija svih zapisa, sa svim identifikatorima i vezama',
    '                 među zapisima (za prijenos u drugi alat).',
    '  manifest.json  Popis izvezenih tablica s brojem zapisa, popis preskočenih s',
    '                 razlogom i popis izričito isključenih s obrazloženjem.',
    '  README.txt     Ova datoteka.',
    '',
    'LISTOVI U podaci.xlsx',
    '  Sažetak                 Pregled svega izvezenog i eventualno preskočenog.',
    ...SHEET_SPECS.map((s) => `  ${s.name.padEnd(24)}Tablica: ${s.table}`),
    '',
    'OVO NIJE REZERVNA KOPIJA',
    '  Izvoz je snimka tvojih podataka za čitanje i prijenos. Ne može se vratiti',
    '  natrag u aplikaciju i ne zamjenjuje sigurnosnu kopiju.',
    '',
    'PRIVATNOST',
    '  Informacije o tome koje podatke obrađujemo, na kojoj osnovi i koliko dugo',
    '  nalaze se u pravilima privatnosti: https://www.vmbalance.com/privacy',
    '  Za pitanja o svojim pravima piši nam kroz Podršku u aplikaciji.',
    '',
    'Čuvaj ovu arhivu na sigurnom — sadrži osobne i financijske podatke.',
  ];

  if (!args.complete) {
    lines.push(
      '',
      'UPOZORENJE — IZVOZ NIJE POTPUN',
      `  Nije izvezeno ${args.skipped.length} tablica:`,
      ...args.skipped.map((s) => `    - ${s.table}: ${s.reason}`),
      '  Pokušaj ponovno; ako se ponovi, javi nam kroz Podršku.',
    );
  }

  return lines.join('\n');
}
