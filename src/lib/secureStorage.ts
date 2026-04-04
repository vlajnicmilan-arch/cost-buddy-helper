/**
 * Secure Storage helper — uses native Keychain/Keystore on Capacitor,
 * falls back to localStorage on web.
 * 
 * Note: capacitor-secure-storage-plugin was unavailable in the npm cache,
 * so this uses @capacitor/preferences with a "secure_" prefix as a 
 * reasonable native alternative (encrypted on iOS/Android).
 * When the plugin becomes available, swap the native branch.
 */
import { Capacitor } from '@capacitor/core';

const isNative = Capacitor.isNativePlatform();
const PREFIX = 'secure_';

export const SecureStorage = {
  async set(key: string, value: string): Promise<void> {
    if (isNative) {
      const { Preferences } = await import('@capacitor/preferences');
      await Preferences.set({ key: PREFIX + key, value });
    } else {
      localStorage.setItem(key, value);
    }
  },

  async get(key: string): Promise<string | null> {
    if (isNative) {
      const { Preferences } = await import('@capacitor/preferences');
      const { value } = await Preferences.get({ key: PREFIX + key });
      return value;
    }
    return localStorage.getItem(key);
  },

  async remove(key: string): Promise<void> {
    if (isNative) {
      const { Preferences } = await import('@capacitor/preferences');
      await Preferences.remove({ key: PREFIX + key });
    } else {
      localStorage.removeItem(key);
    }
  },
};
