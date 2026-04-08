import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, Image, Loader2, Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ReceiptCaptureButtonsProps {
  scanning: boolean;
  showMultiImageCollector: boolean;
  receiptImages: string[];
  isNative: boolean;
  onNativeCapture: (source: 'camera' | 'gallery', multiMode?: boolean) => void;
  onImageCapture: (event: React.ChangeEvent<HTMLInputElement>, multiMode?: boolean) => void;
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
          onClick={() => isNative ? onNativeCapture('camera') : cameraInputRef.current?.click()}
          disabled={scanning || showMultiImageCollector}
        >
          {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
          {t('scanner.takePhoto')}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="flex-1 gap-2 rounded-xl border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-400 dark:border-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/50"
          onClick={() => isNative ? onNativeCapture('gallery') : galleryInputRef.current?.click()}
          disabled={scanning || showMultiImageCollector}
        >
          {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Image className="w-4 h-4" />}
          {t('scanner.fromGallery')}
        </Button>
      </div>

      {/* Multi-page toggle */}
      {!showMultiImageCollector && !scanning && (
        <button
          type="button"
          onClick={onToggleMultiMode}
          className="w-full text-xs text-muted-foreground hover:text-primary transition-colors py-1"
        >
          📄 Višestraničan račun? Klikni ovdje
        </button>
      )}

      {/* Multi-image collector */}
      {showMultiImageCollector && (
        <div className="space-y-2 p-3 bg-muted/30 rounded-xl border border-border/50">
          <p className="text-xs font-medium text-muted-foreground">
            📄 Dodaj sve stranice računa ({receiptImages.length}/5)
          </p>

          {receiptImages.length > 0 && (
            <div className="flex gap-1 overflow-x-auto">
              {receiptImages.map((img, idx) => (
                <div key={idx} className="relative flex-shrink-0">
                  <img src={img} alt={`Str. ${idx + 1}`} className="h-16 w-auto rounded object-cover" />
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
              onClick={() => isNative ? onNativeCapture('camera', true) : multiCameraInputRef.current?.click()}
              disabled={scanning || receiptImages.length >= 5}
            >
              <Camera className="w-3 h-3" />
              Dodaj stranicu
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1 gap-1 text-xs"
              onClick={() => isNative ? onNativeCapture('gallery', true) : multiGalleryInputRef.current?.click()}
              disabled={scanning || receiptImages.length >= 5}
            >
              <Image className="w-3 h-3" />
              Iz galerije
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
              {scanning ? 'Analiziram...' : `Skeniraj ${receiptImages.length} ${receiptImages.length === 1 ? 'stranicu' : 'stranice'}`}
            </Button>
          )}

          {receiptImages.length >= 5 && (
            <p className="text-xs text-muted-foreground text-center">Maksimalno 5 stranica</p>
          )}
        </div>
      )}
    </div>
  );
};
