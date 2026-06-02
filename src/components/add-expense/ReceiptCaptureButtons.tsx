import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, Image, Loader2, Check, X, Layers } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ReceiptCaptureButtonsProps {
  scanning: boolean;
  showMultiImageCollector: boolean;
  receiptImages: string[];
  isNative: boolean;
  onNativeCapture: (source: 'camera' | 'gallery', multiMode?: boolean) => void;
  onImageCapture: (event: React.ChangeEvent<HTMLInputElement>, multiMode?: boolean) => void;
  onOpenFileInputCapture: (inputRef: React.RefObject<HTMLInputElement>) => void;
  onScanMultipleImages: () => void;
  onToggleMultiMode: () => void;
  onRemoveImage: (index: number) => void;
  cameraInputRef: React.RefObject<HTMLInputElement>;
  galleryInputRef: React.RefObject<HTMLInputElement>;
  multiCameraInputRef: React.RefObject<HTMLInputElement>;
  multiGalleryInputRef: React.RefObject<HTMLInputElement>;
}

export const ReceiptCaptureButtons = ({
  scanning,
  showMultiImageCollector,
  receiptImages,
  isNative,
  onNativeCapture,
  onImageCapture,
  onOpenFileInputCapture,
  onScanMultipleImages,
  onToggleMultiMode,
  onRemoveImage,
  cameraInputRef,
  galleryInputRef,
  multiCameraInputRef,
  multiGalleryInputRef,
}: ReceiptCaptureButtonsProps) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => onImageCapture(e, false)}
          className="hidden"
          id="camera-input"
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => onImageCapture(e, false)}
          className="hidden"
          id="gallery-input"
        />
        <input
          ref={multiCameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => onImageCapture(e, true)}
          className="hidden"
          id="multi-camera-input"
        />
        <input
          ref={multiGalleryInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => onImageCapture(e, true)}
          className="hidden"
          id="multi-gallery-input"
        />
        <Button
          type="button"
          variant="outline"
          className="flex-1 gap-2 rounded-xl border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:border-blue-400 dark:border-blue-600 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-900/50"
          onClick={() => isNative ? onNativeCapture('camera') : onOpenFileInputCapture(cameraInputRef)}
          disabled={scanning || showMultiImageCollector}
        >
          {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
          {t('scanner.takePhoto')}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="flex-1 gap-2 rounded-xl border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-400 dark:border-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/50"
          onClick={() => isNative ? onNativeCapture('gallery') : onOpenFileInputCapture(galleryInputRef)}
          disabled={scanning || showMultiImageCollector}
        >
          {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Image className="w-4 h-4" />}
          {t('scanner.fromGallery')}
        </Button>
      </div>

      {/* Multi-page toggle */}
      {!showMultiImageCollector && !scanning && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onToggleMultiMode}
          disabled={scanning}
          className="w-full gap-2 rounded-xl border-dashed border-primary/50 bg-primary/5 text-primary hover:bg-primary/10 hover:border-primary/70"
        >
          <Layers className="w-4 h-4" />
          {t('scanner.multiPageReceipt')}
        </Button>
      )}

      {/* Multi-image collector */}
      {showMultiImageCollector && (
        <div className="space-y-2 p-3 bg-muted/30 rounded-xl border border-border/50">
          <p className="text-xs font-medium text-muted-foreground">
            {t('scanner.multiPageTitle', { count: receiptImages.length, max: 5 })}
          </p>

          {receiptImages.length > 0 && (
            <div className="flex gap-1 overflow-x-auto">
              {receiptImages.map((img, idx) => (
                <div key={idx} className="relative flex-shrink-0">
                  <img src={img} alt={`${idx + 1}`} className="h-16 w-auto rounded object-cover" />
                  <button
                    type="button"
                    className="absolute top-0.5 right-0.5 w-4 h-4 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center text-[10px]"
                    onClick={() => onRemoveImage(idx)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1 gap-1 text-xs"
              onClick={() => isNative ? onNativeCapture('camera', true) : onOpenFileInputCapture(multiCameraInputRef)}
              disabled={scanning || receiptImages.length >= 5}
            >
              <Camera className="w-3 h-3" />
              {t('scanner.addPage')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1 gap-1 text-xs"
              onClick={() => isNative ? onNativeCapture('gallery', true) : onOpenFileInputCapture(multiGalleryInputRef)}
              disabled={scanning || receiptImages.length >= 5}
            >
              <Image className="w-3 h-3" />
              {t('scanner.fromGallery')}
            </Button>
          </div>

          {receiptImages.length > 0 && (
            <Button
              type="button"
              className="w-full gap-2 rounded-xl"
              onClick={onScanMultipleImages}
              disabled={scanning}
            >
              {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {scanning ? t('scanner.analyzingShort') : pluralizeScanPages(t, receiptImages.length)}
            </Button>
          )}

          {receiptImages.length >= 5 && (
            <p className="text-xs text-muted-foreground text-center">{t('scanner.maxPages', { max: 5 })}</p>
          )}
        </div>
      )}
    </div>
  );
};

// HR pluralization helper (one/few/many); EN/DE fall back to scanPagesOther
function pluralizeScanPages(t: (key: string, opts?: Record<string, unknown>) => string, count: number): string {
  const lang = (typeof document !== 'undefined' && document.documentElement.lang) || 'hr';
  if (lang.startsWith('hr')) {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) return t('scanner.scanPagesOne', { count });
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return t('scanner.scanPagesFew', { count });
    return t('scanner.scanPagesMany', { count });
  }
  return count === 1 ? t('scanner.scanPagesOne', { count }) : t('scanner.scanPagesOther', { count });
}
