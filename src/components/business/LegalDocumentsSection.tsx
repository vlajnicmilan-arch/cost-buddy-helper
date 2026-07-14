import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FileText, ShieldCheck, Loader2, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import i18n from '@/i18n';

interface Props {
  defaultCompanyName?: string;
  defaultCompanyOib?: string;
  defaultCompanyAddress?: string;
  defaultEmail?: string;
}

type DocType = 'dpa' | 'privacy_notice';

export const LegalDocumentsSection = ({
  defaultCompanyName,
  defaultCompanyOib,
  defaultCompanyAddress,
  defaultEmail,
}: Props) => {
  const { t } = useTranslation();
  const [companyName, setCompanyName] = useState(defaultCompanyName || '');
  const [companyOib, setCompanyOib] = useState(defaultCompanyOib || '');
  const [companyAddress, setCompanyAddress] = useState(defaultCompanyAddress || '');
  const [contactEmail, setContactEmail] = useState(defaultEmail || '');
  const [generating, setGenerating] = useState<DocType | null>(null);

  const handleGenerate = async (docType: DocType) => {
    if (!companyName.trim()) {
      showError(t('settings.legal.companyRequired', 'Unesite naziv firme'));
      return;
    }
    setGenerating(docType);
    try {
      const fnName = docType === 'dpa' ? 'generate-dpa' : 'generate-privacy-notice';
      const { data, error } = await supabase.functions.invoke(fnName, {
        body: {
          companyName: companyName.trim(),
          companyOib: companyOib.trim() || undefined,
          companyAddress: companyAddress.trim() || undefined,
          contactEmail: contactEmail.trim() || undefined,
          language: i18n.language || 'hr',
        },
      });
      if (error) throw error;
      const { pdf, filename } = data as { pdf: string; filename: string };
      // Decode base64 and trigger download
      const binary = atob(pdf);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showSuccess(t('settings.legal.generated', 'Dokument generiran'));
    } catch (e: any) {
      console.error(e);
      showError(t('settings.legal.generateError', 'Greška pri generiranju dokumenta'));
    } finally {
      setGenerating(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-5 h-5 text-primary" />
        <h3 className="font-semibold text-foreground">
          {t('settings.legal.title', 'Pravna dokumentacija (GDPR)')}
        </h3>
      </div>

      <p className="text-sm text-muted-foreground">
        {t(
          'settings.legal.intro',
          'Generirajte ugovor o obradi podataka (DPA) i obavijest o privatnosti za radnike/suradnike. Pre-popunjeno s podacima vaše tvrtke.'
        )}
      </p>

      <div className="space-y-3 p-4 rounded-lg bg-muted/30 border border-border">
        <div className="space-y-1.5">
          <Label htmlFor="legal-company-name">
            {t('settings.legal.companyName', 'Naziv tvrtke')} *
          </Label>
          <Input
            id="legal-company-name"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Primjer d.o.o."
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="legal-company-oib">{t('settings.legal.oib', 'OIB')}</Label>
            <Input
              id="legal-company-oib"
              value={companyOib}
              onChange={(e) => setCompanyOib(e.target.value)}
              placeholder="12345678901"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="legal-contact-email">{t('settings.legal.email', 'Email')}</Label>
            <Input
              id="legal-contact-email"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="kontakt@firma.hr"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="legal-company-address">{t('settings.legal.address', 'Adresa sjedišta')}</Label>
          <Input
            id="legal-company-address"
            value={companyAddress}
            onChange={(e) => setCompanyAddress(e.target.value)}
            placeholder="Ulica i broj, Grad"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Button
          variant="outline"
          onClick={() => handleGenerate('dpa')}
          disabled={generating !== null}
          className="justify-start h-auto py-3"
        >
          {generating === 'dpa' ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <FileText className="w-4 h-4 mr-2" />
          )}
          <div className="flex flex-col items-start text-left">
            <span className="font-medium">{t('settings.legal.dpaButton', 'DPA Ugovor')}</span>
            <span className="text-xs text-muted-foreground font-normal">
              {t('settings.legal.dpaDesc', 'Za vašu evidenciju kao Voditelja obrade')}
            </span>
          </div>
        </Button>

        <Button
          variant="outline"
          onClick={() => handleGenerate('privacy_notice')}
          disabled={generating !== null}
          className="justify-start h-auto py-3"
        >
          {generating === 'privacy_notice' ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Download className="w-4 h-4 mr-2" />
          )}
          <div className="flex flex-col items-start text-left">
            <span className="font-medium">
              {t('settings.legal.pnButton', 'Obavijest o privatnosti')}
            </span>
            <span className="text-xs text-muted-foreground font-normal">
              {t('settings.legal.pnDesc', 'Za vaše radnike i suradnike')}
            </span>
          </div>
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {t(
          'settings.legal.note',
          'Dokumenti služe kao polazna točka. Za specifične pravne situacije konzultirajte odvjetnika.'
        )}
      </p>
    </div>
  );
};
