import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Upload, FileX2, CheckCircle2, Copy, Loader2, AlertTriangle,
  ArrowDownLeft, ArrowUpRight, HelpCircle,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useCurrency } from '@/contexts/CurrencyContext';
import { parseUbl } from '@/lib/eracun/parseUbl';
import { EracunParseError } from '@/lib/eracun/types';
import { evaluateInvoice } from '@/lib/eracun/acceptance';
import { invoiceFingerprint } from '@/lib/eracun/fingerprint';
import { resolveDirection, storedDirection } from '@/lib/eracun/resolveDirection';
import {
  buildIntakeRows,
  summarizeIntake,
  toInsertRow,
  type EracunIntakeRow,
  type EracunParsedFile,
} from '@/lib/eracun/intakeBatch';

interface FailedFile {
  fileName: string;
  code: 'not_xml' | 'not_ubl' | 'empty' | 'unknown';
  /** Stvarni tekst greške — nikad se ne guta, prikazuje se uz datoteku. */
  detail?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  businessProfileId: string | null;
  /** OIB aktivne tvrtke — određuje smjer računa (ulazni / izlazni). */
  companyOib: string | null;
  existingFingerprints: ReadonlySet<string>;
  onSave: (rows: ReturnType<typeof toInsertRow>[], batchId: string) => Promise<void>;
}

/**
 * Pregled prije spremanja (ista logika kao uvoz izvoda: pregled → serija → poništi),
 * ali zapisi idu isključivo u `incoming_invoices`. `expenses` ostaje netaknut.
 */
