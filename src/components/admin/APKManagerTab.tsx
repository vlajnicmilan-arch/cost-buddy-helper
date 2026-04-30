import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, Package, Loader2, Info, Calendar, HardDrive } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { tr, friendlyError } from '@/lib/errorMessages';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';

interface ApkMetadata {
  size: number;
  lastModified: string | null;
}

const APK_FILE_NAME = 'vm-balance.apk';
const BUCKET = 'public-assets';
const MAX_SIZE_MB = 100;

export const APKManagerTab = () => {
  const [metadata, setMetadata] = useState<ApkMetadata | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadMetadata = async () => {
    setLoadingMeta(true);
    try {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .list('', { search: APK_FILE_NAME });

      if (error) throw error;
      const apk = data?.find((f) => f.name === APK_FILE_NAME);
      if (apk) {
        setMetadata({
          size: (apk.metadata as any)?.size ?? 0,
          lastModified: apk.updated_at ?? apk.created_at ?? null,
        });
      } else {
        setMetadata(null);
      }
    } catch (err: any) {
      console.error('APK metadata load failed:', err);
      setMetadata(null);
    }
    setLoadingMeta(false);
  };

  useEffect(() => {
    loadMetadata();
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.apk')) {
      showError(tr('errors.files.apkInvalid', 'Datoteka mora biti .apk'));
      e.target.value = '';
      return;
    }

    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > MAX_SIZE_MB) {
      showError(tr('errors.files.apkTooLarge', 'Datoteka prevelika (max {{size}}MB)', { size: MAX_SIZE_MB }));
      e.target.value = '';
      return;
    }

    setUploading(true);
    setProgress(10);

    try {
      // Simulate progress (Supabase JS doesn't expose upload progress events natively)
      const progressInterval = setInterval(() => {
        setProgress((p) => (p < 85 ? p + 5 : p));
      }, 300);

      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(APK_FILE_NAME, file, {
          upsert: true,
          cacheControl: '0',
          contentType: 'application/vnd.android.package-archive',
        });

      clearInterval(progressInterval);
      setProgress(100);

      if (error) throw error;

      showSuccess('APK uspješno uploadan');
      await loadMetadata();
    } catch (err: any) {
      console.error('APK upload failed:', err);
      showError(friendlyError(err, 'errors.files.uploadFailed'));
    } finally {
      setUploading(false);
      setProgress(0);
      e.target.value = '';
    }
  };

  const formatSize = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Package className="w-4 h-4 text-primary" />
            Trenutni APK na landing pageu
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loadingMeta ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Učitavam podatke...
            </div>
          ) : metadata ? (
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <HardDrive className="w-3.5 h-3.5" />
                <span>Veličina: <span className="font-medium text-foreground">{formatSize(metadata.size)}</span></span>
              </div>
              {metadata.lastModified && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>
                    Zadnja promjena:{' '}
                    <span className="font-medium text-foreground">
                      {format(new Date(metadata.lastModified), 'dd.MM.yyyy. HH:mm', { locale: hr })}
                    </span>
                  </span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nema uploadanog APK-a.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="w-4 h-4 text-primary" />
            Upload novog APK-a
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".apk,application/vnd.android.package-archive"
            onChange={handleFileChange}
            className="hidden"
            disabled={uploading}
          />

          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full h-12"
            size="lg"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Upload u tijeku... {progress}%
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Odaberi APK datoteku
              </>
            )}
          </Button>

          {uploading && (
            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          <div className="flex gap-2 p-3 rounded-lg bg-muted/50 border border-border/50">
            <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <div className="text-xs text-muted-foreground space-y-1.5">
              <p className="font-medium text-foreground">Kada trebaš uploadati novi APK?</p>
              <p>
                Sve <strong>UI promjene</strong> (gumbi, boje, tekst, nove stranice) idu automatski preko Live Synca — <strong>ne treba</strong> novi APK.
              </p>
              <p>
                Novi APK trebaš uploadati samo ako si dodao <strong>novi nativni plugin</strong> (Camera, Push, itd.) ili promijenio <strong>ikonu/splash screen</strong>.
              </p>
              <p className="pt-1 border-t border-border/50 mt-2">
                Nakon uploada, datoteka je <strong>odmah dostupna</strong> na landing pageu — bez dodatnih koraka.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
