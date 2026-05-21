/**
 * Lightweight cache za skup `custom_payment_sources.id` koji su povezani na bank konekciju
 * (preko `bank_accounts.linked_payment_source_id`). Koristi se u `useExpenseCRUD.addExpense`
 * za odluku `manual` vs `pending_bank` putem `bankMatchStatus.ts` helpera.
 *
 * Cache je per-(userId, businessProfileId) i živi 30s — usklađen s `useBankConnections` staleTime.
 * Invalidacija ide preko `invalidateBankLinkedSourceIds()` kad se promijeni bank konekcija
 * (connect/disconnect/link account).
 *
 * Dok nitko nema spojenu banku, vraća prazan Set bez DB hita (kratki upit vrati 0 redova).
 */
import { supabase } from '@/integrations/supabase/client';

type CacheKey = string;

interface CacheEntry {
  ids: ReadonlySet<string>;
  fetchedAt: number;
}

const TTL_MS = 30_000;
const cache = new Map<CacheKey, CacheEntry>();
const inflight = new Map<CacheKey, Promise<ReadonlySet<string>>>();

function makeKey(userId: string, businessProfileId: string | null | undefined): CacheKey {
  return `${userId}:${businessProfileId ?? 'personal'}`;
}

export function invalidateBankLinkedSourceIds(): void {
  cache.clear();
  inflight.clear();
}

export async function getBankLinkedSourceIds(
  userId: string,
  businessProfileId: string | null | undefined,
): Promise<ReadonlySet<string>> {
  const key = makeKey(userId, businessProfileId);
  const now = Date.now();

  const cached = cache.get(key);
  if (cached && now - cached.fetchedAt < TTL_MS) {
    return cached.ids;
  }

  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    let q = supabase
      .from('bank_accounts')
      .select('linked_payment_source_id')
      .not('linked_payment_source_id', 'is', null);

    if (businessProfileId) {
      q = q.eq('business_profile_id', businessProfileId);
    } else {
      q = q.is('business_profile_id', null);
    }

    const { data, error } = await q;
    if (error) {
      // Fail-soft: ne želimo blokirati expense insert ako je bank API trenutno nedostupan.
      // Vraćamo prazan Set → status pada na `manual`, što je sigurno default.
      console.warn('[bankLinkedSources] fetch failed, falling back to empty set:', error.message);
      return new Set<string>();
    }

    const ids = new Set<string>(
      (data ?? [])
        .map(r => r.linked_payment_source_id)
        .filter((id): id is string => !!id),
    );

    cache.set(key, { ids, fetchedAt: Date.now() });
    return ids;
  })();

  inflight.set(key, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(key);
  }
}
