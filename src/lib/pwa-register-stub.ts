import { useCallback, useState } from 'react';

export const useRegisterSW = () => {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);

  const updateServiceWorker = useCallback(async (_reloadPage?: boolean) => {
    setNeedRefresh(false);
    setOfflineReady(false);
  }, []);

  return {
    needRefresh: [needRefresh, setNeedRefresh] as const,
    offlineReady: [offlineReady, setOfflineReady] as const,
    updateServiceWorker,
  };
};
