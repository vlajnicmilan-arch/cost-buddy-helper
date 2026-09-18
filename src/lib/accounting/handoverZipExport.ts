/**
 * Predaja knjigovođi — ZIP s originalnim dokumentima troškova iz paketa.
 *
 * Jedan PDF po trošku, naziv poklapa s pregledom (redni broj + trgovac +
 * iznos). Slike se prije toga očiste u sken (`scanCleanup`), PDF privici
 * idu kakvi jesu (samo preimenovani). Izvori slike:
 *  - `local:<putanja>` — slika na uređaju (native: LocalFileCache/Filesystem,
 *    web: localStorage ključ `receipt_img_*`),
 *  - putanja u spremniku `receipts` (oblak, potpisana poveznica),
 *  - puna `http(s)` poveznica.
 *
 * Trošak čija se slika ne može pročitati ili obraditi ne ruši paket:
 * ide u popis problema, a ostali se normalno zapakiraju. Uz PDF-ove zip
 * sadrži `popis.txt` s popisom koji odgovara pregledu.
 */
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import i18n from '@/i18n';
import { supabase } from '@/integrations/supabase/client';
import { exportFile, type ExportMode } from '@/lib/fileExport';
import { buildReportFileName } from '@/lib/reportDesign';
import { logDiagnostic } from '@/lib/diagnosticLogger';
import { cleanupToPdfBytes } from './scanCleanup';
import type { HandoverExpenseLike } from './handoverPackage';

export interface ZipProblem {
  expenseId: string;
  supplier: string;
  /** 'no_file' — original nije dostupan; 'processing_failed' — obrada slike nije uspjela. */
  reason: 'no_file' | 'processing_failed';
}

export interface HandoverZipResult {
  exported: boolean;
  packed: number;
  problems: ZipProblem[];
}

const isNative = Capacitor.isNativePlatform();
const RECEIPTS_BUCKET = 'receipts';

const sanitizeFilePart = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

/** Naziv dokumenta u zipu — poklapa se s popisom iz pregleda. */
export const zipEntryName = (
  index: number,
  expense: HandoverExpenseLike,
): string => {
  const supplier = sanitizeFilePart(expense.merchant_name ?? '') || 'racun';
  const amount = Number(expense.amount ?? 0).toFixed(2).replace('.', ',');
  return `${String(index).padStart(2, '0')}-${supplier}-${amount}.pdf`;
};

interface LoadedOriginal {
  bytes: Uint8Array;
  isPdf: boolean;
  dataUrl?: string;
}

const dataUrlToBytes = (dataUrl: string): Uint8Array => {
  const base64 = dataUrl.split(',')[1] ?? '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // %PDF
const isPdfBytes = (bytes: Uint8Array): boolean =>
  bytes.length > 4 && PDF_MAGIC.every((b, i) => bytes[i] === b);

/** Učita original troška kao bajtove (ili data URL za slike). */
const loadOriginal = async (receiptUrl: string): Promise<LoadedOriginal | null> => {
  if (receiptUrl.startsWith('local:')) {
    const path = receiptUrl.replace(/^local:/, '');
    if (isNative) {
      try {
        const result = await Filesystem.readFile({ path, directory: Directory.Data });
        const dataUrl = `data:image/jpeg;base64,${result.data}`;
        return { bytes: dataUrlToBytes(dataUrl), isPdf: false, dataUrl };
      } catch {
        return null;
      }
    }
    // Web/PWA: skener sprema sliku u localStorage pod `receipt_img_*` ključem.
    try {
      const raw = localStorage.getItem(path);
      if (!raw) return null;
      const dataUrl = raw.startsWith('data:') ? raw : `data:image/jpeg;base64,${raw}`;
      return { bytes: dataUrlToBytes(dataUrl), isPdf: false, dataUrl };
    } catch {
      return null;
    }
  }

  const url = /^https?:\/\//i.test(receiptUrl)
    ? receiptUrl
    : await supabase.storage
        .from(RECEIPTS_BUCKET)
        .createSignedUrl(receiptUrl, 3600)
        .then(({ data, error }) => (error || !data ? null : data.signedUrl));
  if (!url) return null;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (isPdfBytes(bytes) || blob.type === 'application/pdf') {
      return { bytes, isPdf: true };
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('read_failed'));
      reader.readAsDataURL(blob);
    });
    return { bytes, isPdf: false, dataUrl };
  } catch {
    return null;
  }
};

/**
 * Složi ZIP originala za dane troškove. Troškovi bez dostupnog originala
 * ili s neuspjelom obradom idu u `problems`; paket se svejedno složi za
 * ostale. Baca grešku samo kad ZIP uopće ne može nastati.
 */
export const exportHandoverOriginalsZip = async (
  expenses: readonly HandoverExpenseLike[],
  companyName: string,
  period: string,
  mode: ExportMode = 'save',
): Promise<HandoverZipResult> => {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const problems: ZipProblem[] = [];
  const listing: string[] = [];
  let packed = 0;

  for (let i = 0; i < expenses.length; i++) {
    const expense = expenses[i];
    const supplier = expense.merchant_name ?? '';
    const entryName = zipEntryName(i + 1, expense);
    try {
      const loaded = expense.receipt_url ? await loadOriginal(expense.receipt_url) : null;
      if (!loaded) {
        problems.push({ expenseId: expense.id, supplier, reason: 'no_file' });
        logDiagnostic({
          event: 'accounting_handover_zip_original_missing',
          severity: 'warn',
          details: { expense_id: expense.id, reason: 'no_file' },
        });
        continue;
      }
      let pdfBytes: Uint8Array;
      if (loaded.isPdf) {
        // PDF original ide kakav jest — samo se preimenuje po popisu.
        pdfBytes = loaded.bytes;
      } else if (loaded.dataUrl) {
        pdfBytes = await cleanupToPdfBytes(loaded.dataUrl);
      } else {
        throw new Error('processing_failed');
      }
      zip.file(entryName, pdfBytes);
      listing.push(`${entryName} — ${[supplier, expense.date ?? ''].filter(Boolean).join(', ')}`);
      packed += 1;
    } catch (err) {
      problems.push({ expenseId: expense.id, supplier, reason: 'processing_failed' });
      logDiagnostic({
        event: 'accounting_handover_zip_processing_failed',
        severity: 'error',
        details: {
          expense_id: expense.id,
          code: (err as { code?: string })?.code ?? null,
          message: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }

  zip.file('popis.txt', listing.join('\n'));

  const blob = await zip.generateAsync({ type: 'blob' });
  const fileName = buildReportFileName({
    type: `predaja-knjigovodstvu-originali-${companyName}`,
    period,
    ext: 'zip',
  });
  const exported = await exportFile(blob, fileName, mode);

  if (packed === 0 && expenses.length > 0) {
    logDiagnostic({
      event: 'accounting_handover_zip_empty',
      severity: 'warn',
      details: { period, requested: expenses.length },
    });
  }

  void i18n;
  return { exported, packed, problems };
};
