import { useMemo, useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Paperclip, X, FileText, ImageIcon, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNativeCamera } from '@/hooks/useNativeCamera';
import { showError } from '@/hooks/useStatusFeedback';
import {
  MAX_ATTACHMENTS_PER_STEP,
  MAX_DOC_BYTES,
  isImageAttachment,
  validateDecisionAttachment,
} from '@/lib/decisionAttachments';
import { cn } from '@/lib/utils';

interface Props {
  value: File[];
  onChange: (next: File[]) => void;
  disabled?: boolean;
}

const dataUrlToFile = (dataUrl: string, fileName: string): File => {
  const [header, base64] = dataUrl.split(',');
  const mimeMatch = header.match(/data:([^;]+);base64/);
  const mime = mimeMatch?.[1] || 'image/jpeg';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], fileName, { type: mime });
};

const humanSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * Prilog-picker za korake odluke (Faza 3).
 * Max 3 priloga, kamera/galerija/datoteka.
 * Slike se komprimiraju tek pri uploadu (u useProjectDecisions), ovdje je preview
 * iz object URL-a nad izvornim Fileom.
 */
export function DecisionAttachmentPicker({ value, onChange, disabled }: Props) {
  const { t } = useTranslation();
  const { takePhoto, isNative, cameraInputRef } = useNativeCamera();
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<Map<string, string>>(new Map());

  // Object URL cache za slike (revocked na unmount / promjeni)
  useEffect(() => {
    const next = new Map<string, string>();
    value.forEach((f, i) => {
      if (isImageAttachment(f)) {
        try { next.set(`${i}-${f.name}`, URL.createObjectURL(f)); } catch {}
      }
    });
    setPreviews(next);
    return () => {
      next.forEach((url) => { try { URL.revokeObjectURL(url); } catch {} });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const remaining = MAX_ATTACHMENTS_PER_STEP - value.length;
  const canAdd = remaining > 0 && !disabled;

  const addFiles = (files: File[]) => {
    if (files.length === 0) return;
    const room = MAX_ATTACHMENTS_PER_STEP - value.length;
    if (room <= 0) {
      showError(t('projects.decisions.attach.tooMany', 'Najviše {{n}} priloga po koraku', { n: MAX_ATTACHMENTS_PER_STEP }));
      return;
    }
    const accepted: File[] = [];
    for (const f of files.slice(0, room)) {
      const v = validateDecisionAttachment({ type: f.type, name: f.name, size: f.size });
      if (!v.ok) {
        if (v.reason === 'docTooLarge') {
          showError(t('projects.decisions.attach.docTooLarge', 'Dokument prevelik (max {{mb}} MB)', { mb: MAX_DOC_BYTES / (1024 * 1024) }));
        } else {
          showError(t('projects.decisions.attach.unsupported', 'Nepodržan tip datoteke'));
        }
        continue;
      }
      accepted.push(f);
    }
    if (accepted.length > 0) onChange([...value, ...accepted]);
  };

  const handleCamera = async () => {
    if (!canAdd) return;
    const dataUrl = await takePhoto();
    if (!dataUrl) return;
    const file = dataUrlToFile(dataUrl, `photo_${Date.now()}.jpg`);
    addFiles([file]);
  };

  const handleGallery = () => {
    if (!canAdd) return;
    galleryInputRef.current?.click();
  };

  const handleFile = () => {
    if (!canAdd) return;
    fileInputRef.current?.click();
  };

  const onGalleryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    addFiles(files);
    e.target.value = '';
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    addFiles(files);
    e.target.value = '';
  };

  const removeAt = (idx: number) => {
    const next = value.filter((_, i) => i !== idx);
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <Paperclip className="w-3.5 h-3.5" />
          {t('projects.decisions.attach.label', 'Prilozi')} ({value.length}/{MAX_ATTACHMENTS_PER_STEP})
        </span>
        <div className="flex gap-1 ml-auto">
          <Button type="button" size="sm" variant="outline" onClick={handleCamera} disabled={!canAdd} className="gap-1 h-8">
            <Camera className="w-3.5 h-3.5" />
            <span className="text-xs">{t('projects.decisions.attach.camera', 'Kamera')}</span>
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={handleGallery} disabled={!canAdd} className="gap-1 h-8">
            <ImageIcon className="w-3.5 h-3.5" />
            <span className="text-xs">{t('projects.decisions.attach.gallery', 'Galerija')}</span>
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={handleFile} disabled={!canAdd} className="gap-1 h-8">
            <FileText className="w-3.5 h-3.5" />
            <span className="text-xs">{t('projects.decisions.attach.file', 'Dokument')}</span>
          </Button>
        </div>
      </div>

      {value.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {value.map((f, i) => {
            const isImg = isImageAttachment(f);
            const preview = previews.get(`${i}-${f.name}`);
            return (
              <div key={`${i}-${f.name}`} className="relative rounded-md border bg-muted/20 overflow-hidden aspect-square">
                {isImg && preview ? (
                  <img src={preview} alt={f.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full p-2 text-center">
                    <FileText className="w-6 h-6 text-muted-foreground mb-1" />
                    <span className="text-[10px] font-medium truncate w-full">{f.name}</span>
                    <span className="text-[10px] text-muted-foreground">{humanSize(f.size)}</span>
                  </div>
                )}
                <button
                  type="button"
                  aria-label={t('common.remove', 'Ukloni') as string}
                  onClick={() => removeAt(i)}
                  disabled={disabled}
                  className={cn(
                    'absolute top-1 right-1 w-6 h-6 rounded-full bg-background/80 backdrop-blur',
                    'flex items-center justify-center border shadow-sm hover:bg-destructive hover:text-destructive-foreground transition',
                  )}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Hidden inputs — kamera fallback za web ide preko useNativeCamera */}
      {!isNative && (
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          aria-hidden
          tabIndex={-1}
        />
      )}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        multiple
        aria-hidden
        tabIndex={-1}
        onChange={onGalleryChange}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.pdf,.doc,.docx"
        className="hidden"
        multiple
        aria-hidden
        tabIndex={-1}
        onChange={onFileChange}
      />
    </div>
  );
}
