import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUnpaidInvoices } from '@/hooks/useUnpaidInvoices';
import { useCurrency } from '@/contexts/CurrencyContext';
import { AlertTriangle, FileText, ChevronRight } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { UnpaidInvoicesList } from './UnpaidInvoicesList';
import { clickableProps } from '@/lib/a11y';

/**
 * Dashboard widget shown in business chip view. Surfaces outstanding +
 * overdue invoice totals so the user can act on them without opening a
 * specific project.
 */
export const UnpaidInvoicesWidget = () => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const { totalOutstanding, overdueCount, overdueTotal, unpaid, buckets, loading } = useUnpaidInvoices();
  const [open, setOpen] = useState(false);

  if (loading || unpaid.length === 0) return null;

  const hasOverdue = overdueCount > 0;

  return (
    <>
      <div
        {...clickableProps(() => setOpen(true))}
        className="mb-4 p-3 rounded-2xl border border-border/50 hover:bg-muted/30 transition-colors"
        style={{ background: hasOverdue
          ? 'linear-gradient(135deg, hsl(var(--destructive) / 0.06) 0%, transparent 100%)'
          : 'linear-gradient(135deg, hsl(var(--primary) / 0.06) 0%, transparent 100%)' }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className={`w-4 h-4 shrink-0 ${hasOverdue ? 'text-destructive' : 'text-primary'}`} />
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground">
                {t('invoices.widget.title', 'Neplaćeni računi')}
              </p>
              <p className="text-sm font-bold truncate">
                {formatAmount(totalOutstanding)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {hasOverdue && (
              <div className="flex items-center gap-1 text-destructive">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">
                  {overdueCount} · {formatAmount(overdueTotal)}
                </span>
              </div>
            )}
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </div>
        </div>

        {hasOverdue && (
          <div className="mt-2 grid grid-cols-4 gap-1">
            {buckets.map(b => (
              <div key={b.label} className="text-center">
                <p className="text-[9px] text-muted-foreground uppercase">{b.label}</p>
                <p className={`text-[10px] font-semibold ${b.total > 0 ? 'text-destructive' : 'text-muted-foreground/60'}`}>
                  {b.total > 0 ? formatAmount(b.total) : '—'}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="h-[85vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              {t('invoices.widget.title', 'Neplaćeni računi')}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <UnpaidInvoicesList />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};
