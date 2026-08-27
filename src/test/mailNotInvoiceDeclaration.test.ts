/**
 * MAIL UVOZ — izjava pošiljatelja „ovo nije račun".
 *
 * Živi kvar (kolovoz 2026.): Meta potvrda naplate oglasa („Ovo nije faktura."
 * kao prva rečenica, bez privitka i broja dokumenta) ostajala je `nepoznato`
 * u redu za pregled i trošila korisnikovu pažnju. Pošiljateljeva vlastita
 * izjava da dokument NIJE račun mora biti jača od strojne sumnje.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  detectNotInvoiceDeclaration,
  normalizeForDeclaration,
} from '../../supabase/functions/_shared/mailImport/notInvoiceSignals.ts';
import { classifyDocument } from '../../supabase/functions/_shared/mailImport/classify.ts';
import { describeDiscardedItem } from '@/lib/mail/discardedDescription';

const META_BODY = `Ovo nije faktura.
Potvrda oglasi Meta (identifikator korisničkog računa: 1500472008214985).
Naplaćeno: 2,97 EUR za razdoblje 18.08.2026. - 24.08.2026.
Broj transakcije: 1234567890.`;

describe('detectNotInvoiceDeclaration — jezici', () => {
  it('hrvatska izjava pogađa (s dijakritikom i bez)', () => {
    expect(detectNotInvoiceDeclaration('Ovo nije faktura. Naplaćeno 2,97 EUR.').matched).toBe(true);
    expect(detectNotInvoiceDeclaration('Ovo nije racun.').matched).toBe(true);
  });

  it('engleska izjava pogađa', () => {
    expect(detectNotInvoiceDeclaration('This is not an invoice. You were charged 2.97 EUR.').matched).toBe(
      true,
    );
    expect(detectNotInvoiceDeclaration('This is not a tax invoice.').matched).toBe(true);
  });

  it('njemačka izjava pogađa', () => {
    expect(detectNotInvoiceDeclaration('Dies ist keine Rechnung. Es wurde 2,97 EUR abgebucht.').matched).toBe(
      true,
    );
  });

  it('vraća pronađenu rečenicu da razlog može citirati', () => {
    const hit = detectNotInvoiceDeclaration(META_BODY);
    expect(hit.matched).toBe(true);
    expect(hit.phrase).toBe('ovo nije faktura');
  });
});

describe('detectNotInvoiceDeclaration — normalizacija', () => {
  it('dijakritika ne smeta (đ se ručno mapira)', () => {
    expect(normalizeForDeclaration('ĐĐŽŠČĆ')).toBe('ddzscc');
    expect(detectNotInvoiceDeclaration('OVO NIJE RAČUN!').matched).toBe(true);
  });

  it('HTML tijelo ne smeta — oznake se skidaju prije traženja', () => {
    const html = '<html><body><p>Ovo nije faktura.</p><p>Naplaćeno <b>2,97</b> EUR.</p></body></html>';
    expect(detectNotInvoiceDeclaration(html).matched).toBe(true);
  });
});

describe('detectNotInvoiceDeclaration — lažni okidači', () => {
  it('sama riječ „faktura" usred rečenice ne pokreće pravilo', () => {
    expect(detectNotInvoiceDeclaration('Molimo platite fakturu do petka.').matched).toBe(false);
    expect(detectNotInvoiceDeclaration('Račun broj 123-456-1, dospijeće 15.08.2026.').matched).toBe(false);
  });

  it('fraza usred rečenice (nije samostalna izjava) ne pokreće pravilo', () => {
    expect(detectNotInvoiceDeclaration('Napomena: ovo nije faktura za knjiženje.').matched).toBe(false);
  });

  it('prazan ulaz je siguran', () => {
    expect(detectNotInvoiceDeclaration('').matched).toBe(false);
    expect(detectNotInvoiceDeclaration(null).matched).toBe(false);
  });
});

describe('classifyDocument — „ovo nije račun" izjava', () => {
  const aiSpy = () =>
    vi.fn(async () => ({ classification: 'racun' as const, extraction: null, confidence: 'niska' as const }));

  it('Meta potvrda: nije_za_nas / potvrda_placanja / visoka / heuristika, NULA AI poziva', async () => {
    const analyzeWithAi = aiSpy();
    const result = await classifyDocument(
      {
        sniffed: 'unknown',
        fromHeader: 'Meta for Business <noreply@business-updates.facebook.com>',
        subject: 'Potvrda oglasi Meta (identifikator korisničkog računa: 1500472008214985)',
        bodyText: META_BODY,
      },
      { parseUbl: () => ({}), analyzeWithAi },
    );
    expect(result.classification).toBe('nije_za_nas');
    expect(result.docType).toBe('potvrda_placanja');
    expect(result.confidence).toBe('visoka');
    expect(result.route).toBe('heuristika');
    expect(result.aiCalls).toBe(0);
    expect(analyzeWithAi).not.toHaveBeenCalled();
    expect(result.extraction?.not_invoice_declaration).toBe('ovo nije faktura');
  });

  it('UBL e-račun koji negdje sadrži tu rečenicu OSTAJE racun', async () => {
    const result = await classifyDocument(
      {
        sniffed: 'xml',
        xml: '<Invoice><cbc:ID>1</cbc:ID></Invoice><!-- ovo nije faktura -->',
        bodyText: META_BODY,
      },
      { parseUbl: () => ({ invoiceTypeCode: '380' }), analyzeWithAi: aiSpy() },
    );
    expect(result.classification).toBe('racun');
    expect(result.route).toBe('ubl');
  });

  it('korisnikova odluka „ovo je račun" preživi — pravilo se ne primjenjuje', async () => {
    const analyzeWithAi = aiSpy();
    const result = await classifyDocument(
      {
        sniffed: 'unknown',
        subject: 'Potvrda oglasi Meta',
        bodyText: META_BODY,
        userClassification: 'racun',
      },
      { parseUbl: () => ({}), analyzeWithAi },
    );
    expect(result.classification).not.toBe('nije_za_nas');
  });
});

describe('describeDiscardedItem — potvrda plaćanja ima svoj razlog', () => {
  it('s izjavom u extractionu: vlastiti naslov i razlog', () => {
    const d = describeDiscardedItem({
      classification: 'nije_za_nas',
      extraction: { not_invoice_declaration: 'ovo nije faktura' },
    });
    expect(d.kind).toBe('special');
    expect(d.titleKey).toBe('documents.discarded.kind.potvrda_placanja.title');
    expect(d.reasonKey).toBe('documents.discarded.kind.potvrda_placanja.reason');
    expect(d.reasonFallback).toBe('Pošiljatelj sam navodi da ovo nije račun.');
  });

  it('bez izjave: generički razlog za nije_za_nas ostaje', () => {
    const d = describeDiscardedItem({ classification: 'nije_za_nas' });
    expect(d.reasonKey).toBe('documents.discarded.kind.nije_za_nas.reason');
  });
});
