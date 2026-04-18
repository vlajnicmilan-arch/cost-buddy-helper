import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { supabase } from '@/integrations/supabase/client';

const isNative = Capacitor.isNativePlatform();
const PROJECT_DOCS_DIR = 'project-documents';
const BUCKET = 'project-documents';

export type StorageMode = 'local' | 'cloud';

export interface ProjectDocumentRow {
  id: string;
  project_id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  storage_mode: StorageMode;
  storage_path: string;
  ai_analysis: any | null;
  tags: string[];
  uploaded_by: string;
  created_at: string;
}

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // strip "data:<mime>;base64,"
      resolve(result.split(',')[1] || result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const fileToBlob = (file: File): Promise<Blob> => Promise.resolve(file);

// --- LOCAL STORAGE ---

export const saveLocal = async (
  projectId: string,
  file: File
): Promise<{ storage_path: string; size_bytes: number }> => {
  const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filename = `${Date.now()}_${sanitized}`;

  if (isNative) {
    const base64 = await fileToBase64(file);
    const path = `${PROJECT_DOCS_DIR}/${projectId}/${filename}`;
    await Filesystem.writeFile({
      path,
      data: base64,
      directory: Directory.Data,
      recursive: true,
    });
    return { storage_path: `local:${path}`, size_bytes: file.size };
  }

  // Web fallback: IndexedDB-like via blob URL stored in localStorage (small files)
  // For larger files use IndexedDB
  const blob = await fileToBlob(file);
  const key = `pd_${projectId}_${filename}`;
  const base64 = await fileToBase64(file);
  try {
    localStorage.setItem(key, JSON.stringify({ data: base64, mime: file.type, name: file.name }));
  } catch {
    // localStorage full → ignore (UI should warn)
    throw new Error('Local storage full. Use cloud upload.');
  }
  return { storage_path: `local:${key}`, size_bytes: file.size };
};

export const readLocal = async (storagePath: string, mimeType: string): Promise<string | null> => {
  if (!storagePath.startsWith('local:')) return null;
  const path = storagePath.replace(/^local:/, '');

  if (isNative) {
    try {
      const result = await Filesystem.readFile({ path, directory: Directory.Data });
      return `data:${mimeType};base64,${result.data}`;
    } catch (err) {
      console.error('readLocal native failed', err);
      return null;
    }
  }

  // Web
  try {
    const raw = localStorage.getItem(path);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return `data:${parsed.mime || mimeType};base64,${parsed.data}`;
  } catch {
    return null;
  }
};

export const deleteLocal = async (storagePath: string): Promise<void> => {
  if (!storagePath.startsWith('local:')) return;
  const path = storagePath.replace(/^local:/, '');

  if (isNative) {
    try {
      await Filesystem.deleteFile({ path, directory: Directory.Data });
    } catch (err) {
      console.warn('deleteLocal native failed', err);
    }
    return;
  }

  try {
    localStorage.removeItem(path);
  } catch {
    /* noop */
  }
};

// --- CLOUD STORAGE ---

export const saveCloud = async (
  projectId: string,
  file: File
): Promise<{ storage_path: string; size_bytes: number }> => {
  const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filename = `${Date.now()}_${sanitized}`;
  const path = `${projectId}/${filename}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type,
  });
  if (error) throw error;

  return { storage_path: path, size_bytes: file.size };
};

export const readCloud = async (storagePath: string): Promise<string | null> => {
  if (storagePath.startsWith('local:')) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 3600);
  if (error) {
    console.error('readCloud signed url failed', error);
    return null;
  }
  return data.signedUrl;
};

export const deleteCloud = async (storagePath: string): Promise<void> => {
  if (storagePath.startsWith('local:')) return;
  const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);
  if (error) console.warn('deleteCloud failed', error);
};

// --- UNIFIED API ---

export const saveDocument = async (
  projectId: string,
  file: File,
  mode: StorageMode
): Promise<{ storage_path: string; size_bytes: number; storage_mode: StorageMode }> => {
  const result = mode === 'cloud' ? await saveCloud(projectId, file) : await saveLocal(projectId, file);
  return { ...result, storage_mode: mode };
};

export const readDocument = async (doc: ProjectDocumentRow): Promise<string | null> => {
  return doc.storage_mode === 'cloud'
    ? await readCloud(doc.storage_path)
    : await readLocal(doc.storage_path, doc.mime_type);
};

export const deleteDocument = async (doc: ProjectDocumentRow): Promise<void> => {
  if (doc.storage_mode === 'cloud') await deleteCloud(doc.storage_path);
  else await deleteLocal(doc.storage_path);
};

/**
 * Returns base64 data (without data URI prefix) for AI analysis.
 * Works for both local and cloud documents.
 */
export const getDocumentBase64 = async (doc: ProjectDocumentRow): Promise<string | null> => {
  const dataUrl = await readDocument(doc);
  if (!dataUrl) return null;
  if (dataUrl.startsWith('data:')) {
    return dataUrl.split(',')[1];
  }
  // It's a signed URL → fetch it
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const r = reader.result as string;
        resolve(r.split(',')[1] || r);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.error('getDocumentBase64 fetch failed', err);
    return null;
  }
};
