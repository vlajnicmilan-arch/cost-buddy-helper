import { useTranslation } from 'react-i18next';
import { XCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { ProjectPendingTransaction } from '@/hooks/useProjectPendingTransactions';

interface RejectedTransactionsStripProps {
  rejectedTransactions: ProjectPendingTransaction[];
  formatAmount: (amount: number) => string;
}

/**
 * Korak E — odbijeni zapisi ostaju vidljivi s razlogom, ali ne ulaze
 * ni u jedan zbroj (saldo, faze, marža, izvještaji).
 */
export const RejectedTransactionsStrip = ({
  rejectedTransactions,
  formatAmount,
}: RejectedTransactionsStripProps) => {
  const { t } = useTranslation();

  if (rejectedTransactions.length === 0) return null;

  return (
    <Card className="p-3 space-y-2 border-destructive/30 bg-destructive/5">
      <div className="flex items-center gap-2 text-sm font-medium">
        <XCircle className="w-4 h-4 text-destructive" />
        {t('projects.rejectedTransactions')} ({rejectedTransactions.length})
      </div>
      <p className="text-xs text-muted-foreground">{t('projects.rejectedNoEffect')}</p>
      <ul className="space-y-2">
        {rejectedTransactions.map(tx => (
          <li key={tx.id} className="text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate line-through text-muted-foreground">{tx.description}</span>
              <span className="shrink-0 text-muted-foreground">{formatAmount(Number(tx.amount))}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('projects.rejectionReason')}:{' '}
              {tx.rejection_reason === 'auto_reject_expired'
                ? t('projects.autoRejectExpired')
                : tx.rejection_reason || '—'}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
};
