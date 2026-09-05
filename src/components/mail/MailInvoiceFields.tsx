import { useTranslation } from 'react-i18next';

import {
  MailReviewFieldInput,
  isMailFieldInvalid,
  type MailFieldKind,
} from '@/components/mail/MailReviewFieldInput';
import type { DateContext } from '@/lib/dateValidation';
import { formatDateHr } from '@/lib/dateFormat';
import { formatHrAmount } from '@/lib/money';
import { docTypeLabelKey, resolveConfirmDocType } from '@/lib/mail/docType';

/**
 * MAIL UVOZ — OBRAZAC STAVKE RAČUNA (izdvojen iz `MailReviewList`).
 *
 * Izdvajanje je čisto strukturno: isti popis polja, isti prikaz, ista pravila
 * valjanosti. Novo je SAMO označavanje obaveznih polja i osvjetljavanje onih
 * koja je `mail_item_confirm` prijavio kao nedostajuća.
 */

export type FieldDef = {
  key: string;
  labelKey: string;
  fallback: string;
  kind: MailFieldKind;
  dateContext?: DateContext;
};

export const FIELDS: FieldDef[] = [
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
  // Tip dokumenta: vidljiv i promjenjiv PRIJE potvrde (default 380, vidi docType.ts).
  { key: 'doc_type', labelKey: 'mailReview.field.docType', fallback: 'Tip dokumenta', kind: 'docType' },
];

/** Polja bez kojih dokument nema ključ — obavezna su i PRIJE klika na „Potvrdi". */
export const REQUIRED_FIELD_KEYS = ['invoice_number'] as const;

/** Prikaz: ISO → dd.mm.gggg., broj → 1.660,36. Baza ostaje ISO/decimalna točka. */
export const displayFieldValue = (field: FieldDef, raw: unknown): string => {
  if (raw === null || raw === undefined || raw === '') return '—';
  if (field.kind === 'date') return formatDateHr(String(raw)) || String(raw);
  if (field.kind === 'amount') return formatHrAmount(raw as string | number) || String(raw);
  return String(raw);
};

/** Ima li nacrt ijedno neispravno polje (isti izraz kao prije izdvajanja). */
export const draftHasFieldError = (draft: Record<string, string>): boolean =>
  FIELDS.some((f) => isMailFieldInvalid(f.kind, draft[f.key] ?? ''));

interface Props {
  editing: boolean;
  draft: Record<string, string>;
  extraction: Record<string, unknown>;
  docType: string | null;
  /** Srednja pouzdanost boja vrijednosti jantarno (čitalački prikaz). */
  mediumConfidence: boolean;
  /** Polja koja je baza prijavila kao nedostajuća — osvjetljavaju se. */
  missing: readonly string[];
  onChange: (key: string, value: string) => void;
}

export const MailInvoiceFields = ({
  editing,
  draft,
  extraction,
  docType,
  mediumConfidence,
  missing,
  onChange,
}: Props) => {
  const { t } = useTranslation();

  if (editing) {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <MailReviewFieldInput
            key={f.key}
            label={t(f.labelKey, f.fallback)}
            kind={f.kind}
            dateContext={f.dateContext}
            value={draft[f.key] ?? ''}
            required={(REQUIRED_FIELD_KEYS as readonly string[]).includes(f.key)}
            highlight={missing.includes(f.key)}
            onChange={(next) => onChange(f.key, next)}
          />
        ))}
      </div>
    );
  }

  return (
    <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
      {FIELDS.map((f) => {
        const required = (REQUIRED_FIELD_KEYS as readonly string[]).includes(f.key);
        const flagged = missing.includes(f.key);
        return (
          <div
            key={f.key}
            data-testid={flagged ? `mail-field-missing-${f.key}` : undefined}
            className={
              flagged
                ? 'flex justify-between gap-2 rounded-sm bg-destructive/10 px-1'
                : 'flex justify-between gap-2'
            }
          >
            <dt className="text-muted-foreground">
              {t(f.labelKey, f.fallback)}
              {required && <span className="ml-0.5 text-destructive">*</span>}
            </dt>
            <dd
              className={
                flagged
                  ? 'text-destructive font-medium'
                  : mediumConfidence
                    ? 'text-document-pending'
                    : ''
              }
            >
              {f.kind === 'docType'
                ? `${resolveConfirmDocType(docType)} · ${t(
                    docTypeLabelKey(resolveConfirmDocType(docType)),
                    resolveConfirmDocType(docType),
                  )}`
                : displayFieldValue(f, extraction[f.key])}
            </dd>
          </div>
        );
      })}
    </dl>
  );
};
