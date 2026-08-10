/**
 * MEKA BRANA DUPLIKATA — čuvar na doslovnom živom slučaju (kolovoz 2026).
 *
 * FINA račun stigao dvaput: XML nosi "I08-0626-390029", AI s PDF-a čita
 * "08-0626-390029". Doslovna usporedba je propustila duplikat.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  normalizeInvoiceNumber,
  invoiceNumbersMatch,
  findDuplicateCandidate,
} from '@/lib/mail/invoiceNumberMatch';

const FINA_OIB = '85821130368';

const existing = {
  id: '336ac3e0',
  supplier_oib: FINA_OIB,
  supplier_name: 'Fina - Financijska agencija',
  invoice_number: 'I08-0626-390029',
  total_amount: 64.7,
  due_date: '2026-08-20',
  issue_date: '2026-08-09',
  doc_type: '380',
};

describe('normalizeInvoiceNumber', () => {
  it('uppercase + samo slovo/znamenka', () => {
    expect(normalizeInvoiceNumber(' i08-0626/390029 ')).toBe('I080626390029');
    expect(normalizeInvoiceNumber(null)).toBe('');
  });
});

describe('invoiceNumbersMatch — afiks tolerancija ≤2', () => {
  it('doslovni živi par se poklapa', () => {
    expect(invoiceNumbersMatch('I08-0626-390029', '08-0626-390029')).toBe(true);
  });
  it('identičan broj', () => {
    expect(invoiceNumbersMatch('380/1/1', '380-1-1')).toBe(true);
  });
  it('razlika veća od 2 znaka ne prolazi', () => {
    expect(invoiceNumbersMatch('ABC08-0626-390029', '08-0626-390029')).toBe(false);
  });
  it('rupa u sredini ne prolazi', () => {
    expect(invoiceNumbersMatch('080626390029', '080626X390029')).toBe(false);
  });
  it('prazno nikad ne poklapa', () => {
    expect(invoiceNumbersMatch('', '08-0626-390029')).toBe(false);
  });
});

describe('findDuplicateCandidate — širi uvjet', () => {
  it('isti OIB + normalizirano isti broj → upozorenje', () => {
    const m = findDuplicateCandidate([existing], {
      supplierOib: FINA_OIB,
      invoiceNumber: '08-0626-390029',
      totalAmount: 64.7,
      dueDate: '2026-08-20',
      docType: '380',
    });
    expect(m?.candidate.id).toBe('336ac3e0');
  });

  it('različit broj, ali isti OIB + iznos + dospijeće → upozorenje', () => {
    const m = findDuplicateCandidate([existing], {
      supplierOib: FINA_OIB,
      invoiceNumber: 'POTPUNO-DRUGI-9999',
      totalAmount: 64.7,
      dueDate: '2026-08-20',
    });
    expect(m?.reason).toBe('iznos_datum');
  });

  it('različit OIB, isti broj → bez upozorenja', () => {
    expect(
      findDuplicateCandidate([existing], {
        supplierOib: '12345678901',
        invoiceNumber: 'I08-0626-390029',
        totalAmount: 64.7,
        dueDate: '2026-08-20',
      }),
    ).toBeNull();
  });

  it('isti OIB, drukčiji iznos i broj → bez upozorenja', () => {
    expect(
      findDuplicateCandidate([existing], {
        supplierOib: FINA_OIB,
        invoiceNumber: '99-1111-000001',
        totalAmount: 120,
        dueDate: '2026-09-30',
        issueDate: '2026-09-01',
      }),
    ).toBeNull();
  });

  it('bez OIB-a se ne odlučuje', () => {
    expect(
      findDuplicateCandidate([existing], { supplierOib: '', invoiceNumber: 'I08-0626-390029' }),
    ).toBeNull();
  });
});

describe('poslužitelj i UI dijele istu usporedbu', () => {
  const softDup = readFileSync(
    'supabase/functions/_shared/mailImport/softDuplicate.ts',
    'utf8',
  );
  const hook = readFileSync('src/hooks/useMailDuplicateCandidates.ts', 'utf8');
  const list = readFileSync('src/components/mail/MailReviewList.tsx', 'utf8');

  it('softDuplicate koristi zajednički modul, ne vlastiti uvjet', () => {
    expect(softDup).toContain('findDuplicateCandidate');
    expect(softDup).toContain("(p.docType ?? '').toString().trim() || '380'");
  });

  it('UI hook koristi isti modul', () => {
    expect(hook).toContain('findDuplicateCandidate');
  });

  it('kartica nudi svjesnu potvrdu, bez tvrde brane', () => {
    expect(list).toContain('mailReview.duplicate.warning');
    expect(list).toContain('mailReview.duplicate.acknowledge');
    expect(list).toContain('duplicate-warning');
  });
});
