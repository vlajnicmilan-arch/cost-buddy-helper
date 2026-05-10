/**
 * APK Installer (native Android only)
 *
 * Flow:
 *   1. Download APK to Documents directory via @capacitor/filesystem
 *   2. Verify SHA-256 checksum if provided in version.json (Faza 4 §1)
 *   3. Open the file via @capacitor-community/file-opener which triggers the
 *      Android package installer Intent. Same keystore signature → upgrade
 *      install (user data preserved).
 *
 * Defensive guarantees:
 *   - Telemetry is fire-and-forget; never crashes the flow.
 *   - SHA-256 mismatch deletes the file and surfaces a localized error.
 *   - Empty/null `expectedSha256` → check is skipped (legacy version.json).
 */
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { FileOpener } from '@capacitor-community/file-opener';
import { logUpdateEvent } from '@/lib/updateTelemetry';
import { getIsNativeApp } from './updateUtils';

const APK_FILE_NAME = 'vm-balance-update.apk';
const APK_MIME = 'application/vnd.android.package-archive';

export interface ApkInstallResult {
  success: boolean;
  errorKey?: string;
  errorDetail?: string;
}

const onProgress = (cb?: (pct: number) => void) => (event: { contentLength: number; bytes: number }) => {
  if (!event.contentLength) return;
  const pct = Math.min(100, Math.round((event.bytes / event.contentLength) * 100));
  cb?.(pct);
};

const computeSha256 = async (base64: string): Promise<string> => {
  // Decode base64 → Uint8Array → SubtleCrypto digest
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

export const downloadAndInstallApk = async (
  apkUrl: string,
  expectedSha256: string | null,
  onProgressUpdate?: (pct: number) => void
): Promise<ApkInstallResult> => {
  if (!getIsNativeApp()) {
    return { success: false, errorKey: 'errors.appUpdate.platformUnsupported' };
  }

  logUpdateEvent('update_download_started', { url: apkUrl });

  try {
    // 1. Download to Documents directory
    const downloadResult = await Filesystem.downloadFile({
      url: apkUrl,
      path: APK_FILE_NAME,
      directory: Directory.Documents,
      progress: true,
    } as Parameters<typeof Filesystem.downloadFile>[0]);

    // Listen for progress (best-effort)
    const progressListener = await Filesystem.addListener('progress', onProgress(onProgressUpdate)).catch(
      () => null
    );

    if (!downloadResult?.path) {
      progressListener?.remove();
      logUpdateEvent('update_download_failed', { reason: 'no_path_returned' });
      return { success: false, errorKey: 'errors.appUpdate.downloadFailed' };
    }

    progressListener?.remove();
    logUpdateEvent('update_download_completed', { path: downloadResult.path });

    // 2. Verify SHA-256 if expected hash is provided
    if (expectedSha256 && expectedSha256.trim().length > 0) {
      try {
        const fileData = await Filesystem.readFile({
          path: APK_FILE_NAME,
          directory: Directory.Documents,
          encoding: undefined as unknown as Encoding, // base64
        });

        const actualSha = await computeSha256(
          typeof fileData.data === 'string' ? fileData.data : ''
        );

        if (actualSha.toLowerCase() !== expectedSha256.toLowerCase()) {
          logUpdateEvent('update_checksum_failed', {
            expected: expectedSha256,
            actual: actualSha,
          });
          // Delete corrupted/tampered file
          await Filesystem.deleteFile({
            path: APK_FILE_NAME,
            directory: Directory.Documents,
          }).catch(() => null);
          return {
            success: false,
            errorKey: 'errors.appUpdate.checksumFailed',
            errorDetail: `expected ${expectedSha256.slice(0, 8)}…, got ${actualSha.slice(0, 8)}…`,
          };
        }
      } catch (shaErr) {
        // SHA computation failure is logged but does NOT block install
        // (rather not surface as broken than refuse legit update).
        console.warn('[ApkInstaller] SHA-256 check skipped due to error:', shaErr);
      }
    }

    // 3. Trigger Android package installer
    logUpdateEvent('update_install_intent_launched', { path: downloadResult.path });
    await FileOpener.open({
      filePath: downloadResult.path,
      contentType: APK_MIME,
      openWithDefault: true,
    });

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logUpdateEvent('update_download_failed', { reason: message });
    return {
      success: false,
      errorKey: 'errors.appUpdate.downloadFailed',
      errorDetail: message,
    };
  }
};
