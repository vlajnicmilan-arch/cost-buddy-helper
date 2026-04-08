import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';

const isNative = Capacitor.isNativePlatform();
const RECEIPT_DIR = 'receipts';

export const LocalFileCache = {
  /**
   * Save a base64 image locally on the device.
   * Returns the local file path or null on web.
   */
  async saveReceiptImage(base64Data: string, fileName?: string): Promise<string | null> {
    if (!isNative) return null;

    try {
      const name = fileName || `receipt_${Date.now()}.jpg`;
      const path = `${RECEIPT_DIR}/${name}`;

      // Strip data URI prefix if present
      const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');

      await Filesystem.writeFile({
        path,
        data: cleanBase64,
        directory: Directory.Data,
        recursive: true
      });

      return path;
    } catch (error) {
      console.error('Failed to save receipt image locally:', error);
      return null;
    }
  },

  /**
   * Read a locally cached receipt image as base64.
   */
  async readReceiptImage(path: string): Promise<string | null> {
    if (!isNative) return null;

    try {
      const result = await Filesystem.readFile({
        path,
        directory: Directory.Data
      });

      // result.data is base64 string
      return `data:image/jpeg;base64,${result.data}`;
    } catch (error) {
      console.error('Failed to read cached receipt image:', error);
      return null;
    }
  },

  /**
   * Delete a locally cached receipt image.
   */
  async deleteReceiptImage(path: string): Promise<void> {
    if (!isNative) return;

    try {
      await Filesystem.deleteFile({
        path,
        directory: Directory.Data
      });
    } catch (error) {
      console.error('Failed to delete cached receipt image:', error);
    }
  },

  /**
   * List all cached receipt images.
   */
  async listCachedReceipts(): Promise<string[]> {
    if (!isNative) return [];

    try {
      const result = await Filesystem.readdir({
        path: RECEIPT_DIR,
        directory: Directory.Data
      });

      return result.files.map(f => `${RECEIPT_DIR}/${f.name}`);
    } catch {
      // Directory may not exist yet
      return [];
    }
  },

  /**
   * Clean up old cached receipts (older than specified days).
   */
  async cleanOldCache(maxAgeDays = 30): Promise<void> {
    if (!isNative) return;

    try {
      const files = await LocalFileCache.listCachedReceipts();
      const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;

      for (const filePath of files) {
        try {
          const stat = await Filesystem.stat({
            path: filePath,
            directory: Directory.Data
          });

          const fileTime = stat.mtime ? new Date(stat.mtime).getTime() : 0;
          if (fileTime < cutoff) {
            await Filesystem.deleteFile({
              path: filePath,
              directory: Directory.Data
            });
          }
        } catch {
          // Skip files that can't be inspected
        }
      }
    } catch (error) {
      console.error('Failed to clean old cache:', error);
    }
  },

  /**
   * Delete ALL cached receipt images. Returns the count of deleted files.
   */
  async clearAllCachedReceipts(): Promise<number> {
    if (!isNative) {
      // Web: clear IndexedDB receipt keys
      let count = 0;
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key?.startsWith('receipt_img_')) {
          localStorage.removeItem(key);
          count++;
        }
      }
      return count;
    }

    try {
      const files = await LocalFileCache.listCachedReceipts();
      for (const filePath of files) {
        try {
          await Filesystem.deleteFile({
            path: filePath,
            directory: Directory.Data
          });
        } catch {
          // skip
        }
      }
      return files.length;
    } catch (error) {
      console.error('Failed to clear all cached receipts:', error);
      return 0;
    }
  },

  /**
   * Get the total number of cached receipt images.
   */
  async getCachedReceiptCount(): Promise<number> {
    if (!isNative) {
      let count = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('receipt_img_')) count++;
      }
      return count;
    }

    try {
      const files = await LocalFileCache.listCachedReceipts();
      return files.length;
    } catch {
      return 0;
    }
  }
};
