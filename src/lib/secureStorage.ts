/**
 * Secure Storage helper — tries capacitor-secure-storage-plugin on native,
 * always falls back to localStorage if anything fails.
 * Returns diagnostic info for debugging PIN save issues.
 */
import { Capacitor } from '@capacitor/core';

const isNative = Capacitor.isNativePlatform();

export interface StorageResult {
  success: boolean;
  backend: 'native' | 'localStorage';
  error?: string;
}

// Last operation result for diagnostics
let lastResult: StorageResult = { success: true, backend: 'localStorage' };

export function getLastStorageResult(): StorageResult {
  return { ...lastResult };
}

async function nativeSet(key: string, value: string): Promise<StorageResult> {
  try {
    const { SecureStoragePlugin } = await import('capacitor-secure-storage-plugin');
    await SecureStoragePlugin.set({ key, value });
    return { success: true, backend: 'native' };
  } catch (e: any) {
    const msg = e?.message || String(e);
    console.warn('[SecureStorage] native set failed:', msg);
    return { success: false, backend: 'native', error: msg };
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
  async set(key: string, value: string): Promise<StorageResult> {
    if (isNative) {
      const result = await nativeSet(key, value);
      if (!result.success) {
        // Fallback to localStorage on native if plugin fails
        try {
          localStorage.setItem(key, value);
          lastResult = { success: true, backend: 'localStorage', error: `native failed: ${result.error}` };
        } catch (e: any) {
          lastResult = { success: false, backend: 'localStorage', error: `both failed: native(${result.error}), ls(${e?.message})` };
        }
      } else {
        lastResult = result;
      }
    } else {
      try {
        localStorage.setItem(key, value);
        lastResult = { success: true, backend: 'localStorage' };
      } catch (e: any) {
        lastResult = { success: false, backend: 'localStorage', error: e?.message || String(e) };
      }
    }
    return { ...lastResult };
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
