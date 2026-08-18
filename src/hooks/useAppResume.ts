/**
 * useAppResume — tiho pozadinsko osvježavanje na povratku u fokus/mrežu.
 *
 * Dijeli okidač s `useBundleFreshness` (`visibilitychange` → visible) i dodaje
 * `online`. Nikad ne prikazuje spinner ni grešku: stari podaci ostaju na
 * ekranu dok novi ne stignu, a neuspjeh se tiho preskače do sljedećeg okidača.
 */
import { useEffect, useRef } from 'react';
import { APP_RESUME_MIN_INTERVAL_MS, shouldResume, type AppResumeReason } from '@/lib/appResume';

interface Options {
  enabled?: boolean;
  minIntervalMs?: number;
}

export function useAppResume(
  callback: (reason: AppResumeReason) => void | Promise<unknown>,
  { enabled = true, minIntervalMs = APP_RESUME_MIN_INTERVAL_MS }: Options = {},
) {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  const lastRunRef = useRef(0);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const run = (reason: AppResumeReason) => {
      const now = Date.now();
      if (!shouldResume({ lastRunAt: lastRunRef.current, now, minIntervalMs, inFlight: inFlightRef.current })) {
        return;
      }
      lastRunRef.current = now;
      inFlightRef.current = true;
      const done = () => { inFlightRef.current = false; };
      try {
        const result = cbRef.current(reason);
        if (result && typeof (result as Promise<unknown>).then === 'function') {
          (result as Promise<unknown>).then(done, () => {
            // Fail-safe: pozadinski posao nikad ne javlja grešku korisniku.
            // Dopusti brzi ponovni pokušaj na sljedeći fokus/online.
            lastRunRef.current = 0;
            done();
          });
        } else {
          done();
        }
      } catch {
        lastRunRef.current = 0;
        done();
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') run('focus');
    };
    const onOnline = () => run('online');

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
    };
  }, [enabled, minIntervalMs]);
}
