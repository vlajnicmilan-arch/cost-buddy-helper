import { Capacitor } from '@capacitor/core';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import i18n from '@/i18n';

/**
 * Central file export helper that works on both web and native (Capacitor) platforms.
 *
 * Modes:
 *  - 'save'  → web: <a download>; native: Filesystem.writeFile to public Documents (no share dialog)
 *  - 'share' → web: navigator.share when available, fallback to download;
 *              native: Filesystem.writeFile to Cache + Share.share dialog
 */

export type ExportMode = 'save' | 'share';

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Remove the data:...;base64, prefix
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function getMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf': return 'application/pdf';
    case 'csv': return 'text/csv';
    case 'json': return 'application/json';
    case 'ics': return 'text/calendar';
    case 'html': return 'text/html';
    case 'zip': return 'application/zip';
    default: return 'application/octet-stream';
  }
}

function tx(key: string, fallback: string): string {
  try {
    const v = i18n.t(key, { defaultValue: fallback });
    return typeof v === 'string' ? v : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Export/download a file. Detects platform and uses the appropriate method.
 * Returns true if the export was initiated successfully.
 */
export async function exportFile(
  blob: Blob,
  fileName: string,
  mode: ExportMode = 'save'
): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    return exportFileNative(blob, fileName, mode);
  }
  return exportFileWeb(blob, fileName, mode);
}

async function exportFileWeb(blob: Blob, fileName: string, mode: ExportMode): Promise<boolean> {
  if (mode === 'share') {
    // Try Web Share API with files
    try {
      const file = new File([blob], fileName, { type: blob.type || getMimeType(fileName) });
      const navAny = navigator as any;
      if (navAny.canShare && navAny.canShare({ files: [file] })) {
        await navAny.share({ files: [file], title: fileName });
        return true;
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return true;
      // fallthrough to download
    }
    // Fallback: download
  }
  return webDownload(blob, fileName);
}

function webDownload(blob: Blob, fileName: string): boolean {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 200);
  return true;
}

async function exportFileNative(blob: Blob, fileName: string, mode: ExportMode): Promise<boolean> {
  try {
    const base64Data = await blobToBase64(blob);
    // Always go through native share/save dialog — Capacitor's Directory.Documents
    // writes to app-private external storage on Android 11+, which the user cannot
    // see in Files/Downloads. Share dialog lets the user pick a real destination
    // (Drive, Downloads, email, ...) and is the only reliable way to surface the file.
    const dialogTitleKey = mode === 'share' ? 'fileExport.shareDialogTitle' : 'fileExport.saveDialogTitle';
    const dialogTitleFallback = mode === 'share' ? 'Podijeli datoteku' : 'Spremi datoteku';
    return shareFromCache(base64Data, fileName, tx(dialogTitleKey, dialogTitleFallback));
  } catch (e: any) {
    console.error('Native file export error:', e);
    showError(tx('errors.files.saveFailed', 'Greška pri spremanju datoteke'));
    return false;
  }
}

async function shareFromCache(base64Data: string, fileName: string, dialogTitle: string): Promise<boolean> {
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');

    const writeResult = await Filesystem.writeFile({
      path: fileName,
      data: base64Data,
      directory: Directory.Cache,
    });

    await Share.share({
      title: fileName,
      files: [writeResult.uri],
      dialogTitle,
    });
    return true;
  } catch (e: any) {
    if (e?.message?.includes('cancel') || e?.message?.includes('abort')) {
      return true;
    }
    console.error('Share error:', e);
    showError(tx('errors.files.shareFailed', 'Dijeljenje nije uspjelo'));
    return false;
  }
}

/**
 * Helper: export a jsPDF document
 */
export async function exportPDFDoc(
  doc: any,
  fileName: string,
  mode: ExportMode = 'save'
): Promise<boolean> {
  const blob = doc.output('blob') as Blob;
  return exportFile(blob, fileName, mode);
}

/**
 * Helper: export text content (CSV, JSON, ICS, etc.)
 */
export async function exportTextFile(
  content: string,
  fileName: string,
  mimeType?: string,
  addBOM: boolean = false,
  mode: ExportMode = 'save'
): Promise<boolean> {
  const type = mimeType || getMimeType(fileName);
  const finalContent = addBOM ? '\ufeff' + content : content;
  const blob = new Blob([finalContent], { type: `${type};charset=utf-8` });
  return exportFile(blob, fileName, mode);
}
