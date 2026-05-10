// Native push registration helper (Capacitor + FCM)
// Used outside React context (e.g. from SettingsDialog handlers).
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';

let listenersAttached = false;

/**
 * Map push notification `data` payload to an in-app route.
 * Each notify-* edge function sets `data.type` (and relevant ids) so the
 * device can deep-link the user to the correct screen on tap.
 */
function resolveRouteFromPushData(data: Record<string, string | undefined>): string | null {
  const type = data.type;
  if (!type) return null;

  switch (type) {
    case 'family_message':
      return data.group_id ? `/family?group=${data.group_id}` : '/family';
    case 'family_invitation':
      return '/family';
    case 'project_transaction':
    case 'project_note_added':
      return data.project_id ? `/projects?id=${data.project_id}` : '/projects';
    case 'project_invitation':
      return data.project_id ? `/projects?id=${data.project_id}` : '/projects';
    case 'project_member_joined':
      return data.project_id ? `/projects?id=${data.project_id}` : '/projects';
    case 'milestone_deadline':
    case 'milestone_budget':
      return data.project_id ? `/projects?id=${data.project_id}` : '/projects';
    case 'pending_transaction':
    case 'pending_auto_rejected':
      return '/';
    case 'payment_source_transaction':
      return data.payment_source_id ? `/wallet?source=${data.payment_source_id}` : '/wallet';
    case 'payment_source_invitation':
      return '/wallet';
    case 'budget_alert':
    case 'budget_invitation':
      return data.budget_id ? `/budgets?id=${data.budget_id}` : '/budgets';
    case 'reminder':
    case 'calendar_event':
      return '/calendar';
    case 'trial_reminder':
      return '/paywall';
    case 'broadcast':
      return data.url ?? '/';
    default:
      return null;
  }
}

export async function registerNativePush(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;

  // Granular boot-trace diagnostics. These prove exactly how far the native
  // FCM init gets on a given device (some Android builds crash inside
  // PushNotifications.register and we never see a JS error).
  const diag = async (event: string, details: Record<string, unknown> = {}) => {
    try {
      const { logDiagnostic } = await import('@/lib/diagnosticLogger');
      logDiagnostic(event, details);
    } catch { /* best-effort */ }
  };

  try {
    await diag('push_register_start');
    const { PushNotifications } = await import('@capacitor/push-notifications');

    // Permission
    let perm = await PushNotifications.checkPermissions();
    await diag('push_perm_checked', { receive: perm.receive });
    if (perm.receive !== 'granted') {
      perm = await PushNotifications.requestPermissions();
      await diag('push_perm_requested', { receive: perm.receive });
      if (perm.receive !== 'granted') return false;
    }

    // Attach listeners once
    if (!listenersAttached) {
      listenersAttached = true;

      PushNotifications.addListener('registration', async (token) => {
        console.log('[Push] FCM token:', token.value);
        await diag('push_register_token_received', {
          token_prefix: typeof token?.value === 'string' ? token.value.slice(0, 12) : null,
        });
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
        void diag('push_register_error', {
          message: (err as any)?.error ?? String(err),
        });
      });

      PushNotifications.addListener('pushNotificationReceived', (n) => {
        console.log('[Push] Received in foreground:', n);
      });

      PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
        console.log('[Push] Tapped:', a);
        try {
          const data = (a?.notification?.data ?? {}) as Record<string, string | undefined>;
          const route = resolveRouteFromPushData(data);
          if (route && typeof window !== 'undefined') {
            // Use hash-safe navigation. window.location.assign forces a full
            // route change which works regardless of where React Router is.
            // Small timeout lets the OS finish bringing the app to foreground.
            setTimeout(() => { window.location.assign(route); }, 80);
          }
        } catch (e) {
          console.error('[Push] tap navigation error:', e);
        }
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
 * Auto-register on app start.
 *
 * Strategy: opt-out instead of opt-in.
 * - If user has explicitly disabled push (`vm-push-notifications-enabled === 'false'`), do NOT register.
 * - Otherwise (flag missing OR explicitly true), check the OS-level permission.
 *   - If granted: register immediately (this is what was missing — many users never set the flag).
 *   - If not yet asked / denied: do nothing here. SettingsDialog still owns the prompt UX.
 *
 * This guarantees that any user who has previously granted push permission on their device
 * will have a fresh FCM token in the database, even if the localStorage flag was never set
 * (e.g. after app reinstall, cleared storage, or first run after this fix).
 *
 * Also writes a diagnostic trail so we can prove from server-side whether registration
 * was attempted on a given device.
 */
export async function autoRegisterIfEnabled(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const explicitlyDisabled =
      localStorage.getItem('vm-push-notifications-enabled') === 'false';
    if (explicitlyDisabled) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Best-effort diagnostic — proves the device tried to register.
    const writeDiag = async (event: string, details: Record<string, unknown>) => {
      try {
        await supabase.from('app_diagnostics_logs').insert([{
          session_id: 'native-push-autoregister',
          event,
          route: typeof window !== 'undefined' ? window.location.pathname : null,
          user_id: user.id,
          device_info: {
            platform: Capacitor.getPlatform(),
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
          },
          details: details as any,
        }]);
      } catch { /* best-effort */ }
    };

    const { PushNotifications } = await import('@capacitor/push-notifications');
    const perm = await PushNotifications.checkPermissions();

    await writeDiag('push_autoregister_check', {
      permission: perm.receive,
      flag: localStorage.getItem('vm-push-notifications-enabled'),
    });

    if (perm.receive !== 'granted') {
      // Don't aggressively prompt here — SettingsDialog handles the explicit ask.
      return;
    }

    // Permission already granted: ensure token is fresh in DB.
    const ok = await registerNativePush();
    await writeDiag('push_autoregister_result', { ok });

    // Sync the flag so user sees the toggle as ON in Settings.
    if (ok) {
      try { localStorage.setItem('vm-push-notifications-enabled', 'true'); } catch { /* ignore */ }
    }
  } catch (e) {
    console.error('[Push] auto-register error:', e);
  }
}
