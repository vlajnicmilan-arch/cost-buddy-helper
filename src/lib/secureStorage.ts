/**
 * Secure Storage helper — tries capacitor-secure-storage-plugin on native,
 * always falls back to localStorage if anything fails.
 */
import { Capacitor } from '@capacitor/core';

const isNative = Capacitor.isNativePlatform();

async function nativeSet(key: string, value: string): Promise<boolean> {
  try {
    const { SecureStoragePlugin } = await import('capacitor-secure-storage-plugin');
    await SecureStoragePlugin.set({ key, value });
    return true;
  } catch (e) {
    console.warn('SecureStorage native set failed, using localStorage:', e);
    return false;
  }
}

async function nativeGet(key: string): Promise<string | null> {
  try {
    const { SecureStoragePlugin } = await import('capacitor-secure-storage-plugin');
    const { value } = await SecureStoragePlugin.get({ key });
    return value;
  } catch {
    return null;
  }
}

async function nativeRemove(key: string): Promise<void> {
  try {
    const { SecureStoragePlugin } = await import('capacitor-secure-storage-plugin');
    await SecureStoragePlugin.remove({ key });
  } catch {
    // ignore
  }
}

export const SecureStorage = {
  async set(key: string, value: string): Promise<void> {
    if (isNative) {
      const ok = await nativeSet(key, value);
      if (!ok) {
        // Fallback to localStorage on native if plugin fails
        localStorage.setItem(key, value);
      }
    } else {
      localStorage.setItem(key, value);
    }
  },

  async get(key: string): Promise<string | null> {
    if (isNative) {
      const val = await nativeGet(key);
      if (val !== null) return val;
      // Fallback: check localStorage too (in case it was saved there)
      return localStorage.getItem(key);
    }
    return localStorage.getItem(key);
  },

  async remove(key: string): Promise<void> {
    if (isNative) {
      await nativeRemove(key);
    }
    // Always clean localStorage too
    localStorage.removeItem(key);
  },
};
