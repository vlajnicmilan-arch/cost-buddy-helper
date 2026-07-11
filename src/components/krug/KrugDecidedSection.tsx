/**
 * KrugDecidedSection — read-only mini-povijest zadnjih odluka o shared
 * prijedlozima u ovom Krugu.
 *
 * NIJE approval queue. Nema akcija. Prikazuje samo:
 *   - opis / merchant
 *   - iznos
 *   - autor prijedloga
 *   - status (Potvrđeno / Odbijeno)
 *   - vrijeme odluke (updated_at)
 *
 * Klik na red otvara `TransactionDetailDialog` (isti path kao queue) da
 * korisnik može vidjeti detalje ili A5/A7 postupke — ali te akcije žive u
 * dialogu, ne u ovoj listi.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { History, Check, X, Loader2 } from 'lucide-react';
import { Expense } from '@/types/expense';
import { TransactionDetailDialog } from '@/components/TransactionDetailDialog';
import { useKrugDecidedExpenses } from '@/hooks/useKrugDecidedExpenses';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useUserProfiles } from '@/hooks/useUserProfiles';
import { getMemberDisplayName } from '@/lib/krugDisplay';
import { format } from 'date-fns';
import { hr, enUS, de } from 'date-fns/locale';
import { clickableProps } from '@/lib/a11y';

interface Props {
  krugId: string;
}

export function KrugDecidedSection({ krugId }: Props) {
  const { t, i18n } = useTranslation();
  const { formatAmount } = useCurrency();
  const { data: decided = [], isLoading } = useKrugDecidedExpenses(krugId);
  const [selected, setSelected] = useState<Expense | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const locale = i18n.language === 'en' ? enUS : i18n.language === 'de' ? de : hr;
  const authorIds = useMemo(
    () => Array.from(new Set(decided.map((e) => e.user_id).filter(Boolean) as string[])),
    [decided],
  );
  const profiles = useUserProfiles(authorIds);

  const openDetail = (e: Expense) => {
    setSelected(e);
    setDialogOpen(true);
  };
  const closeDetail = (open: boolean) => {
    setDialogOpen(open);
    if (!open) setSelected(null);
  };

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium flex items-center gap-2 text-module-muted">
        <History className="w-4 h-4 text-module-muted" />
        {t('krug.decided.title', 'Odlučeno')}
        {decided.length > 0 && (
          <span className="text-xs text-muted-foreground">({decided.length})</span>
        )}
      </h3>

      {isLoading ? (
        <Card className="p-4 text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          {t('common.loading', 'Učitavanje…')}
        </Card>
      ) : decided.length === 0 ? (
        <Card className="p-4 text-xs text-muted-foreground">
          {t('krug.decided.empty', 'Još nema odlučenih prijedloga.')}
        </Card>
      ) : (
        <Card className="divide-y divide-border">
          {decided.map((e) => {
            const confirmed = e.krug_shared_status === 'potvrdjena';
            const amountFormatted = formatAmount(
              Number(e.amount),
              (e.currency ?? undefined) as any,
            );
            const authorName = e.user_id
              ? getMemberDisplayName(
                  profiles.get(e.user_id),
                  e.user_id,
                  t('krug.member.unknown', 'Nepoznat član'),
                )
              : null;
            const decidedAtRaw = (e as any).updated_at as string | Date | undefined;
            const decidedAt = decidedAtRaw ? new Date(decidedAtRaw) : e.date;
            return (
              <div
                key={e.id}
                className="px-4 py-3 space-y-1 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                {...clickableProps(() => openDetail(e))}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <Badge
                      variant="secondary"
                      className={
                        'text-[10px] mb-1 ' +
                        (confirmed
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                          : 'bg-rose-500/15 text-rose-600 dark:text-rose-400')
                      }
                    >
                      {confirmed ? (
                        <Check className="w-3 h-3 mr-1 inline" />
                      ) : (
                        <X className="w-3 h-3 mr-1 inline" />
                      )}
                      {confirmed
                        ? t('krug.decided.status.confirmed', 'Potvrđeno')
                        : t('krug.decided.status.rejected', 'Odbijeno')}
                    </Badge>
                    <div className="text-sm font-medium truncate">
                      {e.description ||
                        e.merchant_name ||
                        t('krug.queue.noDescription', '(bez opisa)')}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {format(decidedAt, 'd. MMM yyyy.', { locale })}
                      {authorName ? ` · ${authorName}` : ''}
                    </div>
                  </div>
                  <div className="text-sm font-mono tabular-nums shrink-0">{amountFormatted}</div>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      <TransactionDetailDialog
        expense={selected}
        open={dialogOpen}
        onOpenChange={closeDetail}
        readOnlyKrug
        onEdit={() => {
          /* read-only trag — akcije žive u approval queue-u */
        }}
        onDelete={() => {
          closeDetail(false);
        }}
      />

    </section>
  );
}
