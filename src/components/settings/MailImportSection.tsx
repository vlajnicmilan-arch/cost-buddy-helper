import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { Mail, Copy, RotateCcw, Loader2, Inbox, RefreshCw } from 'lucide-react';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { useMailImportAccess } from '@/hooks/useMailImportAccess';
import { useMailInbox } from '@/hooks/useMailInbox';
import { MailReviewDialog } from '@/components/mail/MailReviewDialog';
import { supabase } from '@/integrations/supabase/client';
import { aliasToAddress } from '@/lib/mailAlias';

/** Stanja iz kojih korisnik smije ručno pokrenuti obradu. */
const RETRYABLE = ['neuspjela_konacno', 'zaustavljena_branom', 'ceka_kvotu'];

/**
 * Settings → "Uvoz iz e-maila" (korak 1).
 * Vidljivo samo uz pravo `mail_uvoz`. Prikaz je SIROV: adresa + zadnjih 20 poruka,
 * bez ijedne akcije nad porukama.
 */
export const MailImportSection = () => {
  const { t } = useTranslation();
  const { hasAccess, loading: accessLoading } = useMailImportAccess();
  const { alias, messages, loading, working, ensureAlias, regenerateAlias } = useMailInbox(hasAccess);
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
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">{t('mailImport.recent', 'Zadnjih 20 primljenih poruka')}</p>
          <Button
            variant="outline"
            size="sm"
            className="min-h-[44px]"
            onClick={() => setReviewOpen(true)}
          >
            <Inbox className="h-4 w-4 mr-2" />
            {t('mailReview.open', 'Na pregled')}
          </Button>
        </div>
        {loading ? (
          <p className="text-xs text-muted-foreground">{t('common.loading', 'Učitavanje...')}</p>
        ) : messages.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('mailImport.empty', 'Još nema primljenih poruka.')}</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {messages.map((m) => (
              <li key={m.id} className="p-3 text-xs">
                <div className="font-medium break-all">{m.subject || t('mailImport.noSubject', '(bez naslova)')}</div>
                <div className="text-muted-foreground break-all">{m.from_header || '—'}</div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
                  <span>{new Date(m.received_at).toLocaleString()}</span>
                  <span>
                    {t('mailImport.status', 'Status')}: {t(`mailImport.state.${m.status}`, m.status)}
                  </span>
                  <span>{t('mailImport.attachments', 'Privitci')}: {m.attachment_count}</span>
                </div>
                {RETRYABLE.includes(m.status) && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 min-h-[44px]"
                    disabled={retrying === m.id}
                    onClick={() => handleRetry(m.id)}
                  >
                    {retrying === m.id ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    {m.status === 'zaustavljena_branom'
                      ? t('mailImport.runManually', 'Pokreni ručno')
                      : t('mailImport.retry', 'Pokušaj ponovno')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <MailReviewDialog open={reviewOpen} onOpenChange={setReviewOpen} />

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
