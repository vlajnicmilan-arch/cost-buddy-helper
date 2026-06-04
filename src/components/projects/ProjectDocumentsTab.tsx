import { useState, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useProjectDocuments } from '@/hooks/useProjectDocuments';
import { readDocument, getDocumentBase64, dataUrlToFile, ProjectDocumentRow, StorageMode } from '@/lib/documentStorage';
import { useNativeCamera } from '@/hooks/useNativeCamera';
import { useLocation } from '@/hooks/useLocation';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import {
  Upload, FileText, Image as ImageIcon, Trash2, Sparkles,
  Smartphone, Cloud, Eye, Loader2, FileType, Camera as CameraIcon, ImagePlus, MapPin, CalendarDays
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/EmptyState';
import { useProjectWriteGuard } from '@/hooks/useProjectWriteGuard';

interface ProjectDocumentsTabProps {
  projectId: string;
  isReadOnly?: boolean;
}

type AnyDoc = ProjectDocumentRow & { document_kind?: string; location_coords?: string | null; location_name?: string | null; captured_at?: string | null };

export const ProjectDocumentsTab = ({ projectId, isReadOnly = false }: ProjectDocumentsTabProps) => {
  const { t } = useTranslation();
  const { guard, blockProps } = useProjectWriteGuard({ isReadOnly });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { documents, loading, uploadDocument, removeDocument, updateAnalysis } = useProjectDocuments(projectId);
  const { takePhoto, pickFromGallery, cameraInputRef, galleryInputRef } = useNativeCamera();
  const { getCurrentLocation } = useLocation();

  const [activeTab, setActiveTab] = useState<'documents' | 'photos'>('documents');
  const [previewDoc, setPreviewDoc] = useState<AnyDoc | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [docToDelete, setDocToDelete] = useState<AnyDoc | null>(null);
  const [uploadingMode, setUploadingMode] = useState<StorageMode>('local');
  const [uploading, setUploading] = useState(false);

  // Split: photos vs documents
  const photoDocs = useMemo(
    () => (documents as AnyDoc[]).filter(d => d.document_kind === 'progress_photo'),
    [documents]
  );
  const otherDocs = useMemo(
    () => (documents as AnyDoc[]).filter(d => d.document_kind !== 'progress_photo'),
    [documents]
  );

  const triggerFilePicker = (mode: StorageMode) => {
    if (!guard()) return;
    setUploadingMode(mode);
    fileInputRef.current?.click();
  };

  const handleCamera = async (mode: StorageMode) => {
    if (!guard()) return;
    try {
      const dataUrl = await takePhoto();
      if (!dataUrl) return;
      const file = dataUrlToFile(dataUrl, `photo_${Date.now()}.jpg`);
      setUploading(true);
      await uploadDocument(file, { mode, documentKind: 'document' });
    } catch (err: any) {
      showError(err?.message || t('projects.documents.cameraError', 'Greška kamere'));
    } finally {
      setUploading(false);
    }
  };

  const handleGallery = async (mode: StorageMode) => {
    if (!guard()) return;
    try {
      const dataUrl = await pickFromGallery();
      if (!dataUrl) return;
      const file = dataUrlToFile(dataUrl, `image_${Date.now()}.jpg`);
      setUploading(true);
      await uploadDocument(file, { mode, documentKind: 'document' });
    } catch (err: any) {
      showError(err?.message || t('projects.documents.galleryError', 'Greška galerije'));
    } finally {
      setUploading(false);
    }
  };

  // Foto dnevnik: with GPS location
  const handleProgressPhoto = async (source: 'camera' | 'gallery') => {
    if (!guard()) return;
    try {
      const dataUrl = source === 'camera' ? await takePhoto() : await pickFromGallery();
      if (!dataUrl) return;
      setUploading(true);
      const file = dataUrlToFile(dataUrl, `napredak_${Date.now()}.jpg`);
      const loc = await getCurrentLocation().catch(() => null);
      await uploadDocument(file, {
        mode: 'local',
        documentKind: 'progress_photo',
        capturedAt: new Date().toISOString(),
        locationCoords: loc?.coords || null,
        locationName: loc?.name || null,
      });
    } catch (err: any) {
      showError(err?.message || t('projects.documents.cameraError', 'Greška kamere'));
    } finally {
      setUploading(false);
    }
  };

  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!guard()) return;
    setUploading(true);
    await uploadDocument(file, { mode: uploadingMode, documentKind: 'document' });
    setUploading(false);
  };

  const handlePreview = async (doc: AnyDoc) => {
    setPreviewDoc(doc);
    setPreviewSrc(null);
    const src = await readDocument(doc);
    setPreviewSrc(src);
  };

  const handleAnalyze = async (doc: AnyDoc) => {
    if (!guard()) return;
    setAnalyzingId(doc.id);
    try {
      let base64: string | null = null;
      let url: string | undefined;

      if (doc.storage_mode === 'local') {
        base64 = await getDocumentBase64(doc);
        if (!base64) { showError(t('projects.documents.notReadable', 'Dokument nije čitljiv')); return; }
      } else {
        const { data } = await supabase.storage.from('project-documents').createSignedUrl(doc.storage_path, 600);
        url = data?.signedUrl;
        if (!url) { showError(t('projects.documents.notReadable', 'Dokument nije čitljiv')); return; }
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

  // Reusable list item for documents
  const DocumentItem = ({ doc }: { doc: AnyDoc }) => {
    const Icon = isImage(doc.mime_type) ? ImageIcon : isPdf(doc.mime_type) ? FileText : FileType;
    return (
      <div className="p-3 rounded-lg border bg-card">
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
              {doc.document_kind === 'receipt' && (
                <Badge variant="outline" className="h-5 text-[10px]">{t('projects.documents.kindReceipt', 'Račun')}</Badge>
              )}
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
          <Button variant="ghost" size="sm" onClick={() => handleAnalyze(doc)} disabled={analyzingId === doc.id || isReadOnly} title={isReadOnly ? t('projects.access.readOnlyBlockedToast') : undefined}>
            {analyzingId === doc.id ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
            {t('projects.documents.analyze', 'AI analiza')}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { if (guard()) setDocToDelete(doc); }} disabled={isReadOnly} title={isReadOnly ? t('projects.access.readOnlyBlockedToast') : undefined}>
            <Trash2 className="w-3.5 h-3.5 text-destructive" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <input ref={fileInputRef} type="file" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx" className="hidden" onChange={onFileChosen} />
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" />
        <input ref={galleryInputRef} type="file" accept="image/*" className="hidden" />

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="documents" className="gap-1.5">
              <FileText className="w-4 h-4" />
              {t('projects.documents.tabDocuments', 'Dokumenti')}
              {otherDocs.length > 0 && <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">{otherDocs.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="photos" className="gap-1.5">
              <ImageIcon className="w-4 h-4" />
              {t('projects.documents.tabPhotos', 'Foto dnevnik')}
              {photoDocs.length > 0 && <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">{photoDocs.length}</Badge>}
            </TabsTrigger>
          </TabsList>

          {/* DOCUMENTS TAB */}
          <TabsContent value="documents" className="space-y-4 mt-4">
            <div className="grid grid-cols-3 gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="default" className="h-auto py-3 flex-col gap-1" disabled={uploading || isReadOnly} title={isReadOnly ? t('projects.access.readOnlyBlockedToast') : undefined}>
                    <CameraIcon className="w-5 h-5" />
                    <span className="text-xs font-medium">{t('projects.documents.takePhoto', 'Slikaj')}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="z-[70]">
                  <DropdownMenuLabel className="text-xs">{t('projects.documents.saveTo', 'Spremi u')}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleCamera('local')}><Smartphone className="w-4 h-4 mr-2" /> {t('projects.documents.modeLocal', 'Lokalno')}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleCamera('cloud')}><Cloud className="w-4 h-4 mr-2" /> {t('projects.documents.modeCloud', 'Oblak')}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="h-auto py-3 flex-col gap-1" disabled={uploading || isReadOnly} title={isReadOnly ? t('projects.access.readOnlyBlockedToast') : undefined}>
                    <ImagePlus className="w-5 h-5" />
                    <span className="text-xs font-medium">{t('projects.documents.gallery', 'Galerija')}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="z-[70]">
                  <DropdownMenuLabel className="text-xs">{t('projects.documents.saveTo', 'Spremi u')}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleGallery('local')}><Smartphone className="w-4 h-4 mr-2" /> {t('projects.documents.modeLocal', 'Lokalno')}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleGallery('cloud')}><Cloud className="w-4 h-4 mr-2" /> {t('projects.documents.modeCloud', 'Oblak')}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="h-auto py-3 flex-col gap-1" disabled={uploading || isReadOnly} title={isReadOnly ? t('projects.access.readOnlyBlockedToast') : undefined}>
                    <Upload className="w-5 h-5" />
                    <span className="text-xs font-medium">{t('projects.documents.file', 'Datoteka')}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="z-[70]">
                  <DropdownMenuLabel className="text-xs">{t('projects.documents.saveTo', 'Spremi u')}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => triggerFilePicker('local')}><Smartphone className="w-4 h-4 mr-2" /> {t('projects.documents.modeLocal', 'Lokalno')}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => triggerFilePicker('cloud')}><Cloud className="w-4 h-4 mr-2" /> {t('projects.documents.modeCloud', 'Oblak')}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <p className="text-[11px] text-muted-foreground text-center">
              {t('projects.documents.modeHint', 'Lokalno = samo na ovom uređaju · Oblak = dijeljeno sa svim članovima')}
            </p>

            {uploading && (
              <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('projects.documents.uploading', 'Učitavanje...')}
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : otherDocs.length === 0 ? (
              <EmptyState variant="generic"
                title={t('projects.documents.noDocuments', 'Nema dokumenata')}
                description={t('projects.documents.noDocumentsHint', 'Dodajte račune, ugovore, slike ili druge datoteke.')} />
            ) : (
              <div className="space-y-2">{otherDocs.map(doc => <DocumentItem key={doc.id} doc={doc} />)}</div>
            )}
          </TabsContent>

          {/* PHOTOS TAB — Foto dnevnik */}
          <TabsContent value="photos" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-2">
              <Button variant="default" className="h-auto py-3 flex-col gap-1" onClick={() => handleProgressPhoto('camera')} disabled={uploading || isReadOnly} title={isReadOnly ? t('projects.access.readOnlyBlockedToast') : undefined}>
                <CameraIcon className="w-5 h-5" />
                <span className="text-xs font-medium">{t('projects.documents.captureProgress', 'Slikaj napredak')}</span>
              </Button>
              <Button variant="outline" className="h-auto py-3 flex-col gap-1" onClick={() => handleProgressPhoto('gallery')} disabled={uploading || isReadOnly} title={isReadOnly ? t('projects.access.readOnlyBlockedToast') : undefined}>
                <ImagePlus className="w-5 h-5" />
                <span className="text-xs font-medium">{t('projects.documents.fromGallery', 'Iz galerije')}</span>
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground text-center flex items-center justify-center gap-1">
              <MapPin className="w-3 h-3" />
              {t('projects.documents.photosHint', 'Fotografije se spremaju lokalno s GPS lokacijom i datumom snimanja.')}
            </p>

            {uploading && (
              <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('projects.documents.uploading', 'Učitavanje...')}
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : photoDocs.length === 0 ? (
              <EmptyState variant="generic"
                title={t('projects.documents.noPhotos', 'Nema fotografija napretka')}
                description={t('projects.documents.noPhotosHint', 'Slikajte stanje radova kako bi vodili kronološki dnevnik.')} />
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {photoDocs.map((doc) => (
                  <button
                    key={doc.id}
                    onClick={() => handlePreview(doc)}
                    className="group relative aspect-square rounded-lg border bg-card overflow-hidden hover:border-primary/40 transition-colors"
                  >
                    <PhotoThumb doc={doc} />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 text-left">
                      <div className="flex items-center gap-1 text-[10px] text-white/90 font-medium">
                        <CalendarDays className="w-2.5 h-2.5" />
                        {format(new Date(doc.captured_at || doc.created_at), 'd. MMM', { locale: hr })}
                      </div>
                      {doc.location_name && (
                        <div className="flex items-center gap-1 text-[10px] text-white/80 truncate">
                          <MapPin className="w-2.5 h-2.5 shrink-0" />
                          <span className="truncate">{doc.location_name}</span>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setDocToDelete(doc); }}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </button>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Preview dialog */}
        <Dialog open={!!previewDoc} onOpenChange={(o) => { if (!o) { setPreviewDoc(null); setPreviewSrc(null); } }}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-auto">
            <DialogHeader>
              <DialogTitle className="text-base truncate">{previewDoc?.name}</DialogTitle>
            </DialogHeader>
            {!previewSrc ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
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
            {previewDoc?.location_name && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-2">
                <MapPin className="w-3 h-3" /> {previewDoc.location_name}
              </p>
            )}
          </DialogContent>
        </Dialog>

        {/* Delete confirm */}
        <AlertDialog open={!!docToDelete} onOpenChange={(o) => !o && setDocToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('projects.documents.deleteTitle', 'Obrisati?')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('projects.documents.deleteDescription', 'Ova radnja je nepovratna.')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel', 'Odustani')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => { if (docToDelete) { await removeDocument(docToDelete); setDocToDelete(null); } }}
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

// Lazy thumb that reads local/cloud file
const PhotoThumb = ({ doc }: { doc: AnyDoc }) => {
  const [src, setSrc] = useState<string | null>(null);
  useMemo(() => { readDocument(doc).then(setSrc); }, [doc.id]);
  if (!src) return <div className="w-full h-full bg-muted animate-pulse" />;
  return <img src={src} alt={doc.name} className="w-full h-full object-cover" />;
};
