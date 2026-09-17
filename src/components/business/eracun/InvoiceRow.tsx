/**
 * InvoiceRow — jedan redak police ulaznih/izlaznih računa.
 *
 * Izdvojeno iz `IncomingInvoicesPanel` bez promjene ponašanja (isti markup,
 * isti redoslijed, isti handleri kroz propove). Funkcionalno novo je SAMO
 * F1 blok knjigovodstvene kategorije:
 *
 * - tri kategorije (pripadnost projektu / alat / osnovna sredstva), dostupne
 *   na SVAKOM ulaznom računu — pripis projektu nije ograničen na račune
 *   usmjerene na tvrtku (plaćeno privatnom karticom za posao),
 * - za „pripadnost projektu" otvara se POSTOJEĆI izbornik projekata
 *   (`AttachmentBar` chip „Projekt"), bez novog izbornika,
 * - prijedlog kategorije je samo natuknica — ništa se ne sprema samo,
 * - oznaka „materijalni trošak" se izvodi iz izvora plaćanja i samo prikazuje.
 */
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { AlertTriangle, CheckCircle2, Link2, MapPin, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AttachmentBar } from '@/components/add-expense/AttachmentBar';
import { invoiceNumberLabel } from '@/lib/eracun/invoiceLabel';
import { daysUntilDue } from '@/lib/eracun/sortInvoices';
import { useCurrency } from '@/contexts/CurrencyContext';
import type { IncomingInvoice } from '@/hooks/useIncomingInvoices';
import {
  deriveMaterialExpenseFlag,
  isAccountingCategory,
  isAccountingHandoverInvoice,
  suggestAccountingCategory,
  type AccountingCategory,
  type AccountingProfileLite,
  type PaymentSourceLite,
  type ProjectLite,
} from '@/lib/eracun/accountingClassification';

export interface InvoiceProjectOption extends ProjectLite {
  name: string;
  color?: string | null;
  icon?: string | null;
}

interface InvoiceRowProps {
  invoice: IncomingInvoice;
  highlighted: boolean;
  isPersonal: boolean;
  linksCount: number;
  hasLinkSuggestions: boolean;
  onEditPlace: (inv: IncomingInvoice) => void;
  onOpenLink: (inv: IncomingInvoice, precheck: boolean) => void;
  onPay: (inv: IncomingInvoice) => void;
  onCollect: (inv: IncomingInvoice) => void;
  onDelete: (inv: IncomingInvoice) => void;
  /** F1 — projekti za postojeći izbornik, grupirani po tvrtki. */
  projects: InvoiceProjectOption[];
  /** F2 — uz naziv nosi i prekidač „Predajem ulazne račune knjigovođi". */
  businessProfiles: (AccountingProfileLite & { name: string })[];
  /** F1 — izvori plaćanja (za izvedenu oznaku „materijalni trošak"). */
  paymentSources: PaymentSourceLite[];
  /** F1 — `payment_source` troška kojim je račun plaćen (ako je poznat). */
  paidExpensePaymentSource: string | null;
  /** F1 — spremanje kategorije/projekta (hook radi upis). */
  onAccountingChange: (
    inv: IncomingInvoice,
    category: AccountingCategory,
    projectId: string | null,
  ) => void;
}

