import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCurrency } from '@/contexts/CurrencyContext';
import type { IncomingInvoice } from '@/hooks/useIncomingInvoices';
import { invoiceNumberLabel } from '@/lib/eracun/invoiceLabel';

export interface MarkPaidResult {
  paymentDate: Date;
  paymentSource: string;
}

interface Props {
  invoice: IncomingInvoice | null;
  onOpenChange: (open: boolean) => void;
  paymentSources: Array<{ id: string; name: string }>;
  saving: boolean;
  onConfirm: (result: MarkPaidResult) => void;
}

/**
 * Datum plaćanja se NE pretpostavlja tiho: današnji je samo prijedlog,
 * vidljiv je i izmjenjiv jer upravo taj datum ide u trošak i time u saldo.
 */
export const MarkPaidDialog = ({ invoice, onOpenChange, paymentSources, saving, onConfirm }: Props) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const [paymentDate, setPaymentDate] = useState<Date>(new Date());
  const [dateOpen, setDateOpen] = useState(false);
  const [paymentSource, setPaymentSource] = useState<string>('');

  const defaultSource = useMemo(
    () => (paymentSources[0] ? `custom:${paymentSources[0].id}` : 'cash'),
    [paymentSources],
  );

  useEffect(() => {
    if (invoice) {
      setPaymentDate(new Date());
      setPaymentSource(defaultSource);
    }
  }, [invoice, defaultSource]);

  return (
    <Dialog open={!!invoice} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('eracun.paid.title', 'Označi kao plaćeno')}</DialogTitle>
        </DialogHeader>

        {invoice && (
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-muted/40">
              <p className="text-sm font-medium truncate">
                {invoice.supplier_name || invoice.supplier_oib}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {invoiceNumberLabel(invoice.invoice_number)} · {formatAmount(Number(invoice.total_amount))}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t('eracun.paid.dateLabel', 'Datum plaćanja')}</Label>
              <Popover open={dateOpen} onOpenChange={setDateOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start min-h-[44px] font-normal">
                    <CalendarIcon className="w-4 h-4 mr-2" />
                    {format(paymentDate, 'd. MMMM yyyy', { locale: hr })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={paymentDate}
                    onSelect={(d) => {
                      if (d) setPaymentDate(d);
                      setDateOpen(false);
                    }}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              <p className="text-[11px] text-muted-foreground">
                {t('eracun.paid.dateHint', 'Predložen je današnji datum — promijeni ga ako je plaćanje bilo ranije. Taj datum ide u trošak i saldo.')}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t('eracun.paid.sourceLabel', 'Izvor plaćanja')}</Label>
              <Select value={paymentSource} onValueChange={setPaymentSource}>
                <SelectTrigger className="min-h-[44px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {paymentSources.map((s) => (
                    <SelectItem key={s.id} value={`custom:${s.id}`}>{s.name}</SelectItem>
                  ))}
                  <SelectItem value="cash">{t('paymentSources.cash', 'Gotovina')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 min-h-[44px]" onClick={() => onOpenChange(false)} disabled={saving}>
                {t('common.cancel', 'Odustani')}
              </Button>
              <Button
                className="flex-1 min-h-[44px]"
                disabled={saving || !paymentSource}
                onClick={() => onConfirm({ paymentDate, paymentSource })}
              >
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {t('eracun.paid.confirm', 'Zabilježi plaćanje')}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
