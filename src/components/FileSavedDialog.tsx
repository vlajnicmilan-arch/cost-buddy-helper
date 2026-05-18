import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Share2, X, FileText } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { openSavedFile } from '@/lib/nativeFileOpener';
import { showError } from '@/hooks/useStatusFeedback';

interface FileSavedDetail {
  uri: string;
  fileName: string;
  mime: string;
}

export const FILE_SAVED_EVENT = 'file-saved';

/**
 * Global dialog that pops up after a file is saved natively (Capacitor).
 * Listens for `file-saved` CustomEvent emitted by `exportFile` in
 * src/lib/fileExport.ts. Offers Open / Share / Close actions so the user
 * doesn't have to hunt for the file in the file manager.
 */
export const FileSavedDialog = () => {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<FileSavedDetail | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<FileSavedDetail>;
      if (ce?.detail?.uri) setDetail(ce.detail);
    };
    window.addEventListener(FILE_SAVED_EVENT, handler);
    return () => window.removeEventListener(FILE_SAVED_EVENT, handler);
  }, []);

  const close = () => setDetail(null);

  const handleOpen = async () => {
    if (!detail) return;
    const ok = await openSavedFile(detail.uri, detail.mime);
    if (ok) close();
  };

  const handleShare = async () => {
    if (!detail) return;
    try {
      const { Share } = await import('@capacitor/share');
      await Share.share({
        title: detail.fileName,
        files: [detail.uri],
        dialogTitle: t('fileExport.shareDialogTitle', 'Podijeli datoteku') as string,
      });
      close();
    } catch (e: any) {
      if (e?.message?.includes('cancel') || e?.message?.includes('abort')) {
        close();
        return;
      }
      console.error('Share error:', e);
      showError(t('fileExport.shareError', 'Dijeljenje nije uspjelo') as string);
    }
  };

  return (
    <Dialog open={!!detail} onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent showBackButton={false} className="z-[90] max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            <DialogTitle>{t('fileExport.savedDialog.title', 'Datoteka spremljena')}</DialogTitle>
          </div>
          <DialogDescription className="break-all">
            {t('fileExport.savedDialog.description', '{{fileName}} je u Downloads mapi.', {
              fileName: detail?.fileName ?? '',
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex flex-col gap-2 sm:flex-col">
          <Button onClick={handleOpen} className="w-full min-h-11">
            <ExternalLink className="w-4 h-4 mr-2" />
            {t('fileExport.savedDialog.open', 'Otvori')}
          </Button>
          <Button variant="outline" onClick={handleShare} className="w-full min-h-11">
            <Share2 className="w-4 h-4 mr-2" />
            {t('fileExport.savedDialog.share', 'Podijeli')}
          </Button>
          <Button variant="ghost" onClick={close} className="w-full min-h-11">
            <X className="w-4 h-4 mr-2" />
            {t('fileExport.savedDialog.close', 'Zatvori')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
