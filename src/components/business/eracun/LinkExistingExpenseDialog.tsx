/**
 * Povezivanje ulaznog računa s POSTOJEĆIM troškom.
 *
 * Isti obrazac kao `PaymentMatchReview`, ali okrenut: polazi se od jednog
 * računa i traži se trošak koji ga je već platio. Ništa nije predoznačeno —
 * svaki kandidat nosi PUNI opis i datum troška da ga korisnik može odbiti
 * pogledom (npr. „LIDL" nikad nije Vodovod).
 *
 * Povezivanje ne stvara ni trošak ni prihod i ne dira saldo — sve ide kroz
 * RPC `eracun_link_existing_expense`.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { Info, Link2, Loader2, Search, Unlink } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useCurrency } from '@/contexts/CurrencyContext';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { describeDbError } from '@/lib/eracun/dbError';
import type { IncomingInvoice } from '@/hooks/useIncomingInvoices';
import type { MatchConfidence, MatchTransaction } from '@/lib/eracun/matchPayments';
import type { RankedLinkCandidate } from '@/lib/eracun/linkCandidates';
import type { LinkedExpenseRow } from '@/hooks/useEracunExpenseMatch';

export interface LinkSuggestionRow {
  readonly transaction: MatchTransaction;
  readonly amount: number;
  readonly confidence: MatchConfidence;
}

interface Props {
  invoice: IncomingInvoice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suggestions: readonly LinkSuggestionRow[];
  /** Jednoznačan par — istaknut prijedlog s jednim dodirom (nikad automatski). */
  highlight?: RankedLinkCandidate | null;
  links: readonly LinkedExpenseRow[];
  loading: boolean;
  search: (query: string) => MatchTransaction[];
  onLink: (invoiceId: string, expenseId: string, amount: number) => Promise<void>;
  onUnlink: (invoiceId: string, expenseId: string) => Promise<void>;
  onDone: () => void;
  /** Pretprovjera s gumba „Plaćeno" — nudi i izlaz „ipak stvori novi trošak". */
  precheck?: boolean;
  onCreateAnyway?: () => void;
}

