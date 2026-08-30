import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { hr as hrLocale } from 'date-fns/locale';
import { Inbox } from 'lucide-react';
import { useMailImportQuota, quotaRenewalDate } from '@/hooks/useMailImportQuota';

/**
 * Diskretan prikaz mjesečne kvote uvoza iz maila na ekranu Dokumenti.
 * Kad je kvota iscrpljena, jasno kaže kada se obnavlja.
 */
export const MailQuotaStrip = ({ active = true }: { active?: boolean }) => {
  const { t } = useTranslation();
  const { used, limit, loading } = useMailImportQuota(active);

  if (loading || limit <= 0) return null;

  const left = Math.max(0, limit - used);
  const exhausted = left === 0;
  const renewal = format(quotaRenewalDate(), 'd.M.yyyy.', { locale: hrLocale });

  return (
    <div
      className={`mt-3 flex items-start gap-2 rounded-xl border px-3 py-2 text-xs ${
        exhausted
          ? 'border-amber-500/40 bg-amber-500/5 text-amber-600 dark:text-amber-400'
          : 'border-border/60 text-muted-foreground'
      }`}
    >
      <Inbox className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <p>
        {exhausted
          ? t(
              'documents.quota.exhausted',
              'Mjesečna kvota uvoza je iskorištena ({{used}}/{{limit}}). Obnavlja se {{date}}.',
            )
              .replace('{{used}}', String(used))
              .replace('{{limit}}', String(limit))
              .replace('{{date}}', renewal)
          : t('documents.quota.status', 'Uvozi ovaj mjesec: {{used}}/{{limit}} · preostalo {{left}}')
              .replace('{{used}}', String(used))
              .replace('{{limit}}', String(limit))
              .replace('{{left}}', String(left))}
      </p>
    </div>
  );
};
