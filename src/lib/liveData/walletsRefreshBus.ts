/**
 * Registry of wallet refreshers. Every mounted `useCustomPaymentSources`
 * instance registers its own server fetch; the live listener only says
 * "wallets are dirty" and never carries row data into state.
 *
 * `force: true` (a real database change) bypasses the short share cache;
 * `force: false` (catch-up after a channel reconnect) may reuse a result that
 * the resume path fetched moments ago, so resume + reconnect never double-fetch.
 */
export interface WalletsRefreshOptions {
  force: boolean;
}

type Refresher = (options: WalletsRefreshOptions) => Promise<unknown> | unknown;

const refreshers = new Set<Refresher>();

export function registerWalletsRefresher(refresher: Refresher): () => void {
  refreshers.add(refresher);
  return () => {
    refreshers.delete(refresher);
  };
}

export async function refreshAllWallets(options: WalletsRefreshOptions): Promise<void> {
  await Promise.allSettled(Array.from(refreshers, (r) => r(options)));
}

export const __walletsRefresherCountForTests = () => refreshers.size;
export const __resetWalletsRefreshersForTests = () => refreshers.clear();
