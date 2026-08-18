import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeIban } from '@/hooks/useStatementSourceMemory';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

/**
 * Čuvari za bankovne izvode iz e-maila: kartica, most prema postojećem uvozu i
 * pamćenje pripadnosti izvoru.
 */

describe('kartica izvoda u redu pregleda', () => {
  const list = read('src/components/mail/MailReviewList.tsx');
  const card = read('src/components/mail/StatementReviewCard.tsx');

  it('popis grana na karticu izvoda prije polja računa', () => {
    const branch = list.indexOf("item.classification === 'izvod'");
    const fields = list.indexOf('const extraction = (item.extraction ?? {})');
    expect(branch).toBeGreaterThan(-1);
    expect(branch).toBeLessThan(fields);
  });

  it('kartica ne nudi polja računa ni potvrdu u eRačune', () => {
    expect(card).not.toContain('supplier_oib');
    expect(card).not.toContain('total_amount');
    expect(card).not.toContain('mail_item_confirm');
  });

  it('kartica traži izvor plaćanja prije uvoza', () => {
    expect(card).toContain('!selectedSource');
    expect(card).toContain("t('statements.import'");
  });
});

describe('most prema postojećem uvozu izvoda', () => {
  const bridge = read('src/hooks/useStatementImport.ts');

  it('koristi postojeći startPdfImport, ne novi parser', () => {
    expect(bridge).toContain('pdfImport.startPdfImport');
    expect(bridge).not.toContain('startPDFParseJob');
  });

  it('provjerava otisak izvoda prije otvaranja uvoza', () => {
    const hash = bridge.indexOf('findExistingStatement');
    const start = bridge.indexOf('pdfImport.startPdfImport');
    expect(hash).toBeGreaterThan(-1);
    expect(hash).toBeLessThan(start);
  });

  it('uspješan uvoz označava stavku kao povezan', () => {
    expect(bridge).toContain("status: 'povezan'");
  });

  it('nosi izvornu mail-stavku do serverskog zapisa kao SHA fallback', () => {
    const context = read('src/contexts/PdfImportContext.tsx');
    const host = read('src/components/pdf-import/GlobalPDFImportHost.tsx');
    const review = read('src/pages/ImportReview.tsx');
    expect(bridge).toContain('sourceDocumentItemId: params.mailItemId ?? null');
    expect(context).toContain('sourceDocumentItemId?: string | null');
    expect(host).toContain('sourceDocumentItemId: pdfImport._pendingPdfRef.current?.sourceDocumentItemId ?? null');
    expect(review).toContain('sourceDocumentItemId: payload.statement.sourceDocumentItemId ?? null');
  });
});

describe('serverska istina završetka uvoza', () => {
  const migration = read('supabase/migrations/20260818035055_e0e614a0-3fb5-4d14-8b5a-1b43f9f1326f.sql');

  it('povezuje samo istog vlasnika i isti SHA u aktivnim stanjima', () => {
    expect(migration).toContain('item.owner_user_id = NEW.user_id');
    expect(migration).toContain('attachment.content_sha256 = NEW.file_hash');
    expect(migration).toContain("item.status IN ('na_pregledu', 'ceka_prvi_mail')");
  });

  it('ima idempotentni fallback na izričitu izvornu stavku', () => {
    expect(migration).toContain('NEW.source_document_item_id IS NOT NULL');
    expect(migration).toContain('item.id = NEW.source_document_item_id');
    expect(migration).toContain('AFTER INSERT ON public.imported_statements');
  });

  it('okidačka funkcija nije dostupna klijentskim ulogama', () => {
    expect(migration).toContain('FROM PUBLIC, anon, authenticated');
  });
});

describe('pamćenje pripadnosti izvoru', () => {
  const memory = read('src/hooks/useStatementSourceMemory.ts');
  const card = read('src/components/mail/StatementReviewCard.tsx');

  it('IBAN se uspoređuje bez razmaka i velikih/malih slova', () => {
    expect(normalizeIban(' hr12 1001 0051 ')).toBe('HR121001 0051'.replace(/\s/g, ''));
  });

  it('pravilo nastaje samo uz izričitu kvačicu', () => {
    expect(card).toContain('remember && accountIdentifier');
    expect(card).toContain('data-testid="remember-statement-source"');
  });

  it('predodabir ide kroz slojeviti matcher (pravilo > IBAN > ime banke)', () => {
    const card2 = card.replace(/\s+/g, ' ');
    expect(card2).toContain('pickStatementSource({');
    expect(card2).toContain('bankAccountSourceId: fromBank');
    expect(memory).toContain('suggestSourceFromBankAccounts');
  });

  it('pravila se mogu zaboraviti iz postavki', () => {
    const section = read('src/components/settings/StatementSourcesSection.tsx');
    expect(section).toContain('forgetRule');
    const categories = read('src/components/settings/settingsCategories.ts');
    expect(categories).toContain("'statementSources'");
  });
});
