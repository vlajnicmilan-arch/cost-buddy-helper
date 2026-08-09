import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, RotateCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { useMailInbox } from '@/hooks/useMailInbox';
import { useMailDiscardedItems } from '@/hooks/useMailDiscardedItems';
import { formatHrAmount } from '@/lib/money';

/** Stanja iz kojih korisnik smije ručno pokrenuti obradu. */
const RETRYABLE = ['neuspjela_konacno', 'zaustavljena_branom', 'ceka_kvotu'];

/**
 * Ekran Dokumenti → tab „Primljeno" (arhiva).
 *
 * Dvije liste: sirove primljene poruke (s ručnim ponovnim pokretanjem) i
 * odbačene stavke zadnjih 30 dana, koje se jednim dodirom vraćaju na pregled.
 */
export const DocumentsReceivedTab = ({
  active,
  onCountChange,
}: {
  active: boolean;
  onCountChange?: () => void;
}) => {
  const { t } = useTranslation();
  const { messages, loading, refetch } = useMailInbox(active);
  const { items: discarded, loading: discardedLoading, working, restoreItem } =
    useMailDiscardedItems(active);
  const [retrying, setRetrying] = useState<string | null>(null);

  const handleRetry = async (messageId: string) => {
    setRetrying(messageId);
    try {
      const { error } = await supabase.rpc('mail_ingest_retry_message', {
        p_message_id: messageId,
      });
      if (error) throw error;
      showSuccess(t('mailImport.retryQueued', 'Poruka je vraćena u obradu'));
      await refetch();
    } catch (e) {
      console.warn('[DocumentsReceivedTab] retry failed:', (e as Error).message);
      showError(t('mailImport.retryFailed', 'Ponovno pokretanje nije uspjelo'));
    } finally {
      setRetrying(null);
    }
  };

  const handleRestore = async (itemId: string) => {
    const ok = await restoreItem(itemId);
    if (ok) {
      onCountChange?.();
      showSuccess(t('documents.restored', 'Dokument je vraćen na pregled'));
    } else {
      showError(t('documents.restoreFailed', 'Vraćanje nije uspjelo'));
    }
  };

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="text-sm font-medium">
          {t('documents.discarded.title', 'Odbačeno (zadnjih 30 dana)')}
        </h2>
        {discardedLoading ? (
          <p className="text-xs text-muted-foreground">{t('common.loading', 'Učitavanje...')}</p>
        ) : discarded.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {t('documents.discarded.empty', 'Nema odbačenih dokumenata.')}
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {discarded.map((item) => {
              const e = (item.extraction ?? {}) as Record<string, unknown>;
              return (
                <li key={item.id} className="flex flex-wrap items-center gap-2 p-3 text-xs">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium break-all">
                      {String(e.supplier_name ?? item.subject ?? t('mailImport.noSubject', '(bez naslova)'))}
                    </div>
                    <div className="text-muted-foreground break-all">
                      {String(e.invoice_number ?? '—')} ·{' '}
                      {formatHrAmount(e.total_amount as number | string) || '—'}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-[44px]"
                    disabled={working}
                    onClick={() => handleRestore(item.id)}
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    {t('documents.restore', 'Vrati')}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">
          {t('mailImport.recent', 'Zadnjih 20 primljenih poruka')}
        </h2>
        {loading ? (
          <p className="text-xs text-muted-foreground">{t('common.loading', 'Učitavanje...')}</p>
        ) : messages.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {t('mailImport.empty', 'Još nema primljenih poruka.')}
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {messages.map((m) => (
              <li key={m.id} className="p-3 text-xs">
                <div className="font-medium break-all">
                  {m.subject || t('mailImport.noSubject', '(bez naslova)')}
                </div>
                <div className="text-muted-foreground break-all">{m.from_header || '—'}</div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
                  <span>{new Date(m.received_at).toLocaleString()}</span>
                  <span>
                    {t('mailImport.status', 'Status')}: {t(`mailImport.state.${m.status}`, m.status)}
                  </span>
                  <span>
                    {t('mailImport.attachments', 'Privitci')}: {m.attachment_count}
                  </span>
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
      </section>
    </div>
  );
};
