/**
 * Registry of wallet refreshers. Every mounted `useCustomPaymentSources`
 * instance registers its own server fetch; the live listener only says
 * "wallets are dirty" and never carries row data into state.
 */
type Refresher = () => Promise<unknown> | unknown;

const refreshers = new Set<Refresher>();

export function registerWalletsRefresher(refresher: Refresher): () => void {
  refreshers.add(refresher);
  return () => {
    refreshers.delete(refresher);
  };
}

export async function refreshAllWallets(): Promise<void> {
  await Promise.allSettled(Array.from(refreshers, (r) => r()));
}

export const __walletsRefresherCountForTests = () => refreshers.size;
export const __resetWalletsRefreshersForTests = () => refreshers.clear();
