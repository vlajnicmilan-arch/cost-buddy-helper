import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useProjectDocuments } from '@/hooks/useProjectDocuments';
import { readDocument, getDocumentBase64, ProjectDocumentRow, StorageMode } from '@/lib/documentStorage';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import {
  Upload, FileText, Image as ImageIcon, Trash2, Sparkles,
  Smartphone, Cloud, Eye, Loader2, FileType
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { EmptyState } from '@/components/EmptyState';

interface ProjectDocumentsTabProps {
  projectId: string;
}

export const ProjectDocumentsTab = ({ projectId }: ProjectDocumentsTabProps) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { documents, loading, uploadDocument, removeDocument, updateAnalysis } = useProjectDocuments(projectId);

  const [previewDoc, setPreviewDoc] = useState<ProjectDocumentRow | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [docToDelete, setDocToDelete] = useState<ProjectDocumentRow | null>(null);
  const [uploadingMode, setUploadingMode] = useState<StorageMode>('local');
  const [uploading, setUploading] = useState(false);

  const handleFile = async (mode: StorageMode) => {
    setUploadingMode(mode);
    fileInputRef.current?.click();
  };

  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    await uploadDocument(file, uploadingMode);
    setUploading(false);
  };

  const handlePreview = async (doc: ProjectDocumentRow) => {
    setPreviewDoc(doc);
    setPreviewSrc(null);
    const src = await readDocument(doc);
    setPreviewSrc(src);
  };

  const handleAnalyze = async (doc: ProjectDocumentRow) => {
    setAnalyzingId(doc.id);
    try {
      let base64: string | null = null;
      let url: string | undefined;

      if (doc.storage_mode === 'local') {
        base64 = await getDocumentBase64(doc);
        if (!base64) {
          showError(t('projects.documents.notReadable', 'Dokument nije čitljiv'));
          return;
        }
      } else {
        const { data } = await supabase.storage.from('project-documents').createSignedUrl(doc.storage_path, 600);
        url = data?.signedUrl;
        if (!url) {
          showError(t('projects.documents.notReadable', 'Dokument nije čitljiv'));
          return;
        }
      }

      const { data: result, error } = await supabase.functions.invoke('analyze-document', {
        body: { base64, url, mime_type: doc.mime_type },
      });
      if (error) throw error;
      if (result?.analysis) {
        await updateAnalysis(doc.id, result.analysis);
        showSuccess(t('projects.documents.analyzed', 'Analiza spremljena'));
      }
    } catch (err: any) {
      console.error(err);
      showError(err?.message || t('projects.documents.analyzeFailed', 'Analiza nije uspjela'));
    } finally {
      setAnalyzingId(null);
    }
  };

  const isImage = (mime: string) => mime.startsWith('image/');
  const isPdf = (mime: string) => mime === 'application/pdf';

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
          className="hidden"
          onChange={onFileChosen}
        />

        {/* Upload buttons */}
        <div className="grid grid-cols-2 gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="default"
                className="h-auto py-3 flex-col gap-1"
                onClick={() => handleFile('local')}
                disabled={uploading}
              >
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4" />
                  <span className="font-medium">{t('projects.documents.uploadLocal', 'Lokalno')}</span>
                </div>
                <span className="text-[10px] opacity-80">{t('projects.documents.uploadLocalHint', 'Samo na ovom uređaju')}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs max-w-[200px]">
                {t('projects.documents.tooltipLocal', 'Dokument se sprema na uređaj — ne zauzima prostor u oblaku, ne dijeli se s drugima.')}
              </p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                className="h-auto py-3 flex-col gap-1"
                onClick={() => handleFile('cloud')}
                disabled={uploading}
              >
                <div className="flex items-center gap-2">
                  <Cloud className="w-4 h-4" />
                  <span className="font-medium">{t('projects.documents.uploadCloud', 'U oblak')}</span>
                </div>
                <span className="text-[10px] opacity-80">{t('projects.documents.uploadCloudHint', 'Sinkronizacija + dijeljenje')}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs max-w-[200px]">
                {t('projects.documents.tooltipCloud', 'Dostupno svim članovima projekta na svim uređajima.')}
              </p>
            </TooltipContent>
          </Tooltip>
        </div>

        {uploading && (
          <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t('projects.documents.uploading', 'Učitavanje...')}
          </div>
        )}

        {/* Documents list */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : documents.length === 0 ? (
          <EmptyState
            variant="default"
            title={t('projects.documents.noDocuments', 'Nema dokumenata')}
            description={t('projects.documents.noDocumentsHint', 'Dodajte račune, ugovore, slike ili druge datoteke.')}
          />
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => {
              const Icon = isImage(doc.mime_type) ? ImageIcon : isPdf(doc.mime_type) ? FileText : FileType;
              return (
                <div key={doc.id} className="p-3 rounded-lg border bg-card">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium truncate">{doc.name}</p>
                        <Badge variant="secondary" className="h-5 text-[10px] gap-1">
                          {doc.storage_mode === 'local' ? (
                            <><Smartphone className="w-2.5 h-2.5" /> {t('projects.documents.modeLocal', 'Lokalno')}</>
                          ) : (
                            <><Cloud className="w-2.5 h-2.5" /> {t('projects.documents.modeCloud', 'Oblak')}</>
                          )}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatBytes(doc.size_bytes)} · {format(new Date(doc.created_at), 'd. MMM yyyy', { locale: hr })}
                      </p>
                      {doc.ai_analysis && (
                        <div className="mt-2 p-2 rounded bg-primary/5 border border-primary/20">
                          <p className="text-[10px] uppercase tracking-wide text-primary font-semibold mb-1 flex items-center gap-1">
                            <Sparkles className="w-3 h-3" /> {t('projects.documents.aiAnalysis', 'AI Analiza')}
                          </p>
                          {doc.ai_analysis.summary && <p className="text-xs">{doc.ai_analysis.summary}</p>}
                          <div className="text-[10px] text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                            {doc.ai_analysis.merchant && <span>📍 {doc.ai_analysis.merchant}</span>}
                            {doc.ai_analysis.amount != null && <span>💰 {doc.ai_analysis.amount} {doc.ai_analysis.currency || ''}</span>}
                            {doc.ai_analysis.date && <span>📅 {doc.ai_analysis.date}</span>}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 mt-2 justify-end">
                    <Button variant="ghost" size="sm" onClick={() => handlePreview(doc)}>
                      <Eye className="w-3.5 h-3.5 mr-1" /> {t('common.view', 'Pregled')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleAnalyze(doc)}
                      disabled={analyzingId === doc.id}
                    >
                      {analyzingId === doc.id ? (
                        <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5 mr-1" />
                      )}
                      {t('projects.documents.analyze', 'AI analiza')}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDocToDelete(doc)}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Preview dialog */}
        <Dialog open={!!previewDoc} onOpenChange={(o) => { if (!o) { setPreviewDoc(null); setPreviewSrc(null); } }}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-auto">
            <DialogHeader>
              <DialogTitle className="text-base truncate">{previewDoc?.name}</DialogTitle>
            </DialogHeader>
            {!previewSrc ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : previewDoc && isImage(previewDoc.mime_type) ? (
              <img src={previewSrc} alt={previewDoc.name} className="max-w-full h-auto rounded" />
            ) : previewDoc && isPdf(previewDoc.mime_type) ? (
              <iframe src={previewSrc} className="w-full h-[70vh] rounded" title={previewDoc.name} />
            ) : (
              <div className="text-center py-8">
                <a href={previewSrc} download={previewDoc?.name} className="text-primary underline">
                  {t('projects.documents.download', 'Preuzmi datoteku')}
                </a>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Delete confirm */}
        <AlertDialog open={!!docToDelete} onOpenChange={(o) => !o && setDocToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('projects.documents.deleteTitle', 'Obrisati dokument?')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('projects.documents.deleteDescription', 'Ova radnja je nepovratna.')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel', 'Odustani')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  if (docToDelete) {
                    await removeDocument(docToDelete);
                    setDocToDelete(null);
                  }
                }}
                className="bg-destructive text-destructive-foreground"
              >
                {t('common.delete', 'Obriši')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
};
