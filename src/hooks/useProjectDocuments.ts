import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { saveDocument, deleteDocument, ProjectDocumentRow, StorageMode } from '@/lib/documentStorage';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { tr, friendlyError } from '@/lib/errorMessages';

export type DocumentKind = 'document' | 'progress_photo' | 'receipt';

export interface UploadOptions {
  mode?: StorageMode;
  tags?: string[];
  documentKind?: DocumentKind;
  locationCoords?: string | null;
  locationName?: string | null;
  capturedAt?: string | null;
}

export const useProjectDocuments = (projectId: string | null) => {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<ProjectDocumentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDocuments = useCallback(async () => {
    if (!projectId) {
      setDocuments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await (supabase
        .from('project_documents') as any)
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setDocuments((data || []) as ProjectDocumentRow[]);
    } catch (err) {
      console.error('Error fetching project documents:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchDocuments(); }, [fetchDocuments]);

  const uploadDocument = async (file: File, modeOrOptions: StorageMode | UploadOptions = 'local', tagsArg: string[] = []) => {
    if (!projectId || !user) return null;

    const opts: UploadOptions = typeof modeOrOptions === 'string'
      ? { mode: modeOrOptions, tags: tagsArg }
      : modeOrOptions;

    const mode: StorageMode = opts.mode || 'local';
    const tags: string[] = opts.tags || [];
    const documentKind: DocumentKind = opts.documentKind || 'document';

    try {
      const { storage_path, size_bytes, storage_mode } = await saveDocument(projectId, file, mode);
      const insertPayload: any = {
        project_id: projectId,
        name: file.name,
        mime_type: file.type || 'application/octet-stream',
        size_bytes,
        storage_mode,
        storage_path,
        tags,
        document_kind: documentKind,
        uploaded_by: user.id,
      };
      if (opts.locationCoords) insertPayload.location_coords = opts.locationCoords;
      if (opts.locationName) insertPayload.location_name = opts.locationName;
      if (opts.capturedAt) insertPayload.captured_at = opts.capturedAt;

      const { data, error } = await (supabase
        .from('project_documents') as any)
        .insert(insertPayload)
        .select()
        .single();
      if (error) throw error;
      showSuccess(documentKind === 'progress_photo' ? 'Fotografija dodana' : 'Dokument dodan');
      await fetchDocuments();
      return data as ProjectDocumentRow;
    } catch (err: any) {
      console.error('uploadDocument failed', err);
      showError(friendlyError(err, "errors.project.uploadDoc"));
      return null;
    }
  };

  const removeDocument = async (doc: ProjectDocumentRow) => {
    try {
      await deleteDocument(doc);
      const { error } = await (supabase
        .from('project_documents') as any)
        .delete()
        .eq('id', doc.id);
      if (error) throw error;
      showSuccess(t('toasts.deleted'));
      await fetchDocuments();
    } catch (err: any) {
      console.error('removeDocument failed', err);
      showError(friendlyError(err, "errors.delete.generic"));
    }
  };

  const updateAnalysis = async (docId: string, analysis: any) => {
    try {
      const { error } = await (supabase
        .from('project_documents') as any)
        .update({ ai_analysis: analysis })
        .eq('id', docId);
      if (error) throw error;
      await fetchDocuments();
    } catch (err) {
      console.error('updateAnalysis failed', err);
    }
  };

  return {
    documents,
    loading,
    uploadDocument,
    removeDocument,
    updateAnalysis,
    refetch: fetchDocuments,
  };
};
