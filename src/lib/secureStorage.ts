/**
 * Secure Storage helper — uses capacitor-secure-storage-plugin (Keychain/Keystore)
 * on native platforms, falls back to localStorage on web.
 */
import { Capacitor } from '@capacitor/core';

const isNative = Capacitor.isNativePlatform();

export const SecureStorage = {
  async set(key: string, value: string): Promise<void> {
    if (isNative) {
      const { SecureStoragePlugin } = await import('capacitor-secure-storage-plugin');
      await SecureStoragePlugin.set({ key, value });
    } else {
      localStorage.setItem(key, value);
    }
  },

  async get(key: string): Promise<string | null> {
    if (isNative) {
      try {
        const { SecureStoragePlugin } = await import('capacitor-secure-storage-plugin');
        const { value } = await SecureStoragePlugin.get({ key });
        return value;
      } catch {
        // Key doesn't exist in secure storage
        return null;
      }
    }
    return localStorage.getItem(key);
  },

  async remove(key: string): Promise<void> {
    if (isNative) {
      try {
        const { SecureStoragePlugin } = await import('capacitor-secure-storage-plugin');
        await SecureStoragePlugin.remove({ key });
      } catch {
        // Key didn't exist, ignore
      }
    } else {
      localStorage.removeItem(key);
    }
  },
};
