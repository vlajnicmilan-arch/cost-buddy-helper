import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslation } from 'react-i18next';
import { Camera, Upload, Loader2, CreditCard, ScanLine, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface CardScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCardDetected: (cardType: string) => void;
}

const CARD_TYPES = [
  { id: 'visa', name: 'Visa', pattern: /^4/, color: '#1A1F71' },
  { id: 'mastercard', name: 'Mastercard', pattern: /^5[1-5]|^2[2-7]/, color: '#EB001B' },
  { id: 'amex', name: 'American Express', pattern: /^3[47]/, color: '#006FCF' },
  { id: 'maestro', name: 'Maestro', pattern: /^(50|5[6-9]|6)/, color: '#0066CC' },
  { id: 'diners', name: 'Diners Club', pattern: /^3(0[0-5]|[68])/, color: '#004A97' },
  { id: 'discover', name: 'Discover', pattern: /^6011|^65/, color: '#FF6000' },
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setScanning(false);
    setPreview(null);
    setDetectedType(null);
    setError(null);
  };

  const handleClose = () => {
    resetState();
    onOpenChange(false);
  };

  const processImage = async (file: File) => {
    setScanning(true);
    setError(null);
    setDetectedType(null);

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

      // Call AI to detect card type
      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `Analyze this image of a payment card and identify the card network/type. 
                  
Look for:
- Card network logos (Visa, Mastercard, American Express, Maestro, Diners Club, Discover)
- Any visible text indicating the card type
- Card design patterns typical of specific networks

Respond with ONLY the card type name in a single word or two (e.g., "Visa", "Mastercard", "American Express", "Maestro", "Diners Club", "Discover", or "Unknown" if you cannot determine).

Do not include any other text or explanation.`
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: base64
                  }
                }
              ]
            }
          ],
          temperature: 0.1,
          max_tokens: 50
        })
      });

      if (!response.ok) {
        throw new Error('Failed to analyze image');
      }

      const data = await response.json();
      const cardType = data.choices?.[0]?.message?.content?.trim() || 'Unknown';
      
      // Clean up the response
      const cleanedType = cardType.replace(/['"]/g, '').trim();
      
      if (cleanedType.toLowerCase() === 'unknown') {
        setError(t('onboarding.cardNotRecognized', 'Nije moguće prepoznati tip kartice. Pokušajte ponovo ili odaberite ručno.'));
      } else {
        setDetectedType(cleanedType);
      }
    } catch (err) {
      console.error('Card scan error:', err);
      setError(t('onboarding.scanError', 'Greška pri skeniranju. Pokušajte ponovo.'));
    } finally {
      setScanning(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImage(file);
    }
  };

  const handleConfirm = () => {
    if (detectedType) {
      onCardDetected(detectedType);
      handleClose();
    }
  };

  const selectManualType = (type: string) => {
    onCardDetected(type);
    handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
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
          {/* Upload area */}
          {!preview && !scanning && (
            <div 
              className="border-2 border-dashed border-muted-foreground/25 rounded-xl p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="w-16 h-16 mx-auto rounded-full bg-muted flex items-center justify-center mb-4">
                <Camera className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium mb-1">{t('onboarding.tapToScan', 'Dodirnite za fotografiranje')}</p>
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

          {/* Scanning indicator */}
          {scanning && (
            <div className="text-center py-8">
              <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
              <p className="text-sm font-medium">{t('onboarding.analyzing', 'Analiziram karticu...')}</p>
            </div>
          )}

          {/* Preview with result */}
          {preview && !scanning && (
            <div className="space-y-4">
              <div className="relative rounded-xl overflow-hidden">
                <img src={preview} alt="Card preview" className="w-full h-40 object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
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
                <div className="p-4 bg-destructive/10 rounded-xl flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
                  <p className="text-sm text-destructive">{error}</p>
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

          {/* Manual selection */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              {t('onboarding.orSelectManually', 'Ili odaberite ručno:')}
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {CARD_TYPES.map((card) => (
                <button
                  key={card.id}
                  onClick={() => selectManualType(card.name)}
                  className="p-2 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-colors text-center"
                >
                  <span className="text-sm font-medium">{card.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
