import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { hr, de, enUS } from 'date-fns/locale';
import { Merge, CreditCard, Landmark, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useCurrency } from '@/contexts/CurrencyContext';
import type { MergeCandidateOffer } from '@/hooks/useMergeCandidate';

const RAW_PREVIEW_CHARS = 90;
/** Znak za prazno polje (nije tekst). */
const EMPTY = '—';

interface Props {
  offer: MergeCandidateOffer;
  walletName: string | null;
  disabled: boolean;
  onMerge: (bankId: string) => void;
}

/** Jedan bankovni kandidat u ponudi spajanja — sve što i gdje piše u banci. */
export const MergeOfferCandidateCard = ({ offer, walletName, disabled, onMerge }: Props) => {
  const { t, i18n } = useTranslation();
  const { formatAmount } = useCurrency();
  const [expanded, setExpanded] = useState(false);
  const locale = i18n.language === 'hr' ? hr : i18n.language === 'de' ? de : enUS;
  const { row } = offer;

  const fmtDate = (d: string | Date | null | undefined) => {
    if (!d) return EMPTY;
    const x = d instanceof Date ? d : new Date(d);
    return Number.isNaN(x.getTime()) ? EMPTY : format(x, 'dd.MM.yyyy', { locale });
  };

  const bankText = (row.merchant_name ?? '').trim() || (row.description ?? '').trim() || EMPTY;
  const raw = (row.bank_raw_line ?? '').trim();
  const rawShown = expanded || raw.length <= RAW_PREVIEW_CHARS ? raw : `${raw.slice(0, RAW_PREVIEW_CHARS)}…`;

  return (
    <div className="p-3 rounded-lg border bg-muted/40 space-y-2 text-left">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {t('duplicates.offer.bookedOn')}: <span className="font-medium text-foreground">{fmtDate(row.date as string)}</span>
        </span>
        <span className={`font-bold ${row.type === 'income' ? 'text-income' : 'text-destructive'}`}>
          {row.type === 'expense' ? '-' : ''}{formatAmount(Number(row.amount))}
        </span>
      </div>

      <div>
        <p className="text-[11px] uppercase text-muted-foreground">{t('duplicates.offer.bankText')}</p>
        <p className="text-sm font-medium break-words">{bankText}</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {offer.merchantSimilar && <Badge className="text-[10px]">{t('duplicates.offer.similar')}</Badge>}
        <Badge variant="outline" className="text-[10px] gap-1">
          {offer.origin === 'sync' ? <Landmark className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
          {offer.origin === 'sync' ? t('duplicates.offer.originSync') : t('duplicates.offer.originStatement')}
          {offer.arrivedAt && ` · ${t('duplicates.offer.arrived', { date: fmtDate(offer.arrivedAt) })}`}
        </Badge>
        {walletName && (
          <Badge variant="outline" className="text-[10px]">{t('duplicates.offer.wallet')}: {walletName}</Badge>
        )}
        {row.card_last4 && (
          <Badge variant="outline" className="text-[10px] gap-1 font-mono">
            <CreditCard className="w-3 h-3" />••{row.card_last4}
          </Badge>
        )}
      </div>

      {raw && (
        <div>
          <p className="text-[11px] uppercase text-muted-foreground">{t('duplicates.offer.rawLine')}</p>
          <p className="text-xs font-mono break-words text-muted-foreground">{rawShown}</p>
          {raw.length > RAW_PREVIEW_CHARS && (
            <button
              type="button"
              className="text-xs text-primary underline min-h-[44px]"
              onClick={() => setExpanded(v => !v)}
            >
              {expanded ? t('duplicates.offer.showLess') : t('duplicates.offer.showMore')}
            </button>
          )}
        </div>
      )}

      <Button type="button" className="w-full min-h-[44px]" disabled={disabled} onClick={() => onMerge(row.id)}>
        <Merge className="w-4 h-4 mr-2" />
        {t('duplicates.offer.mergeThis')}
      </Button>
    </div>
  );
};
