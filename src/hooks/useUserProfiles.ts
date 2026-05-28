import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface UserProfileLite {
  user_id: string;
  display_name: string;
}

// Module-level cache shared across all consumers.
const cache = new Map<string, UserProfileLite>();
const inflight = new Map<string, Promise<void>>();

async function fetchMissing(ids: string[]): Promise<void> {
  const missing = ids.filter((id) => !cache.has(id));
  if (missing.length === 0) return;

  // Dedup parallel requests for the same IDs.
  const cacheKey = missing.sort().join(',');
  if (inflight.has(cacheKey)) {
    await inflight.get(cacheKey);
    return;
  }

  const promise = (async () => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('user_id, display_name')
        .in('user_id', missing);
      data?.forEach((p) => {
        cache.set(p.user_id, {
          user_id: p.user_id,
          display_name: p.display_name || '',
        });
      });
      // Mark unresolved IDs to avoid re-querying on every render.
      missing.forEach((id) => {
        if (!cache.has(id)) cache.set(id, { user_id: id, display_name: '' });
      });
    } catch (err) {
      console.warn('[useUserProfiles] fetch failed', err);
    } finally {
      inflight.delete(cacheKey);
    }
  })();

  inflight.set(cacheKey, promise);
  await promise;
}

/**
 * Returns a Map<user_id, UserProfileLite> for the requested user IDs.
 * Cached at module level so repeated calls across components share results.
 */
export function useUserProfiles(userIds: string[] | undefined | null): Map<string, UserProfileLite> {
  const [, setVersion] = useState(0);
  const lastKeyRef = useRef<string>('');

  useEffect(() => {
    if (!userIds || userIds.length === 0) return;
    const uniq = Array.from(new Set(userIds.filter(Boolean)));
    const key = uniq.sort().join(',');
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;

    let cancelled = false;
    fetchMissing(uniq).then(() => {
      if (!cancelled) setVersion((v) => v + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [userIds]);

  // Return a fresh map snapshot from cache.
  const map = new Map<string, UserProfileLite>();
  (userIds || []).forEach((id) => {
    if (cache.has(id)) map.set(id, cache.get(id)!);
  });
  return map;
}
