// Native push registration helper (Capacitor + FCM)
// Used outside React context (e.g. from SettingsDialog handlers).
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';

let listenersAttached = false;

export async function registerNativePush(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    // Permission
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive !== 'granted') {
      perm = await PushNotifications.requestPermissions();
      if (perm.receive !== 'granted') return false;
    }

    // Attach listeners once
    if (!listenersAttached) {
      listenersAttached = true;

      PushNotifications.addListener('registration', async (token) => {
        console.log('[Push] FCM token:', token.value);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
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

      PushNotifications.addListener('pushNotificationReceived', (n) => {
        console.log('[Push] Received in foreground:', n);
      });

      PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
        console.log('[Push] Tapped:', a);
      });
    }

    await PushNotifications.register();
    return true;
  } catch (e) {
    console.error('[Push] register error:', e);
    return false;
  }
}

export async function unregisterNativePush(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    await PushNotifications.removeAllListeners();
    listenersAttached = false;
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('push_tokens').delete().eq('user_id', user.id);
    }
  } catch (e) {
    console.error('[Push] unregister error:', e);
  }
}

/**
 * Auto-register on app start if user has previously enabled push.
 * Called from App.tsx after auth is ready.
 */
export async function autoRegisterIfEnabled(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const enabled = localStorage.getItem('vm-push-notifications-enabled') === 'true';
    if (!enabled) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await registerNativePush();
  } catch (e) {
    console.error('[Push] auto-register error:', e);
  }
}
