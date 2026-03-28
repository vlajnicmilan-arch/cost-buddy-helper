import { useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { Expense, ReceiptItem } from '@/types/expense';

interface QueuedTransaction {
  id: string;
  expense: Omit<Expense, 'id' | 'user_id' | 'created_at' | 'updated_at'>;
  items?: ReceiptItem[];
  timestamp: number;
}

const QUEUE_KEY = 'vmbalance_offline_queue';

const getQueue = (): QueuedTransaction[] => {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveQueue = (queue: QueuedTransaction[]) => {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
};

export const useOfflineQueue = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [queueSize, setQueueSize] = useState(getQueue().length);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Try Capacitor Network plugin for native
    let networkListener: any;
    const setupNativeListener = async () => {
      if (Capacitor.isNativePlatform()) {
        try {
          const { Network } = await import('@capacitor/network');
          const status = await Network.getStatus();
          setIsOnline(status.connected);
          networkListener = await Network.addListener('networkStatusChange', (s) => {
            setIsOnline(s.connected);
          });
        } catch (e) {
          console.warn('Capacitor Network plugin not available', e);
        }
      }
    };
    setupNativeListener();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      networkListener?.remove?.();
    };
  }, []);

  const addToQueue = useCallback((
    expense: Omit<Expense, 'id' | 'user_id' | 'created_at' | 'updated_at'>,
    items?: ReceiptItem[]
  ) => {
    const queue = getQueue();
    queue.push({
      id: crypto.randomUUID(),
      expense,
      items,
      timestamp: Date.now(),
    });
    saveQueue(queue);
    setQueueSize(queue.length);
  }, []);

  const syncQueue = useCallback(async () => {
    const queue = getQueue();
    if (queue.length === 0 || syncing) return;

    setSyncing(true);
    const failed: QueuedTransaction[] = [];

    for (const item of queue) {
      try {
        const { data: session } = await supabase.auth.getSession();
        if (!session.session) {
          failed.push(item);
          continue;
        }

        const { error } = await supabase.from('expenses').insert([{
          ...item.expense,
          user_id: session.session.user.id,
        }] as any);

        if (error) {
          console.error('Failed to sync queued transaction:', error);
          failed.push(item);
        }
      } catch (e) {
        console.error('Sync error:', e);
        failed.push(item);
      }
    }

    saveQueue(failed);
    setQueueSize(failed.length);
    setSyncing(false);

    const synced = queue.length - failed.length;
    if (synced > 0) {
      return synced;
    }
    return 0;
  }, [syncing]);

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline && queueSize > 0) {
      syncQueue();
    }
  }, [isOnline, queueSize, syncQueue]);

  return {
    isOnline,
    queueSize,
    syncing,
    addToQueue,
    syncQueue,
  };
};
