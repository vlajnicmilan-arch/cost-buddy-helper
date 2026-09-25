/**
 * Live refresh registry, per topic. Mounted data hooks register their own
 * server fetch; the live listener only says "topic dirty" and never carries
 * row data into state.
 *
 * Topics:
 * - `wallets`: `useCustomPaymentSources` instances.
 *   `force: true` (a real database change) bypasses the short share cache;
 *   `force: false` (catch-up after reconnect) may reuse a fresh resume result.
 * - `transactions`: screens with their own expenses fetch (budget pending list).
 *   Marked by the existing expenses channel in `useExpenseFetch`.
 */
export type LiveTopic = 'wallets' | 'transactions';

export interface WalletsRefreshOptions {
  force: boolean;
}

type Refresher = (options: WalletsRefreshOptions) => Promise<unknown> | unknown;

const refreshers: Record<LiveTopic, Set<Refresher>> = {
  wallets: new Set(),
  transactions: new Set(),
};
const dirtyMarkers: Partial<Record<LiveTopic, () => void>> = {};

export function registerLiveRefresher(topic: LiveTopic, refresher: Refresher): () => void {
  refreshers[topic].add(refresher);
  return () => {
    refreshers[topic].delete(refresher);
  };
}

export async function refreshLiveTopic(topic: LiveTopic, options: WalletsRefreshOptions): Promise<void> {
  await Promise.allSettled(Array.from(refreshers[topic], (r) => r(options)));
}

/** The provider installs the batcher for a topic; `null` removes it. */
export function setLiveDirtyMarker(topic: LiveTopic, marker: (() => void) | null): void {
  if (marker) dirtyMarkers[topic] = marker;
  else delete dirtyMarkers[topic];
}

/** No-op when no provider is active (signed out, local mode). */
export function markLiveDirty(topic: LiveTopic): void {
  dirtyMarkers[topic]?.();
}

export const registerWalletsRefresher = (refresher: Refresher) => registerLiveRefresher('wallets', refresher);
export const refreshAllWallets = (options: WalletsRefreshOptions) => refreshLiveTopic('wallets', options);

export const __walletsRefresherCountForTests = () => refreshers.wallets.size;
export const __resetWalletsRefreshersForTests = () => {
  refreshers.wallets.clear();
  refreshers.transactions.clear();
  delete dirtyMarkers.wallets;
  delete dirtyMarkers.transactions;
};