export const InvoiceRow = ({
  invoice: inv,
  highlighted,
  isPersonal,
  linksCount,
  hasLinkSuggestions,
  onEditPlace,
  onOpenLink,
  onPay,
  onCollect,
  onDelete,
  projects,
  businessProfiles,
  paymentSources,
  paidExpensePaymentSource,
  onAccountingChange,
}: InvoiceRowProps) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();

  const dueBadge = (invoice: IncomingInvoice) => {
    if (invoice.paid_at) {
      return (
        <Badge variant="outline" className="text-[10px] gap-1">
          <CheckCircle2 className="w-3 h-3" />
          {t('eracun.list.paidOn', 'Plaćeno {{date}}', {
            date: format(new Date(invoice.paid_at), 'd. MMM yyyy', { locale: hr }),
          })}
        </Badge>
      );
    }
    const days = daysUntilDue(invoice.due_date, new Date());
    if (days === null) {
      return <Badge variant="secondary" className="text-[10px]">{t('eracun.list.noDue', 'Bez dospijeća')}</Badge>;
    }
    if (days < 0) {
      return (
        <Badge variant="destructive" className="text-[10px] gap-1">
          <AlertTriangle className="w-3 h-3" />
          {t('eracun.list.overdue', 'Kasni {{n}} d', { n: Math.abs(days) })}
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="text-[10px]">
        {t('eracun.list.dueIn', 'Za {{n}} d', { n: days })}
      </Badge>
    );
  };

  // --- F1: knjigovodstvena kategorija ---
  const accountingCategory = isAccountingCategory(inv.accounting_category)
    ? inv.accounting_category
    : null;
  const suggestion = accountingCategory ? null : suggestAccountingCategory(inv);
  // F2 — priprema za knjigovođu radi samo za tvrtku s uključenim prekidačem.
  const showAccounting = isAccountingHandoverInvoice(inv, projects, businessProfiles);
  const materialExpense = deriveMaterialExpenseFlag({
    invoice: inv,
    paidExpensePaymentSource,
    sources: paymentSources,
    projects,
  });
  const categoryLabel = (c: AccountingCategory) =>
    c === 'project'
      ? t('eracun.accounting.categoryProject', 'Pripadnost projektu')
      : c === 'tool'
        ? t('eracun.accounting.categoryTool', 'Alat')
        : t('eracun.accounting.categoryFixedAsset', 'Osnovna sredstva');

  return (
    <div
      data-incoming-invoice-id={inv.id}
      className={`p-3 rounded-lg border bg-card ${highlighted ? 'ring-2 ring-primary' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">
            {inv.counterparty_name || inv.supplier_name || inv.counterparty_oib || inv.supplier_oib}
          </p>
          <p className="text-[11px] text-muted-foreground truncate">
            {invoiceNumberLabel(inv.invoice_number)}
            {inv.issue_date ? ` · ${t('eracun.list.issued', 'izdan')} ${format(new Date(inv.issue_date), 'd. MMM yyyy', { locale: hr })}` : ''}
            {inv.due_date ? ` · ${t('eracun.list.due', 'dospijeće')} ${format(new Date(inv.due_date), 'd. MMM yyyy', { locale: hr })}` : ''}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {dueBadge(inv)}
            <button
              type="button"
              onClick={() => onEditPlace(inv)}
              className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground min-h-[24px] max-w-full"
              aria-label={t('eracun.list.placeEdit', 'Uredi oznaku mjesta')}
            >
              <MapPin className="w-3 h-3 shrink-0" />
              <span className="truncate">
                {inv.place_label?.trim() || t('eracun.list.placeNone', 'Bez oznake')}
              </span>
            </button>
            {/* F1 — kategorija; F2 — samo za tvrtku s uključenom predajom knjigovođi. */}
            {showAccounting && (
            <Select
              value={accountingCategory ?? ''}
              onValueChange={(v) => {
                const next = v as AccountingCategory;
                onAccountingChange(inv, next, next === 'project' ? inv.project_id : null);
              }}
            >
              <SelectTrigger
                className="h-6 w-auto gap-1 rounded-full px-2 text-[11px] text-muted-foreground min-h-[24px]"
                aria-label={t('eracun.accounting.label', 'Knjigovodstvena kategorija')}
              >
                <SelectValue
                  placeholder={
                    suggestion
                      ? t('eracun.accounting.suggestion', 'Prijedlog: {{label}}', { label: categoryLabel(suggestion) })
                      : t('eracun.accounting.pick', 'Odaberi kategoriju')
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="project">{categoryLabel('project')}</SelectItem>
                <SelectItem value="tool">{categoryLabel('tool')}</SelectItem>
                <SelectItem value="fixed_asset">{categoryLabel('fixed_asset')}</SelectItem>
              </SelectContent>
            </Select>
            )}
            {showAccounting && materialExpense && (
              <Badge
                variant="outline"
                className="text-[10px]"
                title={t('eracun.accounting.materialExpenseHint', 'Plaćeno iz privatnog izvora — knjigovođa to vodi kao materijalni trošak.')}
              >
                {t('eracun.accounting.materialExpense', 'materijalni trošak')}
              </Badge>
            )}
          </div>

          {/* F1 — za „pripadnost projektu" postojeći izbornik projekata. */}
          {showAccounting && accountingCategory === 'project' && projects.length > 0 && (
            <div className="mt-2">
              <AttachmentBar
                showProject
                projects={projects}
                businessProfiles={businessProfiles}
                selectedProjectId={inv.project_id}
                onSelectedProjectIdChange={(id) => onAccountingChange(inv, 'project', id)}
              />
            </div>
          )}

          {!inv.paid_at && Number(inv.settled_amount ?? 0) > 0 && (
            <p className="text-[11px] text-muted-foreground mt-1">
              {t('eracun.match.settledOf', 'Plaćeno {{paid}} od {{total}}', {
                paid: formatAmount(Number(inv.settled_amount)),
                total: formatAmount(Number(inv.total_amount)),
              })}
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="font-semibold text-sm">{formatAmount(Number(inv.total_amount))}</p>
          {/* PDV je poslovni podatak: u osobnom kontekstu se ne prikazuje
              (podatak se i dalje sprema, samo se ne renderira). */}
          {!isPersonal && inv.vat_amount != null && (
            <p className="text-[10px] text-muted-foreground">
              {t('eracun.list.vat', 'PDV')} {formatAmount(Number(inv.vat_amount))}
            </p>
          )}
        </div>
      </div>

      {/* Odvezivanje mora biti dostupno i na plaćenom računu. */}
      {(inv.direction ?? 'in') === 'in' && linksCount > 0 && (
        <div className="flex justify-end mt-2">
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => onOpenLink(inv, false)}
          >
            <Link2 className="w-3.5 h-3.5 mr-1" />
            {t('eracun.linkExpense.linkedCount', 'Povezano ({{n}})', { n: linksCount })}
          </Button>
        </div>
      )}

      {!inv.paid_at && (
        <div className="flex flex-wrap justify-end gap-2 mt-2">
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => onDelete(inv)}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
          {/* Namjerna asimetrija: ulazni račun na „Plaćeno" stvara trošak,
              izlazni na „Naplaćeno" bilježi samo datum — prihod dolazi iz
              uvoza bankovnog izvoda. Ne izjednačavati ta dva toka. */}
          {(inv.direction ?? 'in') === 'in' ? (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onOpenLink(inv, false)}
              >
                <Link2 className="w-3.5 h-3.5 mr-1" />
                {t('eracun.linkExpense.open', 'Poveži s troškom')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  // Pretprovjera: ako postoji kandidat, prvo ponudi povezivanje —
                  // stvaranje novog troška ovdje bi isti novac zapisalo dvaput.
                  if (hasLinkSuggestions) {
                    onOpenLink(inv, true);
                    return;
                  }
                  onPay(inv);
                }}
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                {t('eracun.list.markPaid', 'Plaćeno')}
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={() => onCollect(inv)}>
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
              {t('eracun.list.markCollected', 'Naplaćeno')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
