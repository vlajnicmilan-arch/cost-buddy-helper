import { useEffect, useState } from 'react';
import { buildDefaultApkUrl, fetchLatestVersion } from '@/components/update/updateUtils';

/**
 * Rezolvira APK URL preko stabilnog Storage manifesta (koji CI ažurira pri
 * svakom releaseu). Dok manifest ne odgovori, vraća fallback (buildDefaultApkUrl
 * ili proslijeđeni fallbackUrl) kako gumb ne bi bio blokiran.
 */
export const useLatestApkUrl = (fallbackUrl?: string): string => {
  const cacheBust = Math.floor(Date.now() / (5 * 60 * 1000)).toString();
  const initial = fallbackUrl ?? buildDefaultApkUrl(cacheBust) ?? '';
  const [apkUrl, setApkUrl] = useState<string>(initial);

  useEffect(() => {
    let cancelled = false;
    fetchLatestVersion()
      .then((res) => {
        if (cancelled) return;
        if (res.apkUrl) setApkUrl(res.apkUrl);
      })
      .catch(() => {
        /* fallback ostaje */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return apkUrl;
};
