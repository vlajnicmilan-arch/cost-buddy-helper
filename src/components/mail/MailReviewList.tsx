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
import { AlertTriangle, BadgeCheck, Check, FileText, Inbox, Loader2, Pencil, ShieldAlert, X } from 'lucide-react';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { showUndoToast } from '@/lib/undoToast';
import { restoreIngestItem } from '@/lib/mailReviewStatus';
import { useMailReviewQueue, type MailReviewItem } from '@/hooks/useMailReviewQueue';
import { useBusinessProfiles } from '@/hooks/useBusinessProfiles';
import { MailDestinationRow } from '@/components/mail/MailDestinationRow';
import { describeDbError } from '@/lib/eracun/dbError';
import {
  FIELDS,
  MailInvoiceFields,
  displayFieldValue,
  draftHasFieldError,
  type FieldDef,
} from '@/components/mail/MailInvoiceFields';
import { formatDateHr, parseHrDate } from '@/lib/dateFormat';
import { formatHrAmount, parseHrAmount } from '@/lib/money';
import { resolveConfirmDocType } from '@/lib/mail/docType';

import { normalizeExtractionDates } from '@/lib/mail/dateNormalize';
import { StatementReviewCard } from '@/components/mail/StatementReviewCard';
import { VerificationReviewCard } from '@/components/mail/VerificationReviewCard';
import { useMailDuplicateCandidates } from '@/hooks/useMailDuplicateCandidates';
import { PROBABLE_DUPLICATE_WARNING } from '@/lib/mail/invoiceNumberMatch';
import { findSiblingDocuments } from '@/lib/mail/siblingDocuments';
import { splitPairedReceipts, parsePaidDateIso } from '@/lib/mail/receiptSignals';
import { supabase } from '@/integrations/supabase/client';



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

