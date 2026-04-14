/**
 * Triggers APK download using window.open to avoid cross-origin
 * restrictions with the <a download> attribute.
 * The Supabase storage URL with ?download= parameter forces
 * the browser to download instead of navigate.
 */
export function downloadApk(apkUrl: string): void {
  window.open(apkUrl, '_blank', 'noopener,noreferrer');
}
