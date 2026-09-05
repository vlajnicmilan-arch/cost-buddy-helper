import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useCurrency } from '@/contexts/CurrencyContext';
import type { IncomingInvoice } from '@/hooks/useIncomingInvoices';
import { invoiceNumberLabel } from '@/lib/eracun/invoiceLabel';

export interface MarkCollectedResult {
  collectedDate: Date;
}

interface Props {
  invoice: IncomingInvoice | null;
  onOpenChange: (open: boolean) => void;
  saving: boolean;
  onConfirm: (result: MarkCollectedResult) => void;
}

/**
 * Naplata IZLAZNOG računa (`direction = 'out'`).
 *
 * Namjerna asimetrija prema ulaznim računima: ovdje se NE stvara nikakav
 * financijski zapis — ni prihod, ni trošak — i saldo se ne dira. Račun se samo
 * makne s popisa nenaplaćenih i dobije datum naplate. Prihod ulazi u aplikaciju
 * kroz uvoz bankovnog izvoda; da ga bilježimo i ovdje, isti novac bi ušao dvaput.
 * Nemoj ovo „popravljati" u simetriju s ulaznim računima.
 */
export const MarkCollectedDialog = ({ invoice, onOpenChange, saving, onConfirm }: Props) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const [collectedDate, setCollectedDate] = useState<Date>(new Date());
  const [dateOpen, setDateOpen] = useState(false);

  useEffect(() => {
    if (invoice) setCollectedDate(new Date());
  }, [invoice]);

  return (
    <Dialog open={!!invoice} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('eracun.collected.title', 'Označi kao naplaćeno')}</DialogTitle>
        </DialogHeader>

        {invoice && (
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-muted/40">
              <p className="text-sm font-medium truncate">
                {invoice.counterparty_name || invoice.counterparty_oib || invoice.supplier_name}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {invoiceNumberLabel(invoice.invoice_number)} · {formatAmount(Number(invoice.total_amount))}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t('eracun.collected.dateLabel', 'Datum naplate')}</Label>
              <Popover open={dateOpen} onOpenChange={setDateOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start min-h-[44px] font-normal">
                    <CalendarIcon className="w-4 h-4 mr-2" />
                    {format(collectedDate, 'd. MMMM yyyy', { locale: hr })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={collectedDate}
                    onSelect={(d) => {
                      if (d) setCollectedDate(d);
                      setDateOpen(false);
                    }}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <p className="text-[11px] text-muted-foreground">
              {t(
                'eracun.collected.noRevenueHint',
                'Ovime se ne bilježi prihod ni promjena salda — prihod ulazi kroz uvoz bankovnog izvoda.',
              )}
            </p>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 min-h-[44px]" onClick={() => onOpenChange(false)} disabled={saving}>
                {t('common.cancel', 'Odustani')}
              </Button>
              <Button
                className="flex-1 min-h-[44px]"
                disabled={saving}
                onClick={() => onConfirm({ collectedDate })}
              >
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {t('eracun.collected.confirm', 'Zabilježi naplatu')}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
