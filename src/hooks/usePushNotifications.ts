import { useEffect, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const isNative = Capacitor.isNativePlatform();

export const usePushNotifications = () => {
  const { user } = useAuth();
  const registeredRef = useRef(false);

  const register = useCallback(async () => {
    if (!isNative || !user || registeredRef.current) return false;

    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');

      const permResult = await PushNotifications.requestPermissions();
      if (permResult.receive !== 'granted') return false;

      await PushNotifications.register();

      // Listen for registration
      PushNotifications.addListener('registration', async (token) => {
        console.log('[Push] Token:', token.value);
        registeredRef.current = true;

        // Save token to DB
        await supabase.from('push_tokens').upsert(
          {
            user_id: user.id,
            token: token.value,
            platform: Capacitor.getPlatform(),
          },
          { onConflict: 'user_id,token' }
        );
      });

      PushNotifications.addListener('registrationError', (err) => {
        console.error('[Push] Registration error:', err);
      });

      // Handle received notifications
      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.log('[Push] Received:', notification);
      });

      // Handle tap on notification
      PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        console.log('[Push] Action:', action);
        // Could navigate based on action.notification.data
      });

      return true;
    } catch (e) {
      console.error('[Push] Init error:', e);
      return false;
    }
  }, [user]);

  const unregister = useCallback(async () => {
    if (!isNative || !user) return;
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      await PushNotifications.removeAllListeners();
      // Remove token from DB
      await supabase.from('push_tokens').delete().eq('user_id', user.id);
      registeredRef.current = false;
    } catch (e) {
      console.error('[Push] Unregister error:', e);
    }
  }, [user]);

  return { register, unregister, isNative };
};
