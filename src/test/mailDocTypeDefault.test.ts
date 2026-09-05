/**
 * MAIL UVOZ — čuvar: potvrda dokumenta BEZ tipa ne smije pasti na CHECK-u.
 *
 * Kvar (kolovoz 2026): PDF varijanta bez čitljivog tipa dokumenta → potvrda →
 * INSERT u `incoming_invoices` → `incoming_invoices_doc_type_present` odbija →
 * korisniku generična poruka. Ovdje se brani i default i pošten razlog greške.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_DOC_TYPE,
  KNOWN_DOC_TYPES,
  resolveConfirmDocType,
} from '@/lib/mail/docType';

const listSrc = readFileSync('src/components/mail/MailReviewList.tsx', 'utf8');
// Obrazac polja je od rujna 2026 izdvojen u zasebnu cjelinu.
const fieldsSrc = readFileSync('src/components/mail/MailInvoiceFields.tsx', 'utf8');
const inputSrc = readFileSync('src/components/mail/MailReviewFieldInput.tsx', 'utf8');
const softDupSrc = readFileSync(
  'supabase/functions/_shared/mailImport/softDuplicate.ts',
  'utf8',
);

describe('resolveConfirmDocType', () => {
  it('prazan/NULL tip → 380', () => {
    expect(resolveConfirmDocType(null)).toBe('380');
    expect(resolveConfirmDocType(undefined)).toBe('380');
    expect(resolveConfirmDocType('   ')).toBe('380');
    expect(DEFAULT_DOC_TYPE).toBe('380');
  });

  it('tip sa stavke se poštuje', () => {
    expect(resolveConfirmDocType('381')).toBe('381');
  });

  it('korisnikov izbor pobjeđuje nad stavkom i defaultom', () => {
    expect(resolveConfirmDocType('380', '386')).toBe('386');
    expect(resolveConfirmDocType(null, '82')).toBe('82');
    expect(resolveConfirmDocType('380', '  ')).toBe('380');
  });

  it('popis tipova pokriva pravila prihvaćanja', () => {
    for (const code of ['380', '82', '381', '384', '386', '394', '389', '393', '875', '876', '877']) {
      expect(KNOWN_DOC_TYPES).toContain(code as never);
    }
  });
});

describe('pregled stavke', () => {
  it('ima vidljivo polje „Tip dokumenta" kao select', () => {
    expect(fieldsSrc).toMatch(/key: 'doc_type'[\s\S]*?kind: 'docType'/);
    expect(inputSrc).toContain("kind === 'docType'");
    expect(inputSrc).toContain('KNOWN_DOC_TYPES');
  });

  it('potvrda razrješava tip kroz jedinstveni izvor istine', () => {
    expect(listSrc).toContain('base.doc_type = resolveConfirmDocType(');
    expect(listSrc).not.toMatch(/base\.doc_type = item\.doc_type \?\?/);
  });

  it('poruka greške nosi stvarni razlog s baze', () => {
    expect(listSrc).toContain('mailReview.errorDetail');
    expect(listSrc).toContain('failure.detail');
  });
});

describe('meka dedup najava', () => {
  it('koristi isti default 380 za prazan tip', () => {
    expect(softDupSrc).toContain("(p.docType ?? '').toString().trim() || '380'");
  });
});
