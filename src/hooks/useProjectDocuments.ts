import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { saveDocument, deleteDocument, ProjectDocumentRow, StorageMode } from '@/lib/documentStorage';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';

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

  const uploadDocument = async (file: File, mode: StorageMode = 'local', tags: string[] = []) => {
    if (!projectId || !user) return null;
    try {
      const { storage_path, size_bytes, storage_mode } = await saveDocument(projectId, file, mode);
      const { data, error } = await (supabase
        .from('project_documents') as any)
        .insert({
          project_id: projectId,
          name: file.name,
          mime_type: file.type || 'application/octet-stream',
          size_bytes,
          storage_mode,
          storage_path,
          tags,
          uploaded_by: user.id,
        })
        .select()
        .single();
      if (error) throw error;
      showSuccess('Dokument dodan');
      await fetchDocuments();
      return data as ProjectDocumentRow;
    } catch (err: any) {
      console.error('uploadDocument failed', err);
      showError(err?.message || 'Greška pri uploadu');
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
      showSuccess('Dokument obrisan');
      await fetchDocuments();
    } catch (err: any) {
      console.error('removeDocument failed', err);
      showError(err?.message || 'Greška pri brisanju');
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
