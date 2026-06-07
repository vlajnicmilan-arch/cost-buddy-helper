/**
 * KrugApprovalQueue — lista pending (`predlozena`) shared transakcija u Krugu.
 *
 * Pravila:
 * - vidljivost = RLS na expenses (klijent NE dodaje filter)
 * - quick actions A1/A2 prikazujemo SAMO ako `decideApplyAct` vrati `ok_confirmed`/`ok_negated`
 *   za viewera; semantika je 1:1 s SQL RPC-om
 * - klik na red otvara `TransactionDetailDialog` — sva dublja akcija (A3/A4/A5/A7,
 *   privacy switch) ide kroz postojeći `KrugTransactionPanel` u dialogu
 * - dedup `client_request_id` za A1/A2 iz queue-a koristi crypto.randomUUID()
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Inbox, Check, X, Loader2 } from 'lucide-react';
import { Expense } from '@/types/expense';
import { TransactionDetailDialog } from '@/components/TransactionDetailDialog';
import { useKrugPendingExpenses } from '@/hooks/useKrugPendingExpenses';
import { useKrugApplyAct } from '@/hooks/useKrugAct';
import { decideApplyAct } from '@/lib/krugDecisions';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useUserProfiles } from '@/hooks/useUserProfiles';
import { getMemberDisplayName } from '@/lib/krugDisplay';
import { format } from 'date-fns';
import { hr, enUS, de } from 'date-fns/locale';
import { clickableProps } from '@/lib/a11y';

interface Props {
  krugId: string;
  viewerUserId: string | null;
  /** Owner se UVIJEK tretira kao punopravni (Krug Foundation v4.2). */
  viewerIsFullMember: boolean;
}

export function KrugApprovalQueue({ krugId, viewerUserId, viewerIsFullMember }: Props) {
  const { t, i18n } = useTranslation();
  const { formatAmount } = useCurrency();
  const { data: pending = [], isLoading } = useKrugPendingExpenses(krugId);
  const applyAct = useKrugApplyAct();
  const [selected, setSelected] = useState<Expense | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const locale = i18n.language === 'en' ? enUS : i18n.language === 'de' ? de : hr;
  const authorIds = useMemo(
    () => Array.from(new Set(pending.map((e) => e.user_id).filter(Boolean) as string[])),
    [pending],
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

  const canActOn = useMemo(() => {
    return (e: Expense) => {
      const isAuthor = !!viewerUserId && viewerUserId === e.user_id;
      const a1 = decideApplyAct({
        authenticated: !!viewerUserId,
        expenseFound: true,
        inSharedFlow: true,
        isAuthor,
        isFullMember: viewerIsFullMember,
        prevStatus: 'predlozena',
        act: 'A1',
        clientRequestId: 'probe',
      });
      const a2 = decideApplyAct({
        authenticated: !!viewerUserId,
        expenseFound: true,
        inSharedFlow: true,
        isAuthor,
        isFullMember: viewerIsFullMember,
        prevStatus: 'predlozena',
        act: 'A2',
        clientRequestId: 'probe',
      });
      return {
        canConfirm: a1 === 'ok_confirmed',
        canNegate: a2 === 'ok_negated',
      };
    };
  }, [viewerUserId, viewerIsFullMember]);

  const handleAct = async (e: Expense, act: 'A1' | 'A2') => {
    setActingId(e.id);
    try {
      await applyAct.mutateAsync({ expenseId: e.id, act });
    } finally {
      setActingId(null);
    }
  };

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium flex items-center gap-2">
        <Inbox className="w-4 h-4" />
        {t('krug.queue.title', 'Za odlučivanje')}
        {pending.length > 0 && (
          <Badge
            variant="secondary"
            className="text-[10px] bg-amber-500/15 text-amber-600 dark:text-amber-400"
          >
            {pending.length}
          </Badge>
        )}
      </h3>
      <p className="text-xs text-muted-foreground">
        {t(
          'krug.queue.subtitle',
          'Tvoja potvrda za zajedničke troškove koje su predložili članovi Kruga.',
        )}
      </p>

      {isLoading ? (
        <Card className="p-4 text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          {t('common.loading', 'Učitavanje…')}
        </Card>
      ) : pending.length === 0 ? (
        <Card className="p-4 text-xs text-muted-foreground">
          {t(
            'krug.queue.empty',
            'Nema prijedloga za potvrdu. Kad netko označi trošak kao "Za Krug", pojavit će se ovdje.',
          )}
        </Card>
      ) : (
        <Card className="divide-y divide-border">
          {pending.map((e) => {
            const { canConfirm, canNegate } = canActOn(e);
            const busy = actingId === e.id && applyAct.isPending;
            const amountFormatted = formatAmount(Number(e.amount), (e.currency ?? undefined) as any);
            const authorName = e.user_id
              ? getMemberDisplayName(
                  profiles.get(e.user_id),
                  e.user_id,
                  t('krug.member.unknown', 'Nepoznat član'),
                )
              : null;
            return (
              <div
                key={e.id}
                className="px-4 py-3 space-y-2 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                {...clickableProps(() => openDetail(e))}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <Badge
                      variant="secondary"
                      className="text-[10px] bg-amber-500/15 text-amber-600 dark:text-amber-400 mb-1"
                    >
                      {t('krug.queue.row.status', 'Predloženo za dijeljenje')}
                    </Badge>
                    <div className="text-sm font-medium truncate">
                      {e.description || t('krug.queue.noDescription', '(bez opisa)')}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {format(e.date, 'd. MMM yyyy.', { locale })}
                      {authorName ? ` · ${authorName}` : ''}
                      {e.merchant_name ? ` · ${e.merchant_name}` : ''}
                    </div>
                  </div>
                  <div className="text-sm font-mono tabular-nums shrink-0">{amountFormatted}</div>
                </div>
                {(canConfirm || canNegate) && (
                  <div
                    className="flex items-center justify-end gap-2"
                    onClick={(ev) => ev.stopPropagation()}
                  >
                    {canConfirm && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2.5 text-xs gap-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10"
                        disabled={busy}
                        aria-label={t('krug.queue.row.confirm', 'Potvrdi')}
                        onClick={() => handleAct(e, 'A1')}
                      >
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        {t('krug.queue.row.confirm', 'Potvrdi')}
                      </Button>
                    )}
                    {canNegate && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2.5 text-xs gap-1 text-rose-600 hover:text-rose-700 hover:bg-rose-500/10"
                        disabled={busy}
                        aria-label={t('krug.queue.row.reject', 'Odbij')}
                        onClick={() => handleAct(e, 'A2')}
                      >
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                        {t('krug.queue.row.reject', 'Odbij')}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      )}


      <TransactionDetailDialog
        expense={selected}
        open={dialogOpen}
        onOpenChange={closeDetail}
        onEdit={() => {
          /* edit ostaje izvan queue surfacea u v1 */
        }}
        onDelete={() => {
          closeDetail(false);
        }}
      />
    </section>
  );
}
