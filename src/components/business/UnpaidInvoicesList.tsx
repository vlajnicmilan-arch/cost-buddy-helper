import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUnpaidInvoices } from '@/hooks/useUnpaidInvoices';
import { useCurrency } from '@/contexts/CurrencyContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Mail, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { SendInvoiceReminderDialog } from './SendInvoiceReminderDialog';
import type { ProjectInvoice } from '@/hooks/useProjectInvoices';

export const UnpaidInvoicesList = () => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const { unpaid, loading } = useUnpaidInvoices();
  const [reminderTarget, setReminderTarget] = useState<(ProjectInvoice & { remaining: number }) | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (unpaid.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        {t('invoices.widget.allPaid', 'Svi računi su plaćeni 🎉')}
      </p>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {unpaid.map(inv => (
          <div key={inv.id} className="p-3 rounded-lg border bg-card">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-sm">{inv.invoice_number}</p>
                  {inv.daysOverdue > 0 && (
                    <Badge variant="destructive" className="text-[10px] gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {t('invoices.widget.overdueDays', '{{n}} d', { n: inv.daysOverdue })}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">{inv.client_name}</p>
                {inv.due_date && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {t('invoices.dueShort', 'dospijeće')}: {format(new Date(inv.due_date), 'd. MMM yyyy', { locale: hr })}
                  </p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="font-semibold text-sm">{formatAmount(inv.remaining)}</p>
                <p className="text-[10px] text-muted-foreground">
                  {t('invoices.remaining', 'Preostalo')}
                </p>
              </div>
            </div>
            <div className="flex justify-end mt-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setReminderTarget(inv)}
              >
                <Mail className="w-3.5 h-3.5 mr-1" />
                {t('invoices.reminder.send', 'Pošalji podsjetnik')}
              </Button>
            </div>
          </div>
        ))}
      </div>

      <SendInvoiceReminderDialog
        invoice={reminderTarget}
        onOpenChange={(o) => !o && setReminderTarget(null)}
      />
    </>
  );
};
