import { Capacitor } from '@capacitor/core';
import { showError } from '@/hooks/useStatusFeedback';
import i18n from '@/i18n';

/**
 * Opens a file with the system default viewer (PDF reader, sheet app, etc.).
 * Works only on native (Capacitor). On web, returns false — the browser
 * download bar already exposes "Open" in most environments.
 */
export async function openSavedFile(uri: string, mime: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;

  try {
    const { FileOpener } = await import('@capacitor-community/file-opener');
    await FileOpener.open({ filePath: uri, contentType: mime });
    return true;
  } catch (e: any) {
    if (e?.message?.includes('cancel') || e?.message?.includes('abort')) {
      return true;
    }
    console.error('FileOpener error:', e);
    const msg = i18n.t('fileExport.openFailed', { defaultValue: 'Otvaranje nije uspjelo' }) as string;
    showError(typeof msg === 'string' ? msg : 'Otvaranje nije uspjelo');
    return false;
  }
}
