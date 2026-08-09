import { useMemo, useState } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { AlertTriangle, BadgeCheck, Check, Loader2, Pencil, ShieldAlert, X } from 'lucide-react';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { showUndoToast } from '@/lib/undoToast';
import { restoreIngestItem } from '@/lib/mailReviewStatus';
import { useMailReviewQueue, type MailReviewItem } from '@/hooks/useMailReviewQueue';
import { useBusinessProfiles } from '@/hooks/useBusinessProfiles';
import { MailScopeChip } from '@/components/mail/MailScopeChip';
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
 * MAIL UVOZ — red „Na pregled" kao SADRŽAJ (bez vlastitog okvira).
 *
 * Ista logika koju je prije držao `MailReviewDialog`: visoka pouzdanost = jedan
 * dodir „Potvrdi", srednja = jantarna polja, niska otvara uređivanje. Kolizija
 * se NIKAD ne rješava tiho. Odbacivanje nudi UNDO (stavka se samo označi).
 *
 * Ekran `/dokumenti` i (stari) dijalog dijele OVU komponentu — nema duplikata.
 */

interface Props {
  /** Dohvat se pokreće samo kad je popis stvarno vidljiv. */
  active: boolean;
  /** Nadređeni sloj (kartica/tab) traži osvježenje brojača. */
  onCountChange?: () => void;
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
  // Oznaka mjesta (npr. „Split"/„Solin") — pamćenje je predlaže, korisnik je
  // smije prepisati PRIJE potvrde; potvrda je uči po šifri obračunskog mjesta.
  { key: 'place_label', labelKey: 'mailReview.field.placeLabel', fallback: 'Oznaka mjesta', kind: 'text' },

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

/** Jak alarm: ključni podatak poznatog izdavatelja se PROMIJENIO. */
export const IBAN_ALARM_WARNING = 'iban_ne_odgovara_povijesti';

/**
 * Poznat izdavatelj (u pamćenju, podaci se poklapaju) smije dobiti blažu
 * prezentaciju tehničke neprovjerljivosti pošiljatelja — ALI nikad kad je
 * ključni podatak (IBAN) drukčiji od dosad viđenih.
 */
export const softensTrust = (knownCount: number, warnings: readonly string[]): boolean =>
  knownCount > 0 && !warnings.includes(IBAN_ALARM_WARNING);


export const MailReviewList = ({ active, onCountChange }: Props) => {
  const { t } = useTranslation();
  const { items, loading, working, confirmItem, discardItem, setScope, refetch } =
    useMailReviewQueue(active);
  const { profiles } = useBusinessProfiles();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [collision, setCollision] = useState<{ item: MailReviewItem; existing: Record<string, unknown> } | null>(null);
  // IZRIČITA PRIVOLA: red je UKLJUČEN; korisnik ga smije isključiti po stavci.
  const [rememberOff, setRememberOff] = useState<Record<string, boolean>>({});

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
    // Učenje pamćenja se događa SAMO uz uključenu kvačicu — nikad tiho.
    base.remember_issuer = rememberOff[item.id] !== true;
    return base;
  };

