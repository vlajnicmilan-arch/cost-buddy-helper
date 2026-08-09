import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AlertTriangle, Check, Loader2, Pencil, ShieldAlert, X } from 'lucide-react';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { useMailReviewQueue, type MailReviewItem } from '@/hooks/useMailReviewQueue';
import { describeDbError } from '@/lib/eracun/dbError';
import {
  MailReviewFieldInput,
  isMailFieldInvalid,
  type MailFieldKind,
} from '@/components/mail/MailReviewFieldInput';
import type { DateContext } from '@/lib/dateValidation';
import { formatDateHr, parseHrDate } from '@/lib/dateFormat';
import { formatHrAmount, parseHrAmount } from '@/lib/money';

/**
 * MAIL UVOZ — red "Na pregled" (sestrinski EracunImportDialogu).
 *
 * Visoka pouzdanost = jedan dodir "Potvrdi". Srednja = žuta polja. Niska
 * otvara uređivanje. Kolizija se NIKAD ne rješava tiho: korisnik vidi
 * postojeći zapis i bira.
 */

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type FieldDef = {
  key: string;
  labelKey: string;
  fallback: string;
  kind: MailFieldKind;
  dateContext?: DateContext;
};

const FIELDS: FieldDef[] = [
  { key: 'supplier_name', labelKey: 'mailReview.field.supplierName', fallback: 'Dobavljač', kind: 'text' },
  { key: 'supplier_oib', labelKey: 'mailReview.field.supplierOib', fallback: 'OIB', kind: 'text' },
  { key: 'invoice_number', labelKey: 'mailReview.field.invoiceNumber', fallback: 'Broj dokumenta', kind: 'text' },
  { key: 'issue_date', labelKey: 'mailReview.field.issueDate', fallback: 'Datum izdavanja', kind: 'date', dateContext: 'expense' },
  { key: 'due_date', labelKey: 'mailReview.field.dueDate', fallback: 'Datum dospijeća', kind: 'date', dateContext: 'debt' },
  { key: 'total_amount', labelKey: 'mailReview.field.totalAmount', fallback: 'Ukupno', kind: 'amount' },
  { key: 'iban', labelKey: 'mailReview.field.iban', fallback: 'IBAN', kind: 'text' },
];

/** Prikaz: ISO → dd.mm.gggg., broj → 1.660,36. Baza ostaje ISO/decimalna točka. */
export const displayFieldValue = (field: FieldDef, raw: unknown): string => {
  if (raw === null || raw === undefined || raw === '') return '—';
  if (field.kind === 'date') return formatDateHr(String(raw)) || String(raw);
  if (field.kind === 'amount') return formatHrAmount(raw as string | number) || String(raw);
  return String(raw);
};

const trustVariant = (level: string | null): 'default' | 'secondary' | 'destructive' | 'outline' => {
  if (level === 'T1' || level === 'T2') return 'secondary';
  if (level === 'T3') return 'outline';
  return 'destructive';
};

