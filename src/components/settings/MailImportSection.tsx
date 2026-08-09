import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Mail, Copy, RotateCcw, Loader2, FileClock } from 'lucide-react';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { useMailImportAccess } from '@/hooks/useMailImportAccess';
import { useMailInbox } from '@/hooks/useMailInbox';
import { aliasToAddress } from '@/lib/mailAlias';

/**
 * Settings → „Uvoz iz e-maila".
 *
 * Postavke drže SAMO identitet kanala: adresu za primanje i njezinu obnovu.
 * Popis poruka, red „Na pregled" i arhiva žive na ekranu `/dokumenti` — jedan
 * dom za dokumente, bez druge kopije istog popisa.
 * Cijela sekcija je vidljiva isključivo uz pravo `mail_uvoz`.
 */
export const MailImportSection = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasAccess, loading: accessLoading } = useMailImportAccess();
  const { alias, loading, working, ensureAlias, regenerateAlias } = useMailInbox(hasAccess);
  const [confirmRegen, setConfirmRegen] = useState(false);

  useEffect(() => {
    if (hasAccess && !loading && !alias) {
      ensureAlias();
    }
  }, [hasAccess, loading, alias, ensureAlias]);

  if (accessLoading || !hasAccess) return null;

  const address = alias ? aliasToAddress(alias.alias_local) : '';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      showSuccess(t('mailImport.copied', 'Adresa kopirana'));
    } catch {
      showError(t('mailImport.copyFailed', 'Kopiranje nije uspjelo'));
    }
  };

  const handleRegenerate = async () => {
    try {
      await regenerateAlias();
      showSuccess(t('mailImport.regenerated', 'Nova adresa je stvorena'));
    } catch {
      showError(t('mailImport.regenerateFailed', 'Stvaranje nove adrese nije uspjelo'));
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        {t('mailImport.title', 'Uvoz iz e-maila')}
      </h3>

      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-start gap-3">
          <Mail className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{t('mailImport.yourAddress', 'Tvoja adresa za primanje')}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {t('mailImport.description', 'Pošalji ili proslijedi poštu na ovu adresu. U ovom koraku poruke se samo primaju i prikazuju.')}
            </p>
            <p className="mt-2 break-all font-mono text-sm">
              {address || (loading || working ? t('common.loading', 'Učitavanje...') : '—')}
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
            <Copy className="h-4 w-4 mr-2" />
            {t('mailImport.copy', 'Kopiraj')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="min-h-[44px]"
            onClick={() => setConfirmRegen(true)}
            disabled={!alias || working}
          >
            {working ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2" />}
            {t('mailImport.regenerate', 'Regeneriraj adresu')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="min-h-[44px]"
            onClick={() => navigate('/dokumenti')}
          >
            <FileClock className="h-4 w-4 mr-2 text-document-pending" />
            {t('documents.open', 'Otvori Dokumente')}
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmRegen} onOpenChange={setConfirmRegen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('mailImport.regenerateTitle', 'Regeneriraj adresu?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('mailImport.regenerateWarning', 'Stara adresa prestaje raditi odmah. Pošta poslana na nju više neće biti primljena.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Odustani')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleRegenerate}>
              {t('mailImport.regenerate', 'Regeneriraj adresu')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