export const EracunImportDialog = ({
  open,
  onOpenChange,
  userId,
  businessProfileId,
  companyOib,
  existingFingerprints,
  onSave,
}: Props) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const inputRef = useRef<HTMLInputElement>(null);

  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<EracunIntakeRow[]>([]);
  const [failed, setFailed] = useState<FailedFile[]>([]);
  const [excluded, setExcluded] = useState<Record<number, boolean>>({});

  const summary = useMemo(() => summarizeIntake(rows), [rows]);
  const selectedRows = useMemo(
    () => rows.filter((r) => r.importable && !excluded[r.index]),
    [rows, excluded],
  );

  const reset = useCallback(() => {
    setRows([]);
    setFailed([]);
    setExcluded({});
  }, []);

  const handleFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setParsing(true);
    const parsed: EracunParsedFile[] = [];
    const failures: FailedFile[] = [];

    for (const file of Array.from(fileList)) {
      try {
        const xml = await file.text();
        const invoice = parseUbl(xml);
        const acceptance = evaluateInvoice(invoice);
        const fingerprint = await invoiceFingerprint(invoice.supplier.oib, invoice.invoiceNumber);
        const direction = resolveDirection({
          supplierOib: invoice.supplier.oib,
          customerOib: invoice.customer.oib,
          companyOib,
        });
        parsed.push({ fileName: file.name, invoice, acceptance, fingerprint, direction });
      } catch (err) {
        console.error('[eRacun] parse failed', file.name, err);
        failures.push({
          fileName: file.name,
          code: err instanceof EracunParseError ? err.code : 'unknown',
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const nextRows = buildIntakeRows(parsed, existingFingerprints);
    setRows(nextRows);
    setFailed(failures);
    // Svjesna odluka korisnika: nepoznat tip i račun koji ne pripada ovoj tvrtki
    // ne uvoze se dok ih sam ne označi.
    setExcluded(
      Object.fromEntries(
        nextRows
          .filter((r) => r.acceptance.needsDecision || r.direction === 'foreign')
          .map((r) => [r.index, true]),
      ),
    );
    setParsing(false);
  }, [existingFingerprints, companyOib]);

  const handleSave = useCallback(async () => {
    if (selectedRows.length === 0) return;
    setSaving(true);
    try {
      const batchId = crypto.randomUUID();
      await onSave(
        selectedRows.map((r) => toInsertRow(r, { userId, businessProfileId, batchId })),
        batchId,
      );
      reset();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }, [selectedRows, onSave, userId, businessProfileId, reset, onOpenChange]);

  /** Smjer računa — utvrđen po OIB-u aktivne tvrtke. */
  const directionBadge = (row: EracunIntakeRow) => {
    if (row.direction === 'out') {
      return (
        <Badge variant="outline" className="text-[10px] gap-1">
          <ArrowUpRight className="w-3 h-3" />
          {t('eracun.review.directionOut', 'Izlazni')}
        </Badge>
      );
    }
    if (row.direction === 'in') {
      return (
        <Badge variant="outline" className="text-[10px] gap-1">
          <ArrowDownLeft className="w-3 h-3" />
          {t('eracun.review.directionIn', 'Ulazni')}
        </Badge>
      );
    }
    if (row.direction === 'foreign') {
      return (
        <Badge variant="destructive" className="text-[10px] gap-1">
          <AlertTriangle className="w-3 h-3" />
          {t('eracun.review.directionForeign', 'Ne pripada ovoj tvrtki')}
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="text-[10px] gap-1">
        <HelpCircle className="w-3 h-3" />
        {t('eracun.review.directionUnknown', 'Smjer nepoznat — tvrtka bez OIB-a')}
      </Badge>
    );
  };

  const rowStatus = (row: EracunIntakeRow) => {
    if (row.duplicateOf) {
      return (
        <Badge variant="secondary" className="text-[10px] gap-1">
          <Copy className="w-3 h-3" />
          {row.duplicateOf === 'existing'
            ? t('eracun.review.duplicateExisting', 'Već uvezen')
            : t('eracun.review.duplicateBatch', 'Duplikat u seriji')}
        </Badge>
      );
    }
    if (row.acceptance.needsDecision) {
      return (
        <Badge variant="secondary" className="text-[10px] gap-1">
          <AlertTriangle className="w-3 h-3" />
          {t('eracun.review.needsDecision', 'Za odluku')}
        </Badge>
      );
    }
    if (!row.acceptance.accepted) {
      return (
        <Badge variant="destructive" className="text-[10px] gap-1">
          <FileX2 className="w-3 h-3" />
          {t('eracun.review.rejected', 'Odbijeno')}
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-[10px] gap-1">
        <CheckCircle2 className="w-3 h-3" />
        {t('eracun.review.willImport', 'Za uvoz')}
      </Badge>
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('eracun.import.title', 'Uvoz ulaznih računa (eRačun)')}</DialogTitle>
        </DialogHeader>

        <input
          ref={inputRef}
          type="file"
          accept=".xml,text/xml,application/xml"
          multiple
          className="hidden"
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = '';
          }}
        />

        <div className="space-y-3">
          <Button
            variant="outline"
            className="w-full min-h-[44px]"
            onClick={() => inputRef.current?.click()}
            disabled={parsing || saving}
          >
            {parsing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
            {t('eracun.import.pickFiles', 'Odaberi XML datoteke')}
          </Button>

          <p className="text-[11px] text-muted-foreground">
            {t(
              'eracun.import.hint',
              'Prolaze računi (380), računi za mjerene usluge (82), građevinske situacije (875/876/877), leasing (394), samoizdani (389), faktoring (393) i odobrenja (381, negativan iznos), samo u EUR. Nepoznat tip možeš uvesti svjesnom odlukom. Digitalni potpis se u ovoj verziji ne provjerava.',
            )}
          </p>

          {failed.map((f) => (
            <div key={f.fileName} className="p-2 rounded-lg border border-destructive/40 bg-destructive/5">
              <p className="text-xs font-medium truncate">{f.fileName}</p>
              <p className="text-[11px] text-destructive">
                {f.code === 'unknown'
                  ? t('eracun.error.unknown', 'Datoteku nije moguće pročitati.')
                  : t(`eracun.error.${f.code}`)}
              </p>
              {f.detail && (
                <p className="text-[10px] text-muted-foreground break-words">{f.detail}</p>
              )}
            </div>
          ))}

          {rows.map((row) => {
            const inv = row.invoice;
            const disabled = !row.importable;
            return (
              <div key={`${row.index}-${row.fileName}`} className="p-3 rounded-lg border bg-card">
                <div className="flex items-start gap-2">
                  <Checkbox
                    className="mt-0.5"
                    checked={row.importable && !excluded[row.index]}
                    disabled={disabled}
                    onCheckedChange={(checked) =>
                      setExcluded((prev) => ({ ...prev, [row.index]: !checked }))
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium truncate">
                        {inv.supplier.name || t('eracun.review.unknownSupplier', 'Nepoznat dobavljač')}
                      </p>
                      <span className="text-sm font-semibold shrink-0">
                        {formatAmount(row.acceptance.amount ?? inv.suggestedAmount ?? 0)}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {inv.invoiceNumber} · {inv.issueDate ?? '—'}
                      {inv.dueDate ? ` · ${t('eracun.list.due', 'dospijeće')} ${inv.dueDate}` : ''}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">{rowStatus(row)}</div>
                    {!row.acceptance.accepted && row.acceptance.reason && (
                      <p className="text-[11px] text-destructive mt-1">
                        {t(`eracun.reject.${row.acceptance.reason}`, row.acceptance.params)}
                      </p>
                    )}
                    {row.acceptance.accepted && row.acceptance.isCreditNote && (
                      <p className="text-[11px] text-amber-600 mt-1 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        {t('eracun.warning.credit_note', { docType: '381' })}
                      </p>
                    )}
                    {row.acceptance.cautions.map((caution) => (
                      <p
                        key={caution.code}
                        className="text-[11px] text-amber-600 mt-1 flex items-start gap-1"
                      >
                        <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                        {t(`eracun.caution.${caution.code}`, caution.params)}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}

          {rows.length > 0 && (
            <p className="text-[11px] text-muted-foreground">
              {t('eracun.review.summary', '{{total}} dokumenata · {{importable}} za uvoz · {{duplicates}} duplikata · {{rejected}} odbijeno', { ...summary })}
            </p>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1 min-h-[44px]" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('common.cancel', 'Odustani')}
          </Button>
          <Button
            className="flex-1 min-h-[44px]"
            onClick={handleSave}
            disabled={saving || selectedRows.length === 0}
          >
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {t('eracun.import.save', 'Spremi ({{n}})', { n: selectedRows.length })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
