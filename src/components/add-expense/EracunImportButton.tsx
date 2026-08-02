import { useRef, useState } from 'react';
import { FileCode2, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { showError } from '@/hooks/useStatusFeedback';
import { parseUbl } from '@/lib/eracun/parseUbl';
import { toExpenseDraft, type EracunExpenseDraft } from '@/lib/eracun/toExpenseDraft';
import { EracunParseError, type EracunInvoice } from '@/lib/eracun/types';

interface EracunImportButtonProps {
  /** Poziva se s popunjenim nacrtom i cijelim parsiranim dokumentom. */
  onParsed: (draft: EracunExpenseDraft, invoice: EracunInvoice) => void;
  disabled?: boolean;
}

/**
 * Ulaz „Učitaj eRačun (XML)" — samo biznis mod.
 * Parsiranje živi u `@/lib/eracun`, ovdje je isključivo odabir datoteke i prikaz upozorenja.
 */
export const EracunImportButton = ({ onParsed, disabled }: EracunImportButtonProps) => {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setLoading(true);
    setWarnings([]);
    try {
      const xml = await file.text();
      const invoice = parseUbl(xml);
      const today = new Date().toISOString().split('T')[0];
      onParsed(toExpenseDraft(invoice, today), invoice);

      setWarnings(
        invoice.warnings.map((warning) =>
          t(`eracun.warning.${warning.code}`, {
            ...(warning.params ?? {}),
            defaultValue: warning.code,
          })
        )
      );
    } catch (error) {
      const code = error instanceof EracunParseError ? error.code : 'not_xml';
      showError(t(`eracun.error.${code}`, { defaultValue: t('eracun.error.not_xml') }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept=".xml,text/xml,application/xml"
        className="hidden"
        onChange={handleFile}
      />
      <Button
        type="button"
        variant="outline"
        disabled={disabled || loading}
        onClick={() => inputRef.current?.click()}
        className="w-full min-h-[44px] gap-2 rounded-xl"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCode2 className="w-4 h-4" />}
        {t('eracun.importButton')}
      </Button>

      {warnings.length > 0 && (
        <Alert variant="destructive" className="rounded-xl">
          <AlertDescription className="space-y-1 text-xs">
            {warnings.map((message) => (
              <p key={message}>{message}</p>
            ))}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};
