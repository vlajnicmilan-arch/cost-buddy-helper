import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Copy, Mail, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { useMailInbox } from '@/hooks/useMailInbox';
import { aliasToAddress } from '@/lib/mailAlias';

/**
 * Prazno stanje reda „Na pregled" na /dokumenti.
 *
 * Objašnjava mail-lijevak i pokazuje ISTU prijemnu adresu koju prikazuju
 * Postavke → Uvoz iz e-maila — isti izvor podataka (`useMailInbox`), bez
 * druge kopije logike.
 */
export const DocumentsEmptyState = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { alias, loading, ensureAlias } = useMailInbox(true);

  useEffect(() => {
    if (!loading && !alias) ensureAlias();
  }, [loading, alias, ensureAlias]);

  const address = alias ? aliasToAddress(alias.alias_local) : '';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      showSuccess(t('mailImport.copied', 'Adresa kopirana'));
    } catch {
      showError(t('mailImport.copyFailed', 'Kopiranje nije uspjelo'));
    }
  };

  return (
    <div className="space-y-4 rounded-xl border p-4" data-testid="documents-empty-state">
      <p className="text-sm text-muted-foreground">
        {t(
          'documents.empty.intro',
          'Ovdje stižu računi, ponude i izvodi koje proslijediš na svoju Centar adresu. Proslijedi bilo koji mail s računom — Centar ga pročita i pripremi za tvoju potvrdu.'
        )}
      </p>

      <div className="flex items-start gap-3">
        <Mail className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{t('mailImport.yourAddress', 'Tvoja adresa za primanje')}</p>
          <p className="mt-1 break-all font-mono text-sm">
            {address || t('common.loading', 'Učitavanje...')}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          className="min-h-[44px]"
          onClick={handleCopy}
          disabled={!address}
        >
          <Copy className="mr-2 h-4 w-4" />
          {t('mailImport.copy', 'Kopiraj')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="min-h-[44px]"
          onClick={() => navigate('/home?openSettings=mail')}
        >
          <Settings2 className="mr-2 h-4 w-4" />
          {t('documents.empty.settingsLink', 'Postavke uvoza')}
        </Button>
      </div>
    </div>
  );
};
