import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Download, ImageIcon } from 'lucide-react';
import type { DecisionAttachment } from '@/hooks/useProjectDecisions';
import { cn } from '@/lib/utils';

interface Props {
  attachments: DecisionAttachment[];
  getUrl: (att: DecisionAttachment) => Promise<string | null>;
}

const isImage = (mime: string) => mime.startsWith('image/');

const humanSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * Prikaz priloga uz jedan korak odluke (Faza 3).
 * Slike → thumbnail (klik otvara u novom tabu), dokumenti → kartica.
 * Signed URL-ovi se učitavaju lazy na mount.
 */
export function DecisionStepAttachments({ attachments, getUrl }: Props) {
  const { t } = useTranslation();
  const [urls, setUrls] = useState<Map<string, string | null>>(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const results = await Promise.all(attachments.map(async (a) => [a.id, await getUrl(a)] as const));
      if (cancelled) return;
      const map = new Map<string, string | null>();
      results.forEach(([id, url]) => map.set(id, url));
      setUrls(map);
    })();
    return () => { cancelled = true; };
  }, [attachments, getUrl]);

  if (attachments.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {attachments.map((att) => {
        const url = urls.get(att.id) ?? null;
        if (isImage(att.mime_type)) {
          return (
            <a
              key={att.id}
              href={url ?? '#'}
              target="_blank"
              rel="noreferrer"
              className={cn(
                'block w-20 h-20 rounded-md border overflow-hidden bg-muted/30',
                !url && 'pointer-events-none opacity-60',
              )}
              title={att.file_name}
            >
              {url ? (
                <img src={url} alt={att.file_name} className="w-full h-full object-cover" />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <ImageIcon className="w-5 h-5 text-muted-foreground" />
                </div>
              )}
            </a>
          );
        }
        return (
          <a
            key={att.id}
            href={url ?? '#'}
            target="_blank"
            rel="noreferrer"
            download={att.file_name}
            className={cn(
              'flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-xs hover:bg-muted/40 transition',
              !url && 'pointer-events-none opacity-60',
            )}
          >
            <FileText className="w-4 h-4 text-module shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className="font-medium truncate max-w-[160px]">{att.file_name}</span>
              <span className="text-[10px] text-muted-foreground">{humanSize(att.size_bytes)}</span>
            </div>
            {url && <Download className="w-3.5 h-3.5 text-muted-foreground ml-1" />}
          </a>
        );
      })}
      {attachments.some((a) => urls.get(a.id) === null && urls.has(a.id)) && (
        <span className="text-[11px] text-muted-foreground">
          {t('projects.decisions.attach.urlFailed', 'Neki prilozi trenutno nisu dostupni.')}
        </span>
      )}
    </div>
  );
}