export const LinkExistingExpenseDialog = ({
  invoice, open, onOpenChange, suggestions, highlight, links, loading,
  search, onLink, onUnlink, onDone, precheck, onCreateAnyway,
}: Props) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  const remaining = invoice
    ? Math.round((Number(invoice.total_amount) - Number(invoice.settled_amount ?? 0)) * 100) / 100
    : 0;
  const isPaid = !!invoice?.paid_at;

  const searchResults = useMemo(() => (query.trim() ? search(query) : []), [query, search]);

  const confidenceLabel = (c: MatchConfidence) => {
    if (c === 'certain') return t('eracun.linkExpense.confidenceCertain', 'Siguran');
    if (c === 'strong') return t('eracun.linkExpense.confidenceStrong', 'Jak');
    if (c === 'likely') return t('eracun.linkExpense.confidenceLikely', 'Vjerojatan');
    return t('eracun.linkExpense.confidencePossible', 'Moguć');
  };

  const doLink = async (expenseId: string, amount: number) => {
    if (!invoice) return;
    setBusy(true);
    try {
      await onLink(invoice.id, expenseId, Math.min(amount, remaining));
      showSuccess(t('eracun.linkExpense.linked', 'Trošak je povezan s računom'));
      onDone();
      onOpenChange(false);
    } catch (err) {
      console.error('[eRacun] link existing expense failed', err, { invoiceId: invoice.id, expenseId });
      showError(t('eracun.linkExpense.failed', 'Povezivanje nije uspjelo: {{reason}}', {
        reason: describeDbError(err, t('eracun.error.unknownDb', 'Nepoznata greška baze')),
      }));
    }
    setBusy(false);
  };

  const doUnlink = async (expenseId: string) => {
    if (!invoice) return;
    setBusy(true);
    try {
      await onUnlink(invoice.id, expenseId);
      showSuccess(t('eracun.linkExpense.unlinked', 'Veza je uklonjena'));
      onDone();
    } catch (err) {
      console.error('[eRacun] unlink expense failed', err, { invoiceId: invoice.id, expenseId });
      showError(t('eracun.linkExpense.unlinkFailed', 'Odvezivanje nije uspjelo: {{reason}}', {
        reason: describeDbError(err, t('eracun.error.unknownDb', 'Nepoznata greška baze')),
      }));
    }
    setBusy(false);
  };

  const expenseRow = (tx: MatchTransaction, amount: number, badge?: MatchConfidence) => (
    <div key={tx.id} className="p-2 rounded-md border bg-card flex items-start gap-2 min-w-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {formatAmount(tx.amount)} · {format(new Date(tx.date), 'd. MMM yyyy', { locale: hr })}
        </p>
        {/* PUNI opis — korisnik mora vidjeti „LIDL" i odbiti prijedlog pogledom. */}
        <p className="text-[11px] text-muted-foreground break-words">
          {tx.description || tx.merchantName || '—'}
        </p>
        {badge && (
          <Badge variant="secondary" className="text-[10px] mt-1">{confidenceLabel(badge)}</Badge>
        )}
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={busy || isPaid}
        className="shrink-0 min-h-[36px]"
        onClick={() => doLink(tx.id, amount)}
      >
        <Link2 className="w-3.5 h-3.5 mr-1" />
        {t('eracun.linkExpense.link', 'Poveži')}
      </Button>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto w-[calc(100vw-2rem)]">
        <DialogHeader>
          <DialogTitle>
            {precheck
              ? t('eracun.linkExpense.precheckTitle', 'Ovakav trošak već postoji')
              : t('eracun.linkExpense.title', 'Poveži s postojećim troškom')}
          </DialogTitle>
          <DialogDescription>
            {precheck
              ? t('eracun.linkExpense.precheckSubtitle', 'Pronađen je trošak koji odgovara ovom računu. Poveži ga umjesto stvaranja novog — inače će isti novac biti zabilježen dvaput.')
              : t('eracun.linkExpense.subtitle', 'Povezivanje ne stvara novi trošak i ne mijenja saldo — bilježi se samo da je ovaj račun plaćen postojećom transakcijom.')}
          </DialogDescription>
        </DialogHeader>

        {invoice && (
          <p className="text-xs text-muted-foreground">
            {invoice.invoice_number} · {formatAmount(Number(invoice.total_amount))}
            {/* DATUMI NA EKRANU: bez njih se dva ista iznosa ne razlikuju. */}
            {invoice.issue_date && (
              <> · {t('eracun.linkExpense.issued', 'izdan')} {fmtDate(invoice.issue_date)}</>
            )}
            {invoice.due_date && (
              <> · {t('eracun.linkExpense.due', 'dospijeće')} {fmtDate(invoice.due_date)}</>
            )}
            {Number(invoice.settled_amount ?? 0) > 0 && (
              <> · {t('eracun.linkExpense.remaining', 'preostalo {{amount}}', { amount: formatAmount(remaining) })}</>
            )}
          </p>
        )}

        {links.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium">{t('eracun.linkExpense.linkedTitle', 'Povezani troškovi')}</p>
            {links.map((l) => (
              <div key={l.expenseId} className="p-2 rounded-md border bg-muted/40 flex items-start gap-2 min-w-0">
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    {formatAmount(l.amount)}
                    {l.date ? ` · ${format(new Date(l.date), 'd. MMM yyyy', { locale: hr })}` : ''}
                  </p>
                  <p className="text-[11px] text-muted-foreground break-words">{l.description || '—'}</p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  className="shrink-0 min-h-[36px]"
                  onClick={() => doUnlink(l.expenseId)}
                >
                  <Unlink className="w-3.5 h-3.5 mr-1" />
                  {t('eracun.linkExpense.unlink', 'Odveži')}
                </Button>
              </div>
            ))}
          </div>
        )}

        {!isPaid && (
          <>
            <div className="space-y-1">
              <p className="text-xs font-medium">{t('eracun.linkExpense.suggestionsTitle', 'Prijedlozi')}</p>
              {loading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : suggestions.length === 0 ? (
                <p className="text-xs text-muted-foreground flex items-start gap-1 py-2">
                  <Info className="w-3 h-3 mt-0.5 shrink-0" />
                  {t('eracun.linkExpense.noSuggestions', 'Nema prijedloga za ovaj račun. Potraži trošak ručno.')}
                </p>
              ) : (
                <div className="space-y-2">
                  {suggestions.map((s) => expenseRow(s.transaction, s.amount, s.candidate.confidence))}
                </div>
              )}
            </div>

            <div className="space-y-1">
              <p className="text-xs font-medium">{t('eracun.linkExpense.searchTitle', 'Ručna pretraga')}</p>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('eracun.linkExpense.searchPlaceholder', 'Iznos, datum ili opis')}
                  className="h-11 pl-7"
                />
              </div>
              {query.trim() && (
                searchResults.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">
                    {t('eracun.linkExpense.searchEmpty', 'Nema troška koji odgovara pretrazi.')}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {searchResults.map((tx) => expenseRow(tx, Math.min(tx.amount, remaining)))}
                  </div>
                )
              )}
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('common.cancel', 'Odustani')}
          </Button>
          {precheck && onCreateAnyway && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => { onOpenChange(false); onCreateAnyway(); }}
            >
              {t('eracun.linkExpense.createAnyway', 'Ipak stvori novi trošak')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
