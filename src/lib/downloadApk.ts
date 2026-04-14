/**
 * Triggers a native browser download for the APK file by creating
 * a temporary anchor element. This avoids fetch/blob issues and
 * Service Worker interception on mobile browsers.
 */
export function downloadApk(apkUrl: string): void {
  const a = document.createElement('a');
  a.href = apkUrl;
  a.download = 'vm-balance.apk';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  // Clean up after a short delay to ensure the click registers
  setTimeout(() => document.body.removeChild(a), 100);
}
