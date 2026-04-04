import { Capacitor } from '@capacitor/core';

/**
 * Central file export helper that works on both web and native (Capacitor) platforms.
 * 
 * Web: Blob → objectURL → <a download>
 * Native: Blob → base64 → Filesystem.writeFile → Share.share
 */

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
    default: return 'application/octet-stream';
  }
}

/**
 * Export/download a file. Detects platform and uses the appropriate method.
 * Returns true if the export was initiated successfully.
 */
export async function exportFile(blob: Blob, fileName: string): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    return exportFileNative(blob, fileName);
  }
  return exportFileWeb(blob, fileName);
}

function exportFileWeb(blob: Blob, fileName: string): boolean {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  // Cleanup after a short delay to ensure download starts
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 200);
  return true;
}

async function exportFileNative(blob: Blob, fileName: string): Promise<boolean> {
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');

    const base64Data = await blobToBase64(blob);

    // Write to cache directory
    const writeResult = await Filesystem.writeFile({
      path: fileName,
      data: base64Data,
      directory: Directory.Cache,
    });

    // Get the full URI for sharing
    const fileUri = writeResult.uri;

    // Open native share sheet so user can save/share the file
    await Share.share({
      title: fileName,
      files: [fileUri],
      dialogTitle: 'Spremi ili podijeli datoteku',
    });

    return true;
  } catch (e: any) {
    // User cancelled share dialog
    if (e?.message?.includes('cancel') || e?.message?.includes('abort')) {
      return true; // File was written, user just cancelled sharing
    }
    console.error('Native file export error:', e);

    // Fallback: try web method anyway
    try {
      return exportFileWeb(blob, fileName);
    } catch {
      return false;
    }
  }
}

/**
 * Helper: export a jsPDF document
 */
export async function exportPDFDoc(doc: any, fileName: string): Promise<boolean> {
  const blob = doc.output('blob') as Blob;
  return exportFile(blob, fileName);
}

/**
 * Helper: export text content (CSV, JSON, ICS, etc.)
 */
export async function exportTextFile(
  content: string,
  fileName: string,
  mimeType?: string,
  addBOM: boolean = false
): Promise<boolean> {
  const type = mimeType || getMimeType(fileName);
  const finalContent = addBOM ? '\ufeff' + content : content;
  const blob = new Blob([finalContent], { type: `${type};charset=utf-8` });
  return exportFile(blob, fileName);
}
