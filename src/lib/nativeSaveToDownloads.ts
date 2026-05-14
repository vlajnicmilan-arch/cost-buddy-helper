import { registerPlugin } from '@capacitor/core';

export interface SaveToDownloadsPlugin {
  saveBlob(options: {
    base64: string;
    fileName: string;
    mime: string;
  }): Promise<{ uri: string; displayName: string }>;
}

export const SaveToDownloads = registerPlugin<SaveToDownloadsPlugin>('SaveToDownloads');
