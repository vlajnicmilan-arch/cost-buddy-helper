/**
 * APK Installer (native Android only)
 *
 * Strategija (v2):
 *   Umjesto da APK preuzimamo u Documents pa pokrećemo FileOpener (čiji
 *   plugin @capacitor-community/file-opener v8 ne registrira se pouzdano u
 *   Capacitor 8 APK-u — potvrđeno preko `update_download_failed` telemetrije
 *   s porukom `"FileOpener" plugin is not implemented on android`), otvaramo
 *   javni APK URL preko @capacitor/browser. Android system tada:
 *     1. preuzme APK kroz Download Manager
 *     2. nakon završetka klika korisnik ponudi "Open" → Package Installer
 *     3. (jedna)krat traži "Install unknown apps" dozvolu za browser
 *     4. instalira upgrade preko postojeće verzije (isti potpis → user data
 *        ostaje netaknut)
 *
 * Prednosti:
 *   - nema ovisnosti o nepouzdanim third-party pluginima
 *   - nema FileProvider konfiguracije za APK iz Documents direktorija
 *   - radi i kad app nema dozvolu za pisanje u Downloads (Android 10+ scoped storage)
 *
 * Trade-off: ne možemo prikazivati progress bar jer download ne ide kroz
 * Filesystem API. UI će zato samo prikazati "Otvaram preuzimanje…" stanje.
 */
import { Browser } from '@capacitor/browser';
import { logUpdateEvent } from '@/lib/updateTelemetry';
import { getIsNativeApp } from './updateUtils';

export interface ApkInstallResult {
  success: boolean;
  errorKey?: string;
  errorDetail?: string;
}

export const downloadAndInstallApk = async (
  apkUrl: string,
  _expectedSha256: string | null,
  _onProgressUpdate?: (pct: number) => void
): Promise<ApkInstallResult> => {
  if (!getIsNativeApp()) {
    return { success: false, errorKey: 'errors.appUpdate.platformUnsupported' };
  }

  logUpdateEvent('update_download_started', { url: apkUrl, strategy: 'browser' });

  try {
    // Otvori APK URL u Custom Tab / system browseru.
    // Android Download Manager preuzima APK i nudi instalaciju.
    await Browser.open({
      url: apkUrl,
      windowName: '_system',
    });

    logUpdateEvent('update_install_intent_launched', { url: apkUrl, strategy: 'browser' });
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logUpdateEvent('update_download_failed', { reason: message, strategy: 'browser' });
    return {
      success: false,
      errorKey: 'errors.appUpdate.downloadFailed',
      errorDetail: message,
    };
  }
};
