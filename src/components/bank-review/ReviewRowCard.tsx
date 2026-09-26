import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { isIncomeType } from '@/lib/spendClassification';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ReviewCandidate, ReviewChoice, ReviewQueueItem } from '@/lib/bankSyncReview/decision';

export interface WalletOption {
  id: string;
  name: string;
}

interface Props {
  item: ReviewQueueItem;
  candidates: ReviewCandidate[];
  wallets: WalletOption[];
  busy: boolean;
  onDecide: (choice: ReviewChoice) => void;
}

const money = (n: number, currency: string) => `${Number(n).toFixed(2)} ${currency}`;
const day = (iso: string) => {
  try {
    return format(new Date(iso), 'dd.MM.yyyy.');
  } catch {
    return iso;
  }
};

export function ReviewRowCard({ item, candidates, wallets, busy, onDecide }: Props) {
  const { t } = useTranslation();
  const [transferOpen, setTransferOpen] = useState(false);
  const [counterpart, setCounterpart] = useState<string>('');
  const p = item.payload;
  const walletName = (ref: string | null) => {
    const id = ref?.startsWith('custom:') ? ref.slice(7) : ref;
    return wallets.find((w) => w.id === id)?.name ?? t('bankReview.unknownWallet');
  };
  const targets = wallets.filter((w) => w.id !== p.wallet_id);
  const letters = ['A', 'B', 'C', 'D'];

  return (
    <article className="rounded-xl border border-border bg-card p-3 space-y-3" data-testid="review-row">
      <header className="space-y-1">
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-medium break-words">{p.description || t('bankReview.noDescription')}</span>
          <span className="shrink-0 font-mono text-sm">
            {isIncomeType(p) ? '+' : '−'}
            {money(p.amount, p.currency)}
          </span>
        </div>
        <div className="text-xs text-muted-foreground">
          {day(p.date)} · {walletName(p.wallet_id)}
        </div>
        <div className="text-xs text-muted-foreground">{t(`bankReview.reason.${item.reason}`)}</div>
        {p.bank_raw_line && (
          <p className="text-[11px] text-muted-foreground font-mono break-words">{p.bank_raw_line}</p>
        )}
      </header>

      {candidates.length > 0 && (
        <ul className="space-y-2">
          {candidates.map((c, i) => (
            <li key={c.id} className="rounded-lg bg-muted/40 p-2 flex items-center justify-between gap-2">
              <div className="min-w-0 text-xs">
                <div className="font-medium truncate">{c.description || t('bankReview.noDescription')}</div>
                <div className="text-muted-foreground">
                  {day(c.date)} · {money(c.amount, p.currency)} · {walletName(c.payment_source)}
                </div>
              </div>
              <Button
                size="sm"
                className="h-11 shrink-0"
                disabled={busy}
                onClick={() => onDecide({ kind: 'merge', targetId: c.id })}
              >
                {t('bankReview.mergeWith', { label: letters[i] ?? String(i + 1) })}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {transferOpen ? (
        <div className="space-y-2">
          <Label className="text-xs">{t('bankReview.transferTarget')}</Label>
          <Select value={counterpart} onValueChange={setCounterpart}>
            <SelectTrigger className="h-11" aria-label={t('bankReview.transferTarget')}>
              <SelectValue placeholder={t('bankReview.transferPick')} />
            </SelectTrigger>
            <SelectContent>
              {targets.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Button variant="ghost" className="h-11 flex-1" onClick={() => setTransferOpen(false)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button
              className="h-11 flex-1"
              disabled={busy || !counterpart}
              onClick={() => onDecide({ kind: 'transfer', counterpartSourceId: counterpart })}
            >
              {t('bankReview.transferConfirm')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <Button variant="outline" className="h-11" disabled={busy} onClick={() => onDecide({ kind: 'new' })}>
            {t('bankReview.newRow')}
          </Button>
          <Button
            variant="outline"
            className="h-11"
            disabled={busy || targets.length === 0}
            onClick={() => setTransferOpen(true)}
          >
            {t('bankReview.transfer')}
          </Button>
          <Button variant="ghost" className="h-11" disabled={busy} onClick={() => onDecide({ kind: 'dismiss' })}>
            {t('bankReview.dismiss')}
          </Button>
        </div>
      )}
    </article>
  );
}
