import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, RotateCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { useMailInbox } from '@/hooks/useMailInbox';
import { useMailDiscardedItems } from '@/hooks/useMailDiscardedItems';
import { useMailStuckLinkedItems } from '@/hooks/useMailStuckLinkedItems';
import { formatHrAmount } from '@/lib/money';
import { describeDiscardedItem } from '@/lib/mail/discardedDescription';

/**
 * Stanja iz kojih korisnik smije ručno pokrenuti obradu.
 * 'zavrsena' je namjerno unutra: ponovna obrada OSVJEŽAVA postojeću stavku
 * (upsert po poruci+privitku), nikad ne stvara duplikat.
 */
const RETRYABLE = ['neuspjela', 'neuspjela_konacno', 'zaustavljena_branom', 'ceka_kvotu', 'zavrsena'];

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
      const { data, error } = await supabase.rpc('mail_ingest_retry_message', {
        p_message_id: messageId,
      });
      if (error) throw error;
      // RPC vraća `ok:false` bez greške (npr. 'stanje_ne_dopusta') — tiho
      // gutanje tog odgovora bilo je uzrok „ništa se ne dogodi" kvara.
      const result = (data ?? {}) as { ok?: boolean; reason?: string };
      if (result.ok === false) {
        console.warn('[DocumentsReceivedTab] retry refused:', result.reason);
        showError(
          `${t('mailImport.retryFailed', 'Ponovno pokretanje nije uspjelo')} (${result.reason ?? '?'})`,
        );
        return;
      }
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

  const handleRelease = async (itemId: string) => {
    const res = await releaseItem(itemId);
    if (res.ok) {
      onCountChange?.();
      showSuccess(t('documents.stuck.released', 'Dokument je vraćen na pregled'));
      return;
    }
    if (res.reason === 'uvoz_postoji') {
      showError(
        t('documents.stuck.hasImport', 'Uvoz iz ovog dokumenta postoji — ne može se vratiti.'),
      );
      return;
    }
    showError(t('documents.restoreFailed', 'Vraćanje nije uspjelo'));
  };

  return (
    <div className="space-y-6">
      {(stuckLoading || stuck.length > 0) && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">
            {t('documents.stuck.title', 'Označeno obrađenim bez uvoza')}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t(
              'documents.stuck.hint',
              'Ovi dokumenti stoje kao obrađeni, ali iza njih nema nijednog uvoza. Vrati ih na pregled da ih možeš obraditi ili odbiti.',
            )}
          </p>
          {stuckLoading ? (
            <p className="text-xs text-muted-foreground">{t('common.loading', 'Učitavanje...')}</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {stuck.map((item) => {
                const e = (item.extraction ?? {}) as Record<string, unknown>;
                return (
                  <li
                    key={item.id}
                    data-testid="stuck-linked-item"
                    className="flex flex-wrap items-center gap-2 p-3 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium break-all">
                        {String(
                          e.bank_name ??
                            e.supplier_name ??
                            item.subject ??
                            t('mailImport.noSubject', '(bez naslova)'),
                        )}
                      </div>
                      <div className="text-muted-foreground break-all">
                        {new Date(item.updated_at).toLocaleString()}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-[44px]"
                      disabled={stuckWorking}
                      onClick={() => handleRelease(item.id)}
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      {t('documents.stuck.release', 'Vrati u obradu')}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

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
              const desc = describeDiscardedItem({
                classification: item.classification,
                extraction: item.extraction,
                subject: item.subject,
              });
              return (
                <li
                  key={item.id}
                  data-testid="discarded-item"
                  className="flex flex-wrap items-center gap-2 p-3 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    {desc.kind === 'special' ? (
                      <>
                        <div className="font-medium break-all">
                          {t(desc.titleKey, desc.titleFallback)}
                        </div>
                        <div className="text-muted-foreground break-all">
                          {t(desc.reasonKey, desc.reasonFallback)}
                        </div>
                        {item.subject && (
                          <div className="text-muted-foreground break-all">{item.subject}</div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="font-medium break-all">
                          {String(
                            e.supplier_name ?? item.subject ?? t('mailImport.noSubject', '(bez naslova)'),
                          )}
                        </div>
                        <div className="text-muted-foreground break-all">
                          {String(e.invoice_number ?? '—')} ·{' '}
                          {formatHrAmount(e.total_amount as number | string) || '—'}
                        </div>
                      </>
                    )}
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
                {m.last_error && (
                  <div className="mt-1 text-document-pending">
                    {t(`mailImport.reason.${m.last_error}`, m.last_error)}
                  </div>
                )}

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
                      : m.status === 'zavrsena'
                        ? t('mailImport.reprocess', 'Ponovno obradi')
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
