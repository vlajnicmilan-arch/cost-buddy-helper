import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ChevronRight, FileInput, FileOutput } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useIncomingInvoices } from '@/hooks/useIncomingInvoices';
import { summarizeIncomingInvoices } from '@/lib/eracun/incomingSummary';
import { clickableProps } from '@/lib/a11y';
import { IncomingInvoicesPanel } from './IncomingInvoicesPanel';

interface IncomingInvoicesWidgetProps {
  /** Visual variant, mirrors UnpaidInvoicesWidget. */
  variant?: 'default' | 'monarch';
}

/**
 * Dashboard blok: NEPODMIRENI eRAČUNI — obje strane novca.
 *
 * Prvi red: što ja dugujem (ulazni). Drugi red: što duguju meni (izlazni).
 * TVRDO PRAVILO: iznosi su obveze odnosno potraživanja, ne trošak i ne prihod.
 * Ne ulaze ni u jedan zbroj na dashboardu.
 *
 * Blok se ne renderira kad nema nepodmirenih ni na jednoj strani.
 */
export const IncomingInvoicesWidget = ({ variant = 'default' }: IncomingInvoicesWidgetProps = {}) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const { invoices, loading } = useIncomingInvoices();
  const [open, setOpen] = useState(false);

  const payable = useMemo(
    () => summarizeIncomingInvoices(invoices.filter((i) => (i.direction ?? 'in') === 'in')),
    [invoices],
  );
  const receivable = useMemo(
    () => summarizeIncomingInvoices(invoices.filter((i) => i.direction === 'out')),
    [invoices],
  );

  const monarch = variant === 'monarch';
  const wrapperSpacing = monarch ? 'mb-6 sm:mb-8' : 'mb-4';

  if (loading || (payable.count === 0 && receivable.count === 0)) return null;

  const hasOverdue = payable.overdueCount > 0 || receivable.overdueCount > 0;

  const row = (
    summary: typeof payable,
    label: string,
    Icon: typeof FileInput,
  ) => {
    if (summary.count === 0) return null;
    const overdue = summary.overdueCount > 0;
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={`w-4 h-4 shrink-0 ${overdue ? 'text-destructive' : 'text-muted-foreground'}`} />
          <div className="min-w-0">
            <p className={monarch
              ? 'text-[10px] font-medium uppercase tracking-widest text-muted-foreground'
              : 'text-[10px] text-muted-foreground'}>
              {label}
            </p>
            <p className={monarch
              ? 'text-lg font-semibold tabular-nums tracking-tight truncate mt-0.5'
              : 'text-sm font-bold truncate'}>
              {formatAmount(summary.total)}
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {overdue
                ? t('eracun.widget.overdue', '{{count}} kasni · {{amount}}', {
                    count: summary.overdueCount,
                    amount: formatAmount(summary.overdueTotal),
                  })
                : summary.nextDueInDays !== null
                  ? t('eracun.widget.nextDue', 'Najbliže dospijeće za {{days}} d.', { days: summary.nextDueInDays })
                  : t('eracun.widget.noDueDate', 'Bez datuma dospijeća')}
              {' · '}
              {t('eracun.widget.count', '{{count}} računa', { count: summary.count })}
            </p>
          </div>
        </div>
        {overdue && (
          <div className="flex items-center gap-1 text-destructive shrink-0">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">
              {summary.overdueCount} · {formatAmount(summary.overdueTotal)}
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div
        {...clickableProps(() => setOpen(true))}
        className={`${wrapperSpacing} p-3 rounded-2xl border border-border/50 hover:bg-muted/30 transition-colors`}
        style={{
          background: hasOverdue
            ? 'linear-gradient(135deg, hsl(var(--destructive) / 0.06) 0%, transparent 100%)'
            : 'linear-gradient(135deg, hsl(var(--muted-foreground) / 0.06) 0%, transparent 100%)',
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-2">
            {row(payable, t('eracun.widget.title', 'Ulazni računi — neplaćeno'), FileInput)}
            {row(receivable, t('eracun.widget.titleOut', 'Izlazni računi — nenaplaćeno'), FileOutput)}
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
        </div>

        <p className="mt-1.5 text-[10px] text-muted-foreground">
          {t('eracun.widget.obligationNote', 'obveza, nije trošak')}
        </p>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="h-[85vh] overflow-y-auto">
          <PageContainer noVerticalPadding className="pt-2">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <FileInput className="w-5 h-5 text-primary" />
                {t('eracun.widget.sheetTitle', 'eRačuni — obveze i potraživanja')}
              </SheetTitle>
            </SheetHeader>
            <div className="mt-4">
              <IncomingInvoicesPanel />
            </div>
          </PageContainer>
        </SheetContent>
      </Sheet>
    </>
  );
};