  const handleConfirm = async (item: MailReviewItem, replaceExistingId?: string) => {
    try {
      const result = await confirmItem(item.id, payloadFor(item), replaceExistingId);

      if (result.ok) {
        setCollision(null);
        setEditingId(null);
        onCountChange?.();
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
      console.warn('[MailReviewList] confirm failed:', failure.reason, failure.detail ?? '');
    } catch (e) {
      showError(t('mailReview.confirmFailed', 'Spremanje nije uspjelo'));
      console.warn('[MailReviewList] confirm threw:', describeDbError(e));
    }
  };

  const handleDiscard = async (item: MailReviewItem) => {
    try {
      await discardItem(item.id);
      setCollision(null);
      onCountChange?.();
      // Odbacivanje nije brisanje — nudi se povratak bez traženja po arhivi.
      showUndoToast({
        message: t('mailReview.discarded', 'Stavka je odbačena'),
        undoLabel: t('documents.restore', 'Vrati'),
        onUndo: async () => {
          const ok = await restoreIngestItem(item.id);
          if (ok) {
            await refetch();
            onCountChange?.();
            showSuccess(t('documents.restored', 'Dokument je vraćen na pregled'));
          } else {
            showError(t('documents.restoreFailed', 'Vraćanje nije uspjelo'));
          }
        },
      });
    } catch {
      showError(t('mailReview.discardFailed', 'Odbacivanje nije uspjelo'));
    }
  };

  const handleScopeChange = async (
    item: MailReviewItem,
    scopeType: 'user' | 'business_profile',
    scopeId: string | null,
  ) => {
    const ok = await setScope(item.id, scopeType, scopeId);
    if (ok) showSuccess(t('documents.scope.changed', 'Odredište je promijenjeno'));
    else showError(t('documents.scope.changeFailed', 'Promjena odredišta nije uspjela'));
  };

  const empty = useMemo(() => !loading && items.length === 0, [loading, items.length]);

  return (
    <div className="space-y-3">
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

      {items.map((item) => {
        const extraction = (item.extraction ?? {}) as Record<string, unknown>;
        const isEditing = editingId === item.id;
        const mediumConfidence = item.confidence === 'srednja';
        const knownCount = Number(extraction.issuer_confirmed_count ?? 0);
        const ibanAlarm = item.warnings.includes(IBAN_ALARM_WARNING);
        const soften = softensTrust(knownCount, item.warnings);
        const supplierOib = String(extraction.supplier_oib ?? '').trim();
        // Kvačica se nudi SAMO za novog izdavatelja — poznatog se ne pita opet.
        const offerRemember = supplierOib !== '' && knownCount === 0;
        return (
          <div
            key={item.id}
            data-testid="mail-review-item"
            className="rounded-lg border border-l-4 border-l-document-pending bg-document-pending-surface/40 p-3 space-y-2"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                {t(`mailReview.classification.${item.classification}`, item.classification ?? '—')}
              </Badge>
              {knownCount > 0 && (
                <Badge variant="secondary" data-testid="known-issuer-badge" className="gap-1">
                  <BadgeCheck className="h-3 w-3" />
                  {t('mailReview.knownIssuer', 'Poznat izdavatelj · potvrđen {{count}}×', {
                    count: knownCount,
                  })}
                </Badge>
              )}
              <Badge
                variant={soften ? 'outline' : trustVariant(item.trust_level)}
                data-testid="trust-badge"
                title={t(
                  'mailReview.trustHint',
                  'Tehnička provjerljivost pošiljatelja e-maila',
                )}
              >
                {item.trust_level ?? 'T4'}
              </Badge>
              <Badge variant="outline">
                {t(`mailReview.confidence.${item.confidence}`, item.confidence ?? '—')}
              </Badge>
              <MailScopeChip
                scopeType={item.scope_type}
                scopeId={item.scope_id}
                profiles={profiles}
                disabled={working}
                onChange={(type, id) => handleScopeChange(item, type, id)}
              />
            </div>

            <div className="text-xs text-muted-foreground break-all">
              {item.subject || t('mailImport.noSubject', '(bez naslova)')} · {item.from_header || '—'}
            </div>

            {ibanAlarm && (
              <div
                data-testid="iban-alarm"
                className="flex items-start gap-2 rounded-md border border-destructive bg-destructive/10 p-2 text-xs font-medium text-destructive"
              >
                <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  {t(
                    'mailReview.alarm.ibanChanged',
                    'IBAN se razlikuje od dosadašnjih — provjeri prije plaćanja.',
                  )}
                </span>
              </div>
            )}

            {item.warnings.filter((w) => w !== IBAN_ALARM_WARNING).length > 0 && (
              <ul className="space-y-1">
                {item.warnings
                  .filter((w) => w !== IBAN_ALARM_WARNING)
                  .map((w) => (
                    <li key={w} className="flex items-start gap-2 text-xs text-destructive">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
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
                    <dd className={mediumConfidence ? 'text-document-pending' : ''}>
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
    </div>
  );
};