// Popis polja, prikaz vrijednosti i obrazac stavke žive u `MailInvoiceFields`.
// Ponovni izvoz čuva postojeće uvoze ove datoteke.
export { displayFieldValue };
export type { FieldDef };


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
  const {
    items,
    loading,
    working,
    confirmItem,
    discardItem,
    confirmAsStatement,
    confirmAsInvoice,
    keepItem,
    markVerificationClicked,
    setScope,
    refetch,
  } = useMailReviewQueue(active);

  const { profiles } = useBusinessProfiles();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [collision, setCollision] = useState<{ item: MailReviewItem; existing: Record<string, unknown> } | null>(null);
  // IZRIČITA PRIVOLA: red je UKLJUČEN; korisnik ga smije isključiti po stavci.
  const [rememberOff, setRememberOff] = useState<Record<string, boolean>>({});
  // MEKA BRANA DUPLIKATA: svjesna potvrda po stavci (nikad tvrdo blokiranje).
  const [dupAck, setDupAck] = useState<Record<string, boolean>>({});
  // STRANI IZDAVATELJ BEZ OIB-a: unos prolazi SAMO uz svjesnu potvrdu.
  const [noOibAck, setNoOibAck] = useState<Record<string, boolean>>({});
  // DOKUMENT BEZ BROJA (aplikacijski račun, isječak): isti obrazac kao za OIB.
  const [noNumberAck, setNoNumberAck] = useState<Record<string, boolean>>({});
  // Polja koja je baza prijavila kao nedostajuća — po stavci, za osvjetljavanje.
  const [missingFields, setMissingFields] = useState<Record<string, string[]>>({});
  const duplicateCandidates = useMailDuplicateCandidates(items);

  // Račun + potvrda plaćanja iz iste poruke = jedna obveza (vidi siblingDocuments.ts).
  const siblings = useMemo(
    () =>
      findSiblingDocuments(
        items.map((i) => ({
          id: i.id,
          message_id: i.message_id,
          invoiceNumber: String((i.extraction ?? {}).invoice_number ?? '') || null,
          fileName: i.file_name,
          createdAt: i.created_at,
        })),
      ),
    [items],
  );

  // POTVRDA O PLAĆANJU NIJE DRUGI RAČUN — vezana potvrda nema vlastitu karticu,
  // nego se prikazuje uz svoj račun kao dokaz plaćanja.
  const { visible, receiptsByInvoiceId } = useMemo(() => splitPairedReceipts(items), [items]);
  // Označavanje plaćenim je KORISNIKOVA odluka — nikad automatski.
  const [markPaid, setMarkPaid] = useState<Record<string, boolean>>({});
  const startEdit = (item: MailReviewItem) => {
    const source = (item.extraction ?? {}) as Record<string, unknown>;
    const next: Record<string, string> = {};
    for (const f of FIELDS) {
      const raw = f.kind === 'docType' ? resolveConfirmDocType(item.doc_type) : source[f.key];
      if (raw === null || raw === undefined || raw === '') next[f.key] = '';
      else if (f.kind === 'date') next[f.key] = formatDateHr(String(raw)) || String(raw);
      else if (f.kind === 'amount') next[f.key] = formatHrAmount(raw as string | number) || String(raw);
      else next[f.key] = String(raw);
    }
    setDraft(next);
    setEditingId(item.id);
  };

  const draftHasError = draftHasFieldError(draft);

  /** Normalizacija PRIJE slanja: datum → ISO, iznos → decimalna točka. */
  const payloadFor = (item: MailReviewItem): Record<string, unknown> => {
    // Datumi iz AI dopune znaju biti u hrvatskom obliku — u payload ide SAMO ISO.
    const base = normalizeExtractionDates(
      { ...(item.extraction ?? {}) } as Record<string, unknown>,
    );
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
    // Default 380 kad tip nedostaje; korisnikov izbor iz uređivanja ima prednost.
    base.doc_type = resolveConfirmDocType(
      item.doc_type,
      editingId === item.id ? draft.doc_type : undefined,
    );
    base.direction = 'in';
    // Učenje pamćenja se događa SAMO uz uključenu kvačicu — nikad tiho.
    base.remember_issuer = rememberOff[item.id] !== true;
    // STRANI IZDAVATELJ: nedostatak OIB-a nije brana, nego svjesna potvrda.
    base.allow_missing_oib = noOibAck[item.id] === true;
    // DOKUMENT BEZ BROJA: isti obrazac — svjesna potvrda, ne tiho propuštanje.
    base.allow_missing_number = noNumberAck[item.id] === true;
    return normalizeExtractionDates(base);
  };

  /** Ime polja za korisnika — nikad šifra iz baze. */
  const fieldLabel = (key: string): string => {
    const def = FIELDS.find((f) => f.key === key);
    return def ? t(def.labelKey, def.fallback) : key;
  };



  const handleConfirm = async (item: MailReviewItem, replaceExistingId?: string) => {
    try {
      const result = await confirmItem(item.id, payloadFor(item), replaceExistingId);

      if (result.ok) {
        setCollision(null);
        setEditingId(null);
        setMissingFields((s) => ({ ...s, [item.id]: [] }));

        // Potvrda iz iste poruke nosi datum plaćanja — upisuje se SAMO ako je
        // korisnik to izričito zatražio kvačicom.
        const paired = receiptsByInvoiceId.get(item.id);
        const paidIso = parsePaidDateIso(paired?.paidDate);
        if (markPaid[item.id] === true && result.invoiceId && paidIso) {
          const { error } = await supabase
            .from('incoming_invoices')
            .update({ paid_at: paidIso })
            .eq('id', result.invoiceId);
          if (error) {
            showError(t('mailReview.receipt.markPaidFailed', 'Oznaka plaćanja nije spremljena'));
          }
        }
        onCountChange?.();
        showSuccess(
          result.already
            ? t('mailReview.alreadySaved', 'Dokument je već bio spremljen')
            : t('mailReview.confirmed', 'Dokument je spremljen'),
        );
        return;
      }


      const failure = result as {
        reason: string;
        existing?: Record<string, unknown>;
        detail?: string;
        missing?: string[];
      };

      if (failure.reason === 'mozda_vec_postoji') {
        setCollision({ item, existing: failure.existing ?? {} });
        return;
      }

      // PORUKA IMENUJE SAMO ONO ŠTO STVARNO NEDOSTAJE — nikad popis polja koja
      // su možda uredna. Ista polja se osvjetljavaju u obrascu.
      const missing = failure.missing ?? [];
      setMissingFields((s) => ({ ...s, [item.id]: missing }));
      if (failure.reason === 'nedostaju_polja' && missing.length > 0) {
        showError(
          t('mailReview.error.missingFields', 'Nedostaje: {{fields}}', {
            fields: missing.map(fieldLabel).join(', '),
          }),
        );
        console.warn('[MailReviewList] confirm failed: nedostaju_polja', missing.join(','));
        return;
      }

      // POŠTENA GREŠKA: kad je pao DB (reason 'baza'), poruka nosi STVARNI
      // razlog s baze — nikad samo „javi podršci".
      const base = t(
        `mailReview.error.${failure.reason}`,
        t('mailReview.confirmFailed', 'Spremanje nije uspjelo'),
      );

      showError(
        failure.detail
          ? t('mailReview.errorDetail', '{{base}} ({{reason}})', { base, reason: failure.detail })
          : base,
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

  const handleConfirmAsStatement = async (item: MailReviewItem) => {
    const result = await confirmAsStatement(item.id);
    if (result.ok) {
      showSuccess(t('statements.reprocessQueued', 'Dokument je vraćen u obradu kao izvod'));
      return;
    }
    showError(
      result.reason
        ? `${t('statements.choiceFailed')} (${result.reason})`
        : t('statements.choiceFailed'),
    );
  };

  const handleConfirmAsInvoice = async (item: MailReviewItem) => {
    const result = await confirmAsInvoice(item.id);
    if (result.ok) {
      showSuccess(t('statements.invoiceQueued', 'Dokument je vraćen u obradu kao račun'));
      onCountChange?.();
      return;
    }
    showError(
      result.reason
        ? `${t('statements.choiceFailed')} (${result.reason})`
        : t('statements.choiceFailed'),
    );
  };

  const handleKeep = async (item: MailReviewItem) => {
    const ok = await keepItem(item.id);
    if (ok) {
      showSuccess(t('statements.keptInInbox', 'Dokument ostaje u Primljeno'));
      onCountChange?.();
    } else {
      showError(t('statements.choiceFailed'));
    }
  };

  const handleVerificationClicked = async (item: MailReviewItem) => {
    // Klik ne smije čekati Googleovu stranicu: stavka odmah izlazi iz reda.
    const ok = await markVerificationClicked(item.id);
    if (ok) onCountChange?.();
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

      {visible.map((item) => {
        // GMAILOVA POTVRDA PROSLJEĐIVANJA — nije dokument, ima svoju karticu.
        if (item.classification === 'verifikacija_prosljedjivanja') {
          return (
            <VerificationReviewCard
              key={item.id}
              item={item}
              disabled={working}
              onDiscard={() => handleDiscard(item)}
              onOpenConfirm={() => void handleVerificationClicked(item)}
            />
          );
        }
        // NEPODRŽAN PRIVITAK — karantena koju korisnik može ispraviti.
        if (item.classification === 'privitak_nepodrzan') {
          const type = String(
            ((item.extraction ?? {}) as Record<string, unknown>).attachment_type ?? '—',
          );
          return (
            <div
              key={item.id}
              data-testid="mail-unsupported-attachment-item"
              className="rounded-lg border border-l-4 border-l-document-pending bg-document-pending-surface/40 p-3 space-y-3"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-document-pending-foreground" />
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    {t('mailReview.unsupported.title', 'Privitak nije podržan ({{type}})', { type })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      'mailReview.unsupported.body',
                      'Mail je stigao, ali privitak ne možemo pročitati. Pošalji dokument kao PDF.',
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground break-all">
                    {item.subject || t('mailImport.noSubject')} · {item.from_header || '—'}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-[44px]"
                  disabled={working}
                  onClick={() => handleDiscard(item)}
                >
                  <X className="h-4 w-4 mr-2" />
                  {t('mailReview.verification.dismiss', 'Odbaci')}
                </Button>
              </div>
            </div>
          );
        }
        // BANKOVNI IZVOD ima svoju karticu — polja računa ovdje ne postoje.
        if (item.classification === 'izvod') {
          return (
            <StatementReviewCard
              key={item.id}
              item={item}
              disabled={working}
              onDiscard={() => handleDiscard(item)}
              onLinked={() => {
                void refetch();
                onCountChange?.();
              }}
            />
          );
        }
        if (item.warnings.includes('mozda_izvod')) {
          return (
            <div
              key={item.id}
              data-testid="mail-maybe-statement-item"
              className="rounded-lg border border-l-4 border-l-document-pending bg-document-pending-surface/40 p-3 space-y-3"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-document-pending-foreground" />
                <div className="space-y-1">
                  <p className="text-sm font-medium">{t('statements.choiceQuestion')}</p>
                  <p className="text-xs text-muted-foreground break-all">
                    {item.subject || t('mailImport.noSubject')} · {item.from_header || '—'}
                  </p>
                </div>
              </div>
              {/* RASKRIŽJE: tri nedestruktivna izlaza; Odbaci je odvojen. */}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="min-h-[44px]"
                  disabled={working}
                  onClick={() => handleConfirmAsStatement(item)}
                >
                  <Check className="h-4 w-4 mr-2" />
                  {t('statements.choiceYes')}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="min-h-[44px]"
                  disabled={working}
                  data-testid="mail-choice-invoice"
                  onClick={() => handleConfirmAsInvoice(item)}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  {t('statements.choiceInvoice', 'Ovo je račun')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-[44px]"
                  disabled={working}
                  data-testid="mail-choice-keep"
                  onClick={() => handleKeep(item)}
                >
                  <Inbox className="h-4 w-4 mr-2" />
                  {t('statements.choiceKeep', 'Nešto drugo — zadrži')}
                </Button>
              </div>
              <div className="border-t pt-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="min-h-[44px] text-muted-foreground"
                  disabled={working}
                  data-testid="mail-choice-discard"
                  onClick={() => handleDiscard(item)}
                >
                  <X className="h-4 w-4 mr-2" />
                  {t('mailReview.verification.dismiss', 'Odbaci')}
                </Button>
              </div>
            </div>
          );
        }

        const extraction = (item.extraction ?? {}) as Record<string, unknown>;
        const isEditing = editingId === item.id;
        const mediumConfidence = item.confidence === 'srednja';
        const knownCount = Number(extraction.issuer_confirmed_count ?? 0);
        const ibanAlarm = item.warnings.includes(IBAN_ALARM_WARNING);
        const soften = softensTrust(knownCount, item.warnings);
        const supplierOib = String(extraction.supplier_oib ?? '').trim();
        // Kvačica se nudi SAMO za novog izdavatelja — poznatog se ne pita opet.
        const offerRemember = supplierOib !== '' && knownCount === 0;
        // MEKA BRANA: kandidat duplikata (isti OIB + broj/iznos+datum).
        const missingOib = supplierOib === '';
        const noOibAcked = noOibAck[item.id] === true;
        const sibling = siblings.get(item.id);
        const dupMatch = duplicateCandidates.get(item.id);
        const dupAcked = dupAck[item.id] === true;
        const visibleWarnings = item.warnings.filter(
          (w) => w !== IBAN_ALARM_WARNING && !(dupMatch && w === PROBABLE_DUPLICATE_WARNING),
        );
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
            </div>

            <div className="text-xs text-muted-foreground break-all">
              {item.subject || t('mailImport.noSubject', '(bez naslova)')} · {item.from_header || '—'}
            </div>

            {/* KUPAC + ODREDIŠTE — uvijek vidljivo prije potvrde. */}
            <MailDestinationRow
              itemId={item.id}
              customerName={(extraction.recipient_name as string | null) ?? null}
              customerOib={(extraction.recipient_oib as string | null) ?? null}
              scopeType={item.scope_type}
              scopeId={item.scope_id}
              profiles={profiles}
              disabled={working}
              onChange={(type, id) => handleScopeChange(item, type, id)}
            />

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

            {dupMatch && (
              <div
                data-testid="duplicate-warning"
                className="space-y-2 rounded-md border border-document-pending bg-document-pending-surface p-2 text-xs text-document-pending-foreground"
              >
                <div className="flex items-start gap-2 font-medium">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    {t(
                      'mailReview.duplicate.warning',
                      'Moguć duplikat: već postoji račun {{number}} istog izdavatelja na isti iznos ({{amount}}, dospijeće {{due}})',
                      {
                        number: String(dupMatch.candidate.invoice_number ?? '—'),
                        amount:
                          formatHrAmount(dupMatch.candidate.total_amount as number | string) || '—',
                        due: formatDateHr(String(dupMatch.candidate.due_date ?? '')) || '—',
                      },
                    )}
                  </span>
                </div>
                <label className="flex items-start gap-2 cursor-pointer">
                  <Checkbox
                    className="mt-0.5"
                    checked={dupAcked}
                    onCheckedChange={(v) => setDupAck((s) => ({ ...s, [item.id]: v === true }))}
                  />
                  <span>{t('mailReview.duplicate.acknowledge', 'Svejedno unesi')}</span>
                </label>
              </div>
            )}

            {visibleWarnings.length > 0 && (
              <ul className="space-y-1">
                {visibleWarnings.map((w) => (
                  <li key={w} className="flex items-start gap-2 text-xs text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>{String(t(`mailReview.warning.${w}`, w))}</span>
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
                      {f.kind === 'docType'
                        ? `${resolveConfirmDocType(item.doc_type)} · ${t(
                            docTypeLabelKey(resolveConfirmDocType(item.doc_type)),
                            resolveConfirmDocType(item.doc_type),
                          )}`
                        : displayFieldValue(f, extraction[f.key])}
                    </dd>
                  </div>
                ))}
              </dl>
            )}

            {sibling && (
              <div
                data-testid="sibling-document"
                className="flex items-start gap-2 rounded-md border border-primary/40 bg-primary/5 p-2 text-xs"
              >
                <FileText className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
                <span>
                  {sibling.role === 'receipt'
                    ? t(
                        'mailReview.sibling.receipt',
                        'Ovo je potvrda plaćanja za račun {{number}} iz iste poruke — potvrdom se veže na taj račun, novi se ne stvara.',
                        { number: sibling.invoiceNumber },
                      )
                    : t(
                        'mailReview.sibling.invoice',
                        'Iz iste poruke stigla je i potvrda plaćanja za račun {{number}} — riječ je o jednoj obvezi, ne o dva računa.',
                        { number: sibling.invoiceNumber },
                      )}
                </span>
              </div>
            )}

            {receiptsByInvoiceId.has(item.id) && (
              <div
                data-testid="payment-receipt-proof"
                className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-2 text-xs"
              >
                <div className="flex items-start gap-2">
                  <FileText className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
                  <span>
                    {t(
                      'mailReview.receipt.proof',
                      'Uz ovaj račun stigla je i potvrda plaćanja iz iste poruke (broj {{receipt}}, plaćeno {{date}}). Potvrda se ne unosi kao zaseban račun.',
                      {
                        receipt: receiptsByInvoiceId.get(item.id)?.receiptNumber ?? '—',
                        date: receiptsByInvoiceId.get(item.id)?.paidDate ?? '—',
                      },
                    )}
                  </span>
                </div>
                {parsePaidDateIso(receiptsByInvoiceId.get(item.id)?.paidDate) && (
                  <label
                    data-testid="receipt-mark-paid"
                    className="flex items-start gap-2 cursor-pointer"
                  >
                    <Checkbox
                      className="mt-0.5"
                      checked={markPaid[item.id] === true}
                      onCheckedChange={(v) =>
                        setMarkPaid((s) => ({ ...s, [item.id]: v === true }))
                      }
                    />
                    <span>
                      {t(
                        'mailReview.receipt.markPaid',
                        'Odmah označi plaćenim s datumom iz potvrde',
                      )}
                    </span>
                  </label>
                )}
              </div>
            )}



            {missingOib && (
              <label
                data-testid="missing-oib-ack"
                className="flex items-start gap-2 rounded-md border border-document-pending bg-document-pending-surface p-2 text-xs cursor-pointer"
              >
                <Checkbox
                  className="mt-0.5"
                  checked={noOibAcked}
                  onCheckedChange={(v) => setNoOibAck((s) => ({ ...s, [item.id]: v === true }))}
                />
                <span>
                  {t(
                    'mailReview.missingOib',
                    'Izdavatelj nema OIB (strani dobavljač) — svejedno unesi. Zaštita od dvostrukog unosa radi po nazivu i broju dokumenta.',
                  )}
                </span>
              </label>
            )}

            {offerRemember && (
              <label
                data-testid="remember-issuer"
                className="flex items-start gap-2 pt-1 text-xs cursor-pointer"
              >
                <Checkbox
                  className="mt-0.5"
                  checked={rememberOff[item.id] !== true}
                  onCheckedChange={(v) =>
                    setRememberOff((s) => ({ ...s, [item.id]: v !== true }))
                  }
                />
                <span>
                  {t('mailReview.rememberIssuer', 'Zapamti {{name}} (OIB {{oib}}) kao mog izdavatelja', {
                    name: String(extraction.supplier_name ?? '').trim() ||
                      t('issuers.unnamed', '(bez naziva)'),
                    oib: supplierOib,
                  })}
                </span>
              </label>
            )}

            <div className="flex flex-wrap gap-2 pt-1">

              <Button
                size="sm"
                className="min-h-[44px]"
                disabled={
                  working ||
                  (isEditing && draftHasError) ||
                  (dupMatch !== undefined && !dupAcked) ||
                  (missingOib && !noOibAcked)
                }
                onClick={() => handleConfirm(item)}
              >
                <Check className="h-4 w-4 mr-2" />
                {dupMatch && dupAcked
                  ? t('mailReview.duplicate.confirmAnyway', 'Svejedno unesi')
                  : t('mailReview.confirm', 'Potvrdi')}
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
