/**
 * Pregled i potvrda spajanja uplata iz izvoda s izlaznim računima.
 *
 * Isti obrazac kao `ImportReview`: prijedlozi u listi, korisnik potvrđuje.
 * Ništa se ne spaja tiho — automatski je predoznačen samo jednoznačan pogodak
 * po pozivu na broj. Spajanje ne stvara ni prihod ni trošak.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { Info, Loader2, Link2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useCurrency } from '@/contexts/CurrencyContext';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { describeDbError } from '@/lib/eracun/dbError';
import type { IncomingInvoice } from '@/hooks/useIncomingInvoices';
import { useEracunPaymentMatch } from '@/hooks/useEracunPaymentMatch';
import type { MatchCandidate, MatchTransaction } from '@/lib/eracun/matchPayments';
import { invoiceNumberLabel } from '@/lib/eracun/invoiceLabel';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoices: readonly IncomingInvoice[];
  onDone: () => void;
}

export const PaymentMatchReview = ({ open, onOpenChange, invoices, onDone }: Props) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const { suggestions, transactions, loading, confirm } = useEracunPaymentMatch(invoices);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [choice, setChoice] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  const txById = useMemo(
    () => new Map(transactions.map((x) => [x.id, x])),
    [transactions],
  );
  const invById = useMemo(() => new Map(invoices.map((i) => [i.id, i])), [invoices]);

  useEffect(() => {
    if (!open) return;
    const next: Record<string, boolean> = {};
    suggestions.forEach((s) => { next[s.transactionId] = s.autoSelect; });
    setSelected(next);
    setChoice({});
  }, [open, suggestions]);

  const reasonLabel = (candidate: MatchCandidate) => {
    if (candidate.reason === 'payment_reference') return t('eracun.match.reasonReference', 'Poziv na broj');
    if (candidate.reason === 'learned_iban') return t('eracun.match.reasonIban', 'Naučeni IBAN');
    return t('eracun.match.reasonAmountName', 'Iznos + naziv');
  };

  const describeCandidate = (candidate: MatchCandidate) =>
    candidate.invoiceIds
      .map((id) => {
        const inv = invById.get(id);
        if (!inv) return id;
        return `${invoiceNumberLabel(inv.invoice_number)} · ${formatAmount(Number(candidate.allocation[id] ?? 0))}`;
      })
      .join(' + ');

  const handleConfirm = async () => {
    const picks = suggestions
      .filter((s) => selected[s.transactionId])
      .map((s) => {
        const tx = txById.get(s.transactionId) as MatchTransaction;
        return { transaction: tx, candidate: s.candidates[choice[s.transactionId] ?? 0] };
      })
      .filter((p) => p.transaction && p.candidate);
    if (picks.length === 0) return;
    setSaving(true);
    try {
      const n = await confirm(picks);
      showSuccess(t('eracun.match.done', 'Spojeno uplata: {{n}}', { n }));
      onDone();
      onOpenChange(false);
    } catch (err) {
      console.error('[eRacun] payment match failed', err);
      showError(t('eracun.match.failed', 'Spajanje nije uspjelo: {{reason}}', {
        reason: describeDbError(err, t('eracun.error.unknownDb', 'Nepoznata greška baze')),
      }));
    }
    setSaving(false);
  };

  const selectedCount = suggestions.filter((s) => selected[s.transactionId]).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('eracun.match.title', 'Poveži uplate s računima')}</DialogTitle>
          <DialogDescription>
            {t('eracun.match.subtitle', 'Spajanje ne stvara prihod ni trošak i ne mijenja saldo — uplata je već zabilježena iz izvoda.')}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : suggestions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {t('eracun.match.empty', 'Nema prijedloga za spajanje.')}
          </p>
        ) : (
          <div className="space-y-3">
            {suggestions.map((s) => {
              const tx = txById.get(s.transactionId);
              if (!tx) return null;
              const idx = choice[s.transactionId] ?? 0;
              const candidate = s.candidates[idx];
              return (
                <div key={s.transactionId} className="p-3 rounded-lg border bg-card space-y-2">
                  <div className="flex items-start gap-2">
                    <Checkbox
                      checked={!!selected[s.transactionId]}
                      onCheckedChange={(v) =>
                        setSelected((prev) => ({ ...prev, [s.transactionId]: v === true }))
                      }
                      className="mt-1"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {formatAmount(tx.amount)} · {format(new Date(tx.date), 'd. MMM yyyy', { locale: hr })}
                      </p>
                      <p className="text-[11px] text-muted-foreground line-clamp-2">{tx.description}</p>
                    </div>
                  </div>

                  <div className="pl-7 space-y-1">
                    <div className="flex flex-wrap items-center gap-1">
                      <Link2 className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-sm">{describeCandidate(candidate)}</span>
                      <Badge variant="secondary" className="text-[10px]">{reasonLabel(candidate)}</Badge>
                      {candidate.partial && (
                        <Badge variant="outline" className="text-[10px]">
                          {t('eracun.match.partial', 'Djelomično')}
                        </Badge>
                      )}
                    </div>

                    {candidate.oldestFallback && (
                      <p className="text-[11px] text-muted-foreground flex items-start gap-1">
                        <Info className="w-3 h-3 mt-0.5 shrink-0" />
                        {t('eracun.match.oldestNote', 'Više računa iste druge strane ima isti iznos — predložen je najstariji nenaplaćeni.')}
                      </p>
                    )}

                    {s.candidates.length > 1 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {s.candidates.map((c, i) => (
                          <Button
                            key={c.invoiceIds.join('-')}
                            size="sm"
                            variant={i === idx ? 'default' : 'outline'}
                            className="h-7 text-[11px]"
                            onClick={() => setChoice((prev) => ({ ...prev, [s.transactionId]: i }))}
                          >
                            {c.invoiceIds.map((id) => invoiceNumberLabel(invById.get(id)?.invoice_number) || id).join(' + ')}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('common.cancel', 'Odustani')}
          </Button>
          <Button disabled={selectedCount === 0 || saving} onClick={handleConfirm}>
            {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            {t('eracun.match.confirm', 'Potvrdi ({{n}})', { n: selectedCount })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
