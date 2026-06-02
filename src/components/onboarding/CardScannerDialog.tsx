import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslation } from 'react-i18next';
import { Camera, Loader2, CreditCard, ScanLine, AlertCircle, ShieldCheck, AlertTriangle } from 'lucide-react';
import { showSuccess } from '@/hooks/useStatusFeedback';
import { supabase } from '@/integrations/supabase/client';
import { parseAiQuotaError, emitCoreScanLimitReached } from '@/lib/aiQuotaError';

interface CardScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCardDetected: (cardType: string) => void;
}

const CARD_TYPES = [
  { id: 'visa', name: 'Visa' },
  { id: 'mastercard', name: 'Mastercard' },
  { id: 'amex', name: 'American Express' },
  { id: 'maestro', name: 'Maestro' },
  { id: 'diners', name: 'Diners Club' },
  { id: 'discover', name: 'Discover' },
  { id: 'revolut', name: 'Revolut' },
  { id: 'n26', name: 'N26' },
];

export const CardScannerDialog = ({
  open,
  onOpenChange,
  onCardDetected
}: CardScannerDialogProps) => {
  const { t } = useTranslation();
  const [scanning, setScanning] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [detectedType, setDetectedType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualCardType, setManualCardType] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setScanning(false);
    setPreview(null);
    setDetectedType(null);
    setError(null);
    setShowManualEntry(false);
    setManualCardType('');
  };

  const handleClose = () => {
    resetState();
    onOpenChange(false);
  };

  const processImage = async (file: File) => {
    setScanning(true);
    setError(null);
    setDetectedType(null);
    setShowManualEntry(false);

    try {
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);

      // Convert to base64 for AI processing
      const base64 = await new Promise<string>((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.readAsDataURL(file);
      });

      // Call edge function to detect card type
      const { data, error: funcError } = await supabase.functions.invoke('scan-card', {
        body: { imageBase64: base64 }
      });

      if (funcError) {
        // supabase-js wraps non-2xx u FunctionsHttpError s `.context` (Response)
        const ctx = (funcError as { context?: Response }).context;
        if (ctx && ctx.status === 429) {
          const quotaError = await parseAiQuotaError(ctx.clone());
          if (quotaError?.kind === 'core_scan_limit') {
            emitCoreScanLimitReached(quotaError.resetAt);
            return;
          }
        }
        throw new Error(funcError.message);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      const cardType = data?.cardType || 'Unknown';
      
      if (cardType.toLowerCase() === 'unknown') {
        setError(t('onboarding.cardNotRecognized', 'Nije moguće prepoznati tip kartice.'));
        setShowManualEntry(true);
      } else {
        setDetectedType(cardType);
        showSuccess(t('onboarding.cardRecognized', 'Kartica prepoznata: {{type}}').replace('{{type}}', cardType));
      }
    } catch (err) {
      console.error('Card scan error:', err);
      setError(t('onboarding.scanError', 'Greška pri skeniranju.'));
      setShowManualEntry(true);
    } finally {
      setScanning(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImage(file);
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  };

  const handleConfirm = () => {
    if (detectedType) {
      onCardDetected(detectedType);
      handleClose();
    }
  };

  const handleManualSubmit = () => {
    if (manualCardType.trim()) {
      onCardDetected(manualCardType.trim());
      handleClose();
    }
  };

  const selectManualType = (type: string) => {
    onCardDetected(type);
    handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent showBackButton={false} className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="w-5 h-5" />
            {t('onboarding.scanCardTitle', 'Skeniraj karticu')}
          </DialogTitle>
          <DialogDescription>
            {t('onboarding.scanCardDescription', 'Fotografirajte karticu za automatsko prepoznavanje tipa')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Privacy notice */}
          <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl">
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-primary">
                  {t('onboarding.privacyTitle', 'Vaša privatnost je zaštićena')}
                </p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• {t('onboarding.privacyNoSave', 'Slike kartica se NE spremaju')}</li>
                  <li>• {t('onboarding.privacyNoNumbers', 'Brojevi kartica se NE pohranjuju')}</li>
                  <li>• {t('onboarding.privacyFrontOnly', 'Fotografirajte samo PREDNJU stranu')}</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Upload area with card frame */}
          {!preview && !scanning && (
            <div 
              className="relative border-2 border-dashed border-muted-foreground/25 rounded-xl p-4 text-center hover:border-primary/50 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              {/* Card positioning frame */}
              <div className="relative mx-auto w-full max-w-[280px] aspect-[1.586/1] bg-muted/30 rounded-xl border-2 border-primary/30 flex items-center justify-center mb-4 overflow-hidden">
                {/* Corner markers */}
                <div className="absolute top-2 left-2 w-6 h-6 border-t-2 border-l-2 border-primary rounded-tl-lg" />
                <div className="absolute top-2 right-2 w-6 h-6 border-t-2 border-r-2 border-primary rounded-tr-lg" />
                <div className="absolute bottom-2 left-2 w-6 h-6 border-b-2 border-l-2 border-primary rounded-bl-lg" />
                <div className="absolute bottom-2 right-2 w-6 h-6 border-b-2 border-r-2 border-primary rounded-br-lg" />
                
                {/* Center content */}
                <div className="text-center">
                  <CreditCard className="w-12 h-12 text-primary/40 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">
                    {t('onboarding.positionCard', 'Pozicionirajte karticu unutar okvira')}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-center gap-2 mb-2">
                <Camera className="w-5 h-5 text-primary" />
                <p className="text-sm font-medium">{t('onboarding.tapToScan', 'Dodirnite za fotografiranje')}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('onboarding.orUpload', 'ili odaberite sliku iz galerije')}
              </p>
              
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          )}

          {/* Scanning indicator with positioning frame */}
          {scanning && (
            <div className="text-center py-4">
              {/* Card positioning frame during scan */}
              <div className="relative mx-auto w-full max-w-[280px] aspect-[1.586/1] bg-muted/30 rounded-xl border-2 border-primary/50 flex items-center justify-center mb-4 overflow-hidden">
                {/* Corner markers - visible during scan */}
                <div className="absolute top-2 left-2 w-8 h-8 border-t-3 border-l-3 border-primary rounded-tl-lg animate-pulse" style={{ borderWidth: '3px' }} />
                <div className="absolute top-2 right-2 w-8 h-8 border-t-3 border-r-3 border-primary rounded-tr-lg animate-pulse" style={{ borderWidth: '3px' }} />
                <div className="absolute bottom-2 left-2 w-8 h-8 border-b-3 border-l-3 border-primary rounded-bl-lg animate-pulse" style={{ borderWidth: '3px' }} />
                <div className="absolute bottom-2 right-2 w-8 h-8 border-b-3 border-r-3 border-primary rounded-br-lg animate-pulse" style={{ borderWidth: '3px' }} />
                
                {/* Scanning line animation */}
                <div className="absolute inset-x-4 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent animate-bounce" />
                
                {/* Center loader */}
                <div className="relative w-16 h-16">
                  <Loader2 className="w-16 h-16 animate-spin text-primary" />
                  <CreditCard className="w-6 h-6 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                </div>
              </div>
              
              <p className="text-sm font-medium">{t('onboarding.analyzing', 'Analiziram karticu...')}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {t('onboarding.analyzingNote', 'Slika se briše nakon analize')}
              </p>
            </div>
          )}

          {/* Preview with result */}
          {preview && !scanning && (
            <div className="space-y-4">
              <div className="relative rounded-xl overflow-hidden">
                <img src={preview} alt="Card preview" className="w-full h-40 object-cover blur-sm" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-black/30 flex items-center justify-center">
                  <div className="text-center text-white">
                    <CreditCard className="w-8 h-8 mx-auto mb-1 opacity-80" />
                    <p className="text-xs opacity-70">{t('onboarding.imageBlurred', 'Slika je zamagljena radi sigurnosti')}</p>
                  </div>
                </div>
              </div>

              {detectedType && (
                <div className="p-4 bg-primary/10 rounded-xl flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <CreditCard className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{t('onboarding.detectedType', 'Prepoznati tip')}:</p>
                    <p className="text-lg font-bold text-primary">{detectedType}</p>
                  </div>
                </div>
              )}

              {error && (
                <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-xl">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-destructive">{error}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {t('onboarding.manualEntryPrompt', 'Unesite tip kartice ručno ili odaberite iz popisa ispod.')}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Manual entry when detection fails */}
              {showManualEntry && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    {t('onboarding.enterCardType', 'Unesite tip kartice')}
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      value={manualCardType}
                      onChange={(e) => setManualCardType(e.target.value)}
                      placeholder={t('onboarding.cardTypePlaceholder', 'npr. Visa, Mastercard...')}
                      className="flex-1"
                    />
                    <Button onClick={handleManualSubmit} disabled={!manualCardType.trim()}>
                      {t('common.confirm', 'Potvrdi')}
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" onClick={resetState} className="flex-1">
                  {t('onboarding.tryAgain', 'Pokušaj ponovo')}
                </Button>
                {detectedType && (
                  <Button onClick={handleConfirm} className="flex-1">
                    {t('common.confirm', 'Potvrdi')}
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Quick selection buttons */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              {t('onboarding.orSelectManually', 'Ili odaberite brzo:')}
            </Label>
            <div className="grid grid-cols-4 gap-2">
              {CARD_TYPES.map((card) => (
                <button
                  key={card.id}
                  onClick={() => selectManualType(card.name)}
                  className="p-2 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-colors text-center"
                >
                  <span className="text-xs font-medium">{card.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};