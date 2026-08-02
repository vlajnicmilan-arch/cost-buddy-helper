/**
 * eRačun (UBL 2.1) parser — čist modul.
 *
 * - Bez biblioteke: koristi `DOMParser` (browser + jsdom/happy-dom u testovima).
 * - Namespace-agnostičan: uspoređuje se `localName`, ne prefiks. Time radi i za
 *   `cbc:`/`cac:` i za dokumente s drugačijim prefiksima.
 * - Ne odlučuje ništa umjesto korisnika: neuobičajene tipove i valute vraća
 *   kroz `warnings`, a ne kroz tihu pretpostavku.
 */

import {
  EracunDocType,
  EracunInvoice,
  EracunLine,
  EracunParseError,
  EracunParty,
  EracunTaxSubtotal,
  EracunWarning,
} from './types';

const KNOWN_DOC_TYPES: EracunDocType[] = ['380', '381', '383', '386', '389', '394'];
/** Tipovi koje smatramo uobičajenim ulaznim računom. */
const NORMAL_DOC_TYPES = new Set(['380', '394']);

/** Djeca elementa s traženim `localName` (bez rekurzije). */
const childrenByName = (parent: Element | null, name: string): Element[] => {
  if (!parent) return [];
  const out: Element[] = [];
  for (let i = 0; i < parent.children.length; i += 1) {
    const child = parent.children[i];
    if (child.localName === name) out.push(child);
  }
  return out;
};

const childByName = (parent: Element | null, name: string): Element | null =>
  childrenByName(parent, name)[0] ?? null;

/** Prvi potomak (bilo koja dubina) s traženim `localName`. */
const descendantByName = (parent: Element | null, name: string): Element | null => {
  if (!parent) return null;
  const all = parent.getElementsByTagName('*');
  for (let i = 0; i < all.length; i += 1) {
    if (all[i].localName === name) return all[i] as Element;
  }
  return null;
};

/** Put kroz djecu, npr. `path(root, 'AccountingSupplierParty', 'Party', 'PartyName')`. */
const path = (start: Element | null, ...names: string[]): Element | null =>
  names.reduce<Element | null>((node, name) => childByName(node, name), start);

const text = (el: Element | null): string | null => {
  const value = el?.textContent?.trim();
  return value && value.length > 0 ? value : null;
};

const num = (el: Element | null): number | null => {
  const raw = text(el);
  if (raw === null) return null;
  // UBL koristi točku kao decimalni separator; dopuštamo i zarez iz tolerancije.
  const parsed = Number(raw.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

/** UBL datum je `YYYY-MM-DD`; ostalo odbacujemo umjesto da nagađamo. */
const isoDate = (el: Element | null): string | null => {
  const raw = text(el);
  if (!raw) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
};

/** `HR12345678901` → `12345678901`. */
const extractOib = (raw: string | null): string | null => {
  if (!raw) return null;
  const digits = raw.replace(/[^0-9]/g, '');
  return digits.length === 11 ? digits : null;
};

const parseParty = (partyRoot: Element | null): EracunParty => {
  const party = childByName(partyRoot, 'Party');
  const name =
    text(path(party, 'PartyName', 'Name')) ??
    text(path(party, 'PartyLegalEntity', 'RegistrationName')) ??
    null;

  const taxIdRaw =
    text(path(party, 'PartyTaxScheme', 'CompanyID')) ??
    text(path(party, 'PartyLegalEntity', 'CompanyID')) ??
    text(path(party, 'PartyIdentification', 'ID')) ??
    null;

  return { name, oib: extractOib(taxIdRaw), taxIdRaw };
};

const parseLines = (root: Element): EracunLine[] => {
  const lineEls = [...childrenByName(root, 'InvoiceLine'), ...childrenByName(root, 'CreditNoteLine')];

  return lineEls.map((line) => {
    const item = childByName(line, 'Item');
    const quantity =
      num(childByName(line, 'InvoicedQuantity')) ??
      num(childByName(line, 'CreditedQuantity')) ??
      1;
    const lineAmount = num(childByName(line, 'LineExtensionAmount')) ?? 0;
    const unitPrice = num(path(line, 'Price', 'PriceAmount'));
    const safeQuantity = quantity === 0 ? 1 : quantity;

    return {
      lineId: text(childByName(line, 'ID')),
      name: text(childByName(item, 'Name')) ?? text(childByName(item, 'Description')) ?? '',
      quantity: safeQuantity,
      unitPrice: unitPrice ?? lineAmount / safeQuantity,
      lineAmount,
      vatPercent: num(path(item, 'ClassifiedTaxCategory', 'Percent')),
    };
  });
};

const parseTaxSubtotals = (root: Element): EracunTaxSubtotal[] => {
  const out: EracunTaxSubtotal[] = [];
  for (const taxTotal of childrenByName(root, 'TaxTotal')) {
    for (const sub of childrenByName(taxTotal, 'TaxSubtotal')) {
      out.push({
        taxableAmount: num(childByName(sub, 'TaxableAmount')) ?? 0,
        taxAmount: num(childByName(sub, 'TaxAmount')) ?? 0,
        percent: num(path(sub, 'TaxCategory', 'Percent')),
        categoryId: text(path(sub, 'TaxCategory', 'ID')),
      });
    }
  }
  return out;
};

const normalizeDocType = (raw: string | null): EracunDocType => {
  if (!raw) return 'other';
  const trimmed = raw.trim();
  return (KNOWN_DOC_TYPES as string[]).includes(trimmed) ? (trimmed as EracunDocType) : 'other';
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * Parsira UBL 2.1 `Invoice` ili `CreditNote` XML.
 *
 * @throws {EracunParseError} kad sadržaj nije XML ili nije UBL dokument.
 */
export const parseUbl = (xml: string): EracunInvoice => {
  if (!xml || xml.trim().length === 0) throw new EracunParseError('empty');

  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) throw new EracunParseError('not_xml');

  const root = doc.documentElement;
  if (!root || (root.localName !== 'Invoice' && root.localName !== 'CreditNote')) {
    throw new EracunParseError('not_ubl');
  }

  const warnings: EracunWarning[] = [];

  const docTypeRaw =
    text(childByName(root, 'InvoiceTypeCode')) ??
    text(childByName(root, 'CreditNoteTypeCode')) ??
    (root.localName === 'CreditNote' ? '381' : null);
  const docType = normalizeDocType(docTypeRaw);

  const currency = (text(childByName(root, 'DocumentCurrencyCode')) ?? 'EUR').toUpperCase();
  const supplier = parseParty(childByName(root, 'AccountingSupplierParty'));
  const customer = parseParty(childByName(root, 'AccountingCustomerParty'));

  const lines = parseLines(root);
  const taxSubtotals = parseTaxSubtotals(root);

  const monetaryTotal =
    childByName(root, 'LegalMonetaryTotal') ?? childByName(root, 'RequestedMonetaryTotal');
  const taxExclusiveAmount = num(childByName(monetaryTotal, 'TaxExclusiveAmount'));
  const taxInclusiveAmount = num(childByName(monetaryTotal, 'TaxInclusiveAmount'));
  const payableAmount = num(childByName(monetaryTotal, 'PayableAmount'));

  const taxTotalEl = childrenByName(root, 'TaxTotal')[0] ?? null;
  const taxAmount = num(childByName(taxTotalEl, 'TaxAmount'));

  const issueDate = isoDate(childByName(root, 'IssueDate'));
  const dueDate =
    isoDate(childByName(root, 'DueDate')) ??
    isoDate(descendantByName(childByName(root, 'PaymentMeans'), 'PaymentDueDate'));

  const iban = text(path(root, 'PaymentMeans', 'PayeeFinancialAccount', 'ID'));
  const paymentReference =
    text(path(root, 'PaymentMeans', 'PaymentID')) ?? text(path(root, 'PaymentTerms', 'Note')) ?? null;

  const hrFiskPresent = (() => {
    const all = root.getElementsByTagName('*');
    for (let i = 0; i < all.length; i += 1) {
      if (all[i].localName === 'HRFISK20Data') return true;
    }
    return false;
  })();

  const total = payableAmount ?? taxInclusiveAmount;
  const suggestedAmount = total === null ? null : docType === '381' ? -Math.abs(total) : total;

  // --- Upozorenja: ništa se ne prešućuje --------------------------------
  if (docType === '381') {
    warnings.push({ code: 'credit_note', params: { docType: docTypeRaw ?? '381' } });
  } else if (!NORMAL_DOC_TYPES.has(docType)) {
    warnings.push({ code: 'unusual_doc_type', params: { docType: docTypeRaw ?? '?' } });
  }
  if (currency !== 'EUR') {
    warnings.push({ code: 'foreign_currency', params: { currency } });
  }
  if (total === null) {
    warnings.push({ code: 'missing_total' });
  } else if (lines.length > 0) {
    const linesSum = round2(lines.reduce((sum, line) => sum + line.lineAmount, 0));
    const expected = round2(linesSum + (taxAmount ?? 0));
    if (Math.abs(expected - round2(total)) > 0.01) {
      warnings.push({ code: 'total_mismatch', params: { lines: expected, total: round2(total) } });
    }
  }
  if (!issueDate) warnings.push({ code: 'missing_issue_date' });
  if (!supplier.name) warnings.push({ code: 'missing_supplier' });

  return {
    invoiceNumber: text(childByName(root, 'ID')),
    docType,
    docTypeRaw,
    issueDate,
    dueDate,
    currency,
    supplier,
    customer,
    iban,
    paymentReference,
    lines,
    taxSubtotals,
    taxExclusiveAmount,
    taxAmount,
    taxInclusiveAmount,
    payableAmount,
    suggestedAmount,
    hrFiskPresent,
    warnings,
  };
};
