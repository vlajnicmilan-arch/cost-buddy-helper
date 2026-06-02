import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Notification } from '@/types/notification';
import { useNotificationSound, showBrowserNotification } from '@/hooks/useNotificationSound';
import { useAppBadge } from '@/hooks/useAppBadge';

/**
 * Returns true if the notification represents an auto-reconciled "issue"
 * (budget_burn, project_loss_zone, overdue_invoice, ...).
 * These rows have a dedup_key and must be dismissed (status='dismissed') via RPC
 * so the reconciler does NOT recreate them on next pass.
 */
const isIssueNotification = (n: Notification): boolean => {
  return !!n.dedup_key;
};

export const useNotifications = () => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const { playNotificationSound } = useNotificationSound();
  const { setBadge } = useAppBadge();

  const fetchNotifications = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await (supabase as any)
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      const typedData = (data || []) as Notification[];
      setNotifications(typedData);
      const unread = typedData.filter(n => !n.read).length;
      setUnreadCount(unread);
      setBadge(unread);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Subscribe to realtime notifications
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('notifications-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newNotification = payload.new as Notification;
          if (newNotification.status && newNotification.status !== 'active') return;
          setNotifications(prev => {
            if (prev.some(n => n.id === newNotification.id)) return prev;
            return [newNotification, ...prev];
          });
          setUnreadCount(prev => prev + 1);

          playNotificationSound();
          showBrowserNotification(newNotification.title, newNotification.message);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const updated = payload.new as Notification;
          if (updated.status && updated.status !== 'active') {
            // resolved/dismissed → remove from visible list
            setNotifications(prev => {
              const existing = prev.find(n => n.id === updated.id);
              if (!existing) return prev;
              if (!existing.read) {
                setUnreadCount(c => Math.max(0, c - 1));
              }
              return prev.filter(n => n.id !== updated.id);
            });
          } else {
            setNotifications(prev => prev.map(n => (n.id === updated.id ? { ...n, ...updated } : n)));
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const oldRow = payload.old as { id: string };
          setNotifications(prev => {
            const existing = prev.find(n => n.id === oldRow.id);
            if (!existing) return prev;
            if (!existing.read) {
              setUnreadCount(c => Math.max(0, c - 1));
            }
            return prev.filter(n => n.id !== oldRow.id);
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const markAsRead = async (notificationId: string) => {
    try {
      const { error } = await (supabase as any)
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId);

      if (error) throw error;

      setNotifications(prev =>
        prev.map(n => (n.id === notificationId ? { ...n, read: true } : n))
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    if (!user) return;

    try {
      const { error } = await (supabase as any)
        .from('notifications')
        .update({ read: true })
        .eq('user_id', user.id)
        .eq('status', 'active')
        .eq('read', false);

      if (error) throw error;

      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
      setBadge(0);
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  const deleteNotification = async (notificationId: string) => {
    try {
      const notification = notifications.find(n => n.id === notificationId);

      // Optimistic update
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      if (notification && !notification.read) {
        const newUnread = Math.max(0, unreadCount - 1);
        setUnreadCount(newUnread);
        setBadge(newUnread);
      }

      if (notification && isIssueNotification(notification)) {
        // Issue rows: dismiss (keeps a 7-day suppression in upsert_active_issue)
        const { error } = await (supabase as any).rpc('dismiss_notification', { p_id: notificationId });
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from('notifications')
          .delete()
          .eq('id', notificationId);
        if (error) throw error;
      }
    } catch (error) {
      console.error('Error deleting notification:', error);
      // Re-sync on failure
      fetchNotifications();
    }
  };

  const deleteAllNotifications = async (): Promise<boolean> => {
    if (!user) return false;
    const snapshot = notifications;
    try {
      // Optimistic clear
      setNotifications([]);
      setUnreadCount(0);
      setBadge(0);

      const issueIds = snapshot.filter(isIssueNotification).map(n => n.id);
      const plainIds = snapshot.filter(n => !isIssueNotification(n)).map(n => n.id);

      // Dismiss all issue rows via RPC (per-id; small N — UI limit 20)
      for (const id of issueIds) {
        const { error } = await (supabase as any).rpc('dismiss_notification', { p_id: id });
        if (error) throw error;
      }

      if (plainIds.length > 0) {
        const { error } = await (supabase as any)
          .from('notifications')
          .delete()
          .in('id', plainIds);
        if (error) throw error;
      }

      return true;
    } catch (error) {
      console.error('Error deleting all notifications:', error);
      fetchNotifications();
      return false;
    }
  };

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    deleteAllNotifications,
    refetch: fetchNotifications,
  };
};