export const MailReviewDialog = ({ open, onOpenChange }: Props) => {
  const { t } = useTranslation();
  const { items, loading, working, confirmItem, discardItem } = useMailReviewQueue(open);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [collision, setCollision] = useState<{ item: MailReviewItem; existing: Record<string, unknown> } | null>(null);

  useEffect(() => {
    if (!open) {
      setEditingId(null);
      setCollision(null);
    }
  }, [open]);

  const startEdit = (item: MailReviewItem) => {
    const source = (item.extraction ?? {}) as Record<string, unknown>;
    const next: Record<string, string> = {};
    for (const f of FIELDS) {
      const raw = source[f.key];
      if (raw === null || raw === undefined || raw === '') next[f.key] = '';
      else if (f.kind === 'date') next[f.key] = formatDateHr(String(raw)) || String(raw);
      else if (f.kind === 'amount') next[f.key] = formatHrAmount(raw as string | number) || String(raw);
      else next[f.key] = String(raw);
    }
    setDraft(next);
    setEditingId(item.id);
  };

  const draftHasError = FIELDS.some((f) => isMailFieldInvalid(f.kind, draft[f.key] ?? ''));

  /** Normalizacija PRIJE slanja: datum → ISO, iznos → decimalna točka. */
  const payloadFor = (item: MailReviewItem): Record<string, unknown> => {
    const base = { ...(item.extraction ?? {}) } as Record<string, unknown>;
    if (editingId === item.id) {
      for (const f of FIELDS) {
        const raw = (draft[f.key] ?? '').trim();
        if (raw === '') {
          base[f.key] = null;
        } else if (f.kind === 'date') {
          base[f.key] = parseHrDate(raw);
        } else if (f.kind === 'amount') {
          const n = parseHrAmount(raw);
          base[f.key] = n === null ? null : n;
        } else {
          base[f.key] = raw;
        }
      }
    }
    base.doc_type = item.doc_type ?? '380';
    base.direction = 'in';
    return base;
  };

  const handleConfirm = async (item: MailReviewItem, replaceExistingId?: string) => {
    try {
      const result = await confirmItem(item.id, payloadFor(item), replaceExistingId);

      if (result.ok) {
        setCollision(null);
        setEditingId(null);
        showSuccess(
          result.already
            ? t('mailReview.alreadySaved', 'Dokument je već bio spremljen')
            : t('mailReview.confirmed', 'Dokument je spremljen'),
        );
        return;
      }

      const failure = result as { reason: string; existing?: Record<string, unknown>; detail?: string };

      if (failure.reason === 'mozda_vec_postoji') {
        setCollision({ item, existing: failure.existing ?? {} });
        return;
      }

      // Konkretan razlog umjesto generičkog teksta (popravak nijeme greške).
      showError(
        t(`mailReview.error.${failure.reason}`, t('mailReview.confirmFailed', 'Spremanje nije uspjelo')),
      );
      console.warn('[MailReviewDialog] confirm failed:', failure.reason, failure.detail ?? '');

    } catch (e) {
      showError(t('mailReview.confirmFailed', 'Spremanje nije uspjelo'));
      console.warn('[MailReviewDialog] confirm threw:', describeDbError(e));
    }
  };


  const handleDiscard = async (item: MailReviewItem) => {
    try {
      await discardItem(item.id);
      showSuccess(t('mailReview.discarded', 'Stavka je odbačena'));
    } catch {
      showError(t('mailReview.discardFailed', 'Odbacivanje nije uspjelo'));
    }
  };

  const empty = useMemo(() => !loading && items.length === 0, [loading, items.length]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('mailReview.title', 'Na pregled')}</DialogTitle>
          <DialogDescription>
            {t('mailReview.description', 'Dokumenti primljeni e-poštom. Ništa se ne sprema dok ne potvrdiš.')}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('common.loading', 'Učitavanje...')}
          </div>
        )}

        {empty && (
          <p className="text-sm text-muted-foreground">
            {t('mailReview.empty', 'Nema dokumenata koji čekaju pregled.')}
          </p>
        )}

        <div className="space-y-3">
          {items.map((item) => {
            const extraction = (item.extraction ?? {}) as Record<string, unknown>;
            const isEditing = editingId === item.id;
            const mediumConfidence = item.confidence === 'srednja';
            return (
              <div key={item.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">
                    {t(`mailReview.classification.${item.classification}`, item.classification ?? '—')}
                  </Badge>
                  <Badge variant={trustVariant(item.trust_level)}>{item.trust_level ?? 'T4'}</Badge>
                  <Badge variant="outline">
                    {t(`mailReview.confidence.${item.confidence}`, item.confidence ?? '—')}
                  </Badge>
                </div>

                <div className="text-xs text-muted-foreground break-all">
                  {item.subject || t('mailImport.noSubject', '(bez naslova)')} · {item.from_header || '—'}
                </div>

                {item.warnings.length > 0 && (
                  <ul className="space-y-1">
                    {item.warnings.map((w) => (
                      <li key={w} className="flex items-start gap-2 text-xs text-destructive">
                        {w === 'iban_ne_odgovara_povijesti' ? (
                          <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        ) : (
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        )}
                        <span>{t(`mailReview.warning.${w}`, w)}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {isEditing ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {FIELDS.map((f) => (
                      <MailReviewFieldInput
                        key={f.key}
                        label={t(f.labelKey, f.fallback)}
                        kind={f.kind}
                        dateContext={f.dateContext}
                        value={draft[f.key] ?? ''}
                        onChange={(next) => setDraft((d) => ({ ...d, [f.key]: next }))}
                      />
                    ))}
                  </div>
                ) : (
                  <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                    {FIELDS.map((f) => (
                      <div key={f.key} className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">{t(f.labelKey, f.fallback)}</dt>
                        <dd className={mediumConfidence ? 'text-amber-600 dark:text-amber-500' : ''}>
                          {displayFieldValue(f, extraction[f.key])}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    size="sm"
                    className="min-h-[44px]"
                    disabled={working || (isEditing && draftHasError)}
                    onClick={() => handleConfirm(item)}
                  >
                    <Check className="h-4 w-4 mr-2" />
                    {t('mailReview.confirm', 'Potvrdi')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-[44px]"
                    disabled={working}
                    onClick={() => (isEditing ? setEditingId(null) : startEdit(item))}
                  >
                    <Pencil className="h-4 w-4 mr-2" />
                    {isEditing ? t('common.cancel', 'Odustani') : t('mailReview.edit', 'Uredi')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="min-h-[44px]"
                    disabled={working}
                    onClick={() => handleDiscard(item)}
                  >
                    <X className="h-4 w-4 mr-2" />
                    {t('mailReview.discard', 'Odbaci')}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <Dialog open={collision !== null} onOpenChange={(o) => !o && setCollision(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t('mailReview.collision.title', 'Možda već postoji')}</DialogTitle>
              <DialogDescription>
                {t(
                  'mailReview.collision.description',
                  'Već postoji zapis s istim brojem i dobavljačem. Ništa nije promijenjeno — odluči što želiš.'
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-md border p-3 text-xs space-y-1">
              <div>{String(collision?.existing?.supplier_name ?? '—')}</div>
              <div>{String(collision?.existing?.invoice_number ?? '—')}</div>
              <div>{formatHrAmount(collision?.existing?.total_amount as number | string) || '—'}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                className="min-h-[44px]"
                disabled={working}
                onClick={() =>
                  collision && handleConfirm(collision.item, String(collision.existing.id))
                }
              >
                {t('mailReview.collision.replace', 'Zamijeni postojeći')}
              </Button>
              <Button
                variant="outline"
                className="min-h-[44px]"
                disabled={working}
                onClick={() => collision && handleDiscard(collision.item)}
              >
                {t('mailReview.collision.discard', 'Odbaci novi')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
};
