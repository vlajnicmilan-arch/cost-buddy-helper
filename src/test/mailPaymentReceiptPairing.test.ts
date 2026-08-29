import { describe, expect, it } from 'vitest';
import {
  detectPaymentReceipt,
  pairReceiptsWithInvoices,
  parsePaidDateIso,
  splitPairedReceipts,
} from '@/lib/mail/receiptSignals';

/**
 * Živi kvar (29.8.2026): jedan mail Lovable Labsa nosio je račun i potvrdu
 * plaćanja tog istog računa — korisnik je dobio DVA ulazna računa za jedno
 * plaćanje. Doslovni tekstovi iz te poruke čuvaju pravilo.
 */

const INVOICE_PDF = `Page 1 of 1
Invoice
Invoice number
DFWF2F5F0094
Date of issue
August 29, 2026
Date due
August 29, 2026
$25.00 due August 29, 2026`;

const RECEIPT_PDF = `Page 1 of 1
Receipt
Invoice number
DFWF2F5F0094
Receipt number
202167961639
Date paid
August 29, 2026
$25.00 paid August 29, 2026`;

const RECEIPT_HR = `Potvrda o plaćanju
Broj računa: 114-1-1
Broj potvrde: 55912
Datum plaćanja: 29.08.2026.`;

const RECEIPT_DE = `Zahlungsbeleg
Rechnungsnummer: RE-2026-77
Belegnummer: 90211
Bezahlt am: 29.08.2026`;

describe('prepoznavanje potvrde o plaćanju', () => {
  it('račun iz sporne poruke NIJE potvrda', () => {
    expect(detectPaymentReceipt(INVOICE_PDF).matched).toBe(false);
  });

  it('potvrda iz sporne poruke je prepoznata s brojevima i datumom', () => {
    const d = detectPaymentReceipt(RECEIPT_PDF);
    expect(d.matched).toBe(true);
    expect(d.invoiceNumber).toBe('DFWF2F5F0094');
    expect(d.receiptNumber).toBe('202167961639');
    expect(d.paidDate).toBe('August 29, 2026');
  });

  it('hrvatska i njemačka inačica se prepoznaju', () => {
    expect(detectPaymentReceipt(RECEIPT_HR).matched).toBe(true);
    expect(detectPaymentReceipt(RECEIPT_DE).matched).toBe(true);
  });

  it('riječ „receipt" izvan teksta dokumenta ne pokreće pravilo', () => {
    // Predmet maila i naziv datoteke nisu ulaz — ovdje ih namjerno nema.
    expect(detectPaymentReceipt('Your receipt from Lovable Labs #2021').matched).toBe(false);
    expect(detectPaymentReceipt(INVOICE_PDF.replace('Invoice\n', 'Invoice\n')).matched).toBe(false);
  });

  it('samo naslov bez broja potvrde i datuma nije dovoljan', () => {
    expect(detectPaymentReceipt('Receipt\nSome marketing text').matched).toBe(false);
  });
});

describe('par račun + potvrda unutar iste poruke', () => {
  it('potvrda se veže na račun s istim brojem', () => {
    const pairs = pairReceiptsWithInvoices([
      { id: 'a1', text: INVOICE_PDF, invoiceNumber: 'DFWF2F5F0094' },
      { id: 'a2', text: RECEIPT_PDF, invoiceNumber: 'DFWF2F5F0094' },
    ]);
    expect(pairs).toEqual([
      {
        receiptItemId: 'a2',
        invoiceItemId: 'a1',
        invoiceNumber: 'DFWF2F5F0094',
        receiptNumber: '202167961639',
        paidDate: 'August 29, 2026',
      },
    ]);
  });

  it('potvrda bez pripadajućeg računa ostaje sama', () => {
    expect(pairReceiptsWithInvoices([{ id: 'r1', text: RECEIPT_PDF }])).toEqual([]);
  });

  it('dva različita računa u istom mailu ostaju dva računa', () => {
    const drugi = INVOICE_PDF.replace('DFWF2F5F0094', 'DFWF2F5F0095');
    expect(
      pairReceiptsWithInvoices([
        { id: 'a1', text: INVOICE_PDF },
        { id: 'a2', text: drugi },
      ]),
    ).toEqual([]);
  });
});

describe('red pregleda skriva vezanu potvrdu', () => {
  const items = [
    { id: 'a1', doc_type: '380', extraction: { invoice_number: 'DFWF2F5F0094' } },
    {
      id: 'a2',
      doc_type: 'potvrda_placanja',
      extraction: { related_item_id: 'a1', receipt_number: '202167961639', paid_date: 'August 29, 2026' },
    },
  ];

  it('potvrda nema vlastitu karticu, nego se veže uz račun', () => {
    const { visible, receiptsByInvoiceId } = splitPairedReceipts(items);
    expect(visible.map((i) => i.id)).toEqual(['a1']);
    expect(receiptsByInvoiceId.get('a1')?.receiptNumber).toBe('202167961639');
  });

  it('potvrda čiji račun nije u redu ostaje vidljiva', () => {
    const { visible } = splitPairedReceipts([items[1]]);
    expect(visible.map((i) => i.id)).toEqual(['a2']);
  });
});

describe('datum plaćanja u ISO obliku', () => {
  it('engleski i hrvatski oblik', () => {
    expect(parsePaidDateIso('August 29, 2026')).toBe('2026-08-29');
    expect(parsePaidDateIso('29.08.2026.')).toBe('2026-08-29');
  });

  it('neprepoznat oblik vraća null', () => {
    expect(parsePaidDateIso('uskoro')).toBeNull();
    expect(parsePaidDateIso(null)).toBeNull();
  });
});
