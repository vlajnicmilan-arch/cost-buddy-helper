import { useCallback, useEffect, useRef } from 'react';

const NOTIFICATION_SOUND_ENABLED_KEY = 'vm-notification-sound-enabled';
const PUSH_NOTIFICATIONS_ENABLED_KEY = 'vm-push-notifications-enabled';

export const getNotificationSoundEnabled = (): boolean => {
  const stored = localStorage.getItem(NOTIFICATION_SOUND_ENABLED_KEY);
  return stored === null ? true : stored === 'true';
};

export const setNotificationSoundEnabled = (enabled: boolean): void => {
  localStorage.setItem(NOTIFICATION_SOUND_ENABLED_KEY, String(enabled));
};

export const getPushNotificationsEnabled = (): boolean => {
  const stored = localStorage.getItem(PUSH_NOTIFICATIONS_ENABLED_KEY);
  // Default to true if not set
  return stored === null ? true : stored === 'true';
};

export const setPushNotificationsEnabled = (enabled: boolean): void => {
  localStorage.setItem(PUSH_NOTIFICATIONS_ENABLED_KEY, String(enabled));
};

export const requestNotificationPermission = async (): Promise<boolean> => {
  if (!('Notification' in window)) {
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
};

export const showBrowserNotification = async (title: string, body: string): Promise<void> => {
  if (!getPushNotificationsEnabled()) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const options: NotificationOptions = {
    body,
    icon: '/logo-192.png',
    badge: '/logo-192.png',
    tag: `vm-notification-${Date.now()}`,
    requireInteraction: false,
    silent: false,
  };

  // Try Service Worker first — required for system tray on mobile PWA/Capacitor
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, {
        ...options,
        vibrate: [200, 100, 200],
        data: { url: window.location.origin },
      });
      return;
    } catch (swError) {
      console.warn('SW notification failed, falling back:', swError);
    }
  }

  // Fallback to regular Notification API (desktop browsers)
  try {
    const notification = new Notification(title, options);
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
    setTimeout(() => notification.close(), 5000);
  } catch (error) {
    console.error('Notification error:', error);
  }
};

export const useNotificationSound = () => {
  const audioContextRef = useRef<AudioContext | null>(null);

  const playNotificationSound = useCallback(() => {
    if (!getNotificationSoundEnabled()) return;

    try {
      // Create audio context on demand (required for browsers)
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      const ctx = audioContextRef.current;
      
      // Resume context if suspended (browser autoplay policy)
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      // Create a pleasant notification sound
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      // Two-tone notification sound
      oscillator.frequency.setValueAtTime(880, ctx.currentTime); // A5
      oscillator.frequency.setValueAtTime(1100, ctx.currentTime + 0.1); // C#6

      oscillator.type = 'sine';

      // Fade in and out
      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
      gainNode.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.1);
      gainNode.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.15);
      gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.3);
    } catch (error) {
      console.error('Error playing notification sound:', error);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  return { playNotificationSound };
};
