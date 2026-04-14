import { exportFile } from '@/lib/fileExport';

const APK_FILE_NAME = 'vm-balance.apk';

export async function downloadApk(apkUrl: string): Promise<void> {
  try {
    const response = await fetch(apkUrl, {
      mode: 'cors',
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch APK: ${response.status}`);
    }

    const blob = await response.blob();
    if (!blob.size) {
      throw new Error('APK blob is empty');
    }

    await exportFile(blob, APK_FILE_NAME);
  } catch (error) {
    console.error('APK download failed, falling back to direct download.', error);
    window.location.assign(apkUrl);
  }
}
