import { describe, expect, it } from 'vitest';
import { parseUbl } from '@/lib/eracun/parseUbl';
import { EracunParseError } from '@/lib/eracun/types';

/**
 * Fixture 1 — bankovne naknade: UBL 2.1 Invoice, tip 380, osam stavki, bez PDV-a,
 * s hrvatskim proširenjem `hrext:HRFISK20Data`.
 */
const bankFeesLines = [
  ['1', 'Naknada za vođenje računa', '12.00'],
  ['2', 'Naknada za internet bankarstvo', '3.50'],
  ['3', 'Naknada za platni promet u zemlji', '4.25'],
  ['4', 'Naknada za platni promet u inozemstvu', '8.00'],
  ['5', 'Naknada za izdavanje kartice', '6.00'],
  ['6', 'Naknada za izvadak u papirnatom obliku', '2.15'],
  ['7', 'Naknada za trajni nalog', '1.10'],
  ['8', 'Naknada za uplatu gotovine', '3.00'],
];

const BANK_FEES_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"
         xmlns:hrext="http://www.porezna-uprava.hr/fin/2021/types/f73">
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent>
        <hrext:HRFISK20Data>
          <hrext:JIR>1a2b3c4d-5e6f</hrext:JIR>
        </hrext:HRFISK20Data>
      </ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>
  <cbc:ID>2026-0001-BANK</cbc:ID>
  <cbc:IssueDate>2026-07-31</cbc:IssueDate>
  <cbc:DueDate>2026-08-15</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>Primjer banka d.d.</cbc:Name></cac:PartyName>
      <cac:PartyTaxScheme><cbc:CompanyID>HR12345678901</cbc:CompanyID></cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyLegalEntity><cbc:RegistrationName>Tactura j.d.o.o.</cbc:RegistrationName>
        <cbc:CompanyID>HR98765432109</cbc:CompanyID></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:PaymentMeans>
    <cac:PayeeFinancialAccount><cbc:ID>HR1723600001101234565</cbc:ID></cac:PayeeFinancialAccount>
  </cac:PaymentMeans>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="EUR">0.00</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="EUR">40.00</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="EUR">0.00</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>E</cbc:ID><cbc:Percent>0</cbc:Percent></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:TaxExclusiveAmount currencyID="EUR">40.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="EUR">40.00</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="EUR">40.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  ${bankFeesLines
    .map(
      ([id, name, amount]) => `<cac:InvoiceLine>
    <cbc:ID>${id}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="H87">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="EUR">${amount}</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>${name}</cbc:Name>
      <cac:ClassifiedTaxCategory><cbc:ID>E</cbc:ID><cbc:Percent>0</cbc:Percent></cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="EUR">${amount}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>`
    )
    .join('\n  ')}
</Invoice>`;

/** Fixture 2 — leasing kamata: UBL 2.1 Invoice, tip 394, jedna stavka, PDV 25 %. */
const LEASING_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"
         xmlns:hrext="http://www.porezna-uprava.hr/fin/2021/types/f73">
  <ext:UBLExtensions><ext:UBLExtension><ext:ExtensionContent>
    <hrext:HRFISK20Data><hrext:JIR>aaaa-bbbb</hrext:JIR></hrext:HRFISK20Data>
  </ext:ExtensionContent></ext:UBLExtension></ext:UBLExtensions>
  <cbc:ID>LZ-2026-000456</cbc:ID>
  <cbc:IssueDate>2026-07-01</cbc:IssueDate>
  <cbc:DueDate>2026-07-10</cbc:DueDate>
  <cbc:InvoiceTypeCode>394</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cac:PartyName><cbc:Name>Primjer Leasing d.o.o.</cbc:Name></cac:PartyName>
    <cac:PartyTaxScheme><cbc:CompanyID>HR11223344556</cbc:CompanyID></cac:PartyTaxScheme>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cac:PartyLegalEntity><cbc:RegistrationName>Tactura j.d.o.o.</cbc:RegistrationName></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:PaymentMeans>
    <cac:PayeeFinancialAccount><cbc:ID>HR9124020061100000001</cbc:ID></cac:PayeeFinancialAccount>
  </cac:PaymentMeans>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="EUR">30.00</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="EUR">120.00</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="EUR">30.00</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:TaxExclusiveAmount currencyID="EUR">120.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="EUR">150.00</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="EUR">150.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="H87">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="EUR">120.00</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>Kamata po ugovoru o leasingu 07/2026</cbc:Name>
      <cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent></cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="EUR">120.00</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

describe('parseUbl — bankovne naknade (380, 8 stavki, bez PDV-a)', () => {
  const invoice = parseUbl(BANK_FEES_XML);

  it('čita zaglavlje, dobavljača i OIB', () => {
    expect(invoice.invoiceNumber).toBe('2026-0001-BANK');
    expect(invoice.docType).toBe('380');
    expect(invoice.issueDate).toBe('2026-07-31');
    expect(invoice.dueDate).toBe('2026-08-15');
    expect(invoice.currency).toBe('EUR');
    expect(invoice.supplier.name).toBe('Primjer banka d.d.');
    expect(invoice.supplier.oib).toBe('12345678901');
    expect(invoice.customer.oib).toBe('98765432109');
    expect(invoice.iban).toBe('HR1723600001101234565');
    expect(invoice.hrFiskPresent).toBe(true);
  });

  it('čita svih osam stavki i nultu poreznu razradu', () => {
    expect(invoice.lines).toHaveLength(8);
    expect(invoice.lines[0]).toMatchObject({ name: 'Naknada za vođenje računa', lineAmount: 12, vatPercent: 0 });
    expect(invoice.taxAmount).toBe(0);
    expect(invoice.taxSubtotals).toEqual([
      { taxableAmount: 40, taxAmount: 0, percent: 0, categoryId: 'E' },
    ]);
    expect(invoice.payableAmount).toBe(40);
    expect(invoice.suggestedAmount).toBe(40);
  });

  it('nema upozorenja — uobičajen račun u EUR-ima', () => {
    expect(invoice.warnings).toEqual([]);
  });

});

describe('parseUbl — leasing kamata (394, jedna stavka)', () => {
  const invoice = parseUbl(LEASING_XML);

  it('čita tip 394 kao uobičajen račun bez upozorenja', () => {
    expect(invoice.docType).toBe('394');
    expect(invoice.warnings).toEqual([]);
    expect(invoice.lines).toHaveLength(1);
    expect(invoice.lines[0].vatPercent).toBe(25);
    expect(invoice.taxAmount).toBe(30);
    expect(invoice.taxExclusiveAmount).toBe(120);
    expect(invoice.suggestedAmount).toBe(150);
    expect(invoice.hrFiskPresent).toBe(true);
  });

});

describe('parseUbl — rubni slučajevi', () => {
  it('odobrenje (381) predlaže negativan iznos i upozorava', () => {
    const invoice = parseUbl(LEASING_XML.replace('>394<', '>381<'));
    expect(invoice.docType).toBe('381');
    expect(invoice.suggestedAmount).toBe(-150);
    expect(invoice.warnings.map((w) => w.code)).toContain('credit_note');
  });

  it('nepoznat tip dokumenta ne prolazi tiho', () => {
    const invoice = parseUbl(LEASING_XML.replace('>394<', '>325<'));
    expect(invoice.docType).toBe('other');
    expect(invoice.docTypeRaw).toBe('325');
    expect(invoice.warnings.map((w) => w.code)).toContain('unusual_doc_type');
  });

  it('strana valuta se prijavljuje i ne preračunava', () => {
    const invoice = parseUbl(LEASING_XML.replace('<cbc:DocumentCurrencyCode>EUR', '<cbc:DocumentCurrencyCode>USD'));
    expect(invoice.currency).toBe('USD');
    expect(invoice.suggestedAmount).toBe(150);
    expect(invoice.warnings.map((w) => w.code)).toContain('foreign_currency');
  });

  it('nesklad zbroja stavki i ukupnog iznosa se prijavljuje', () => {
    const invoice = parseUbl(LEASING_XML.replace('<cbc:PayableAmount currencyID="EUR">150.00', '<cbc:PayableAmount currencyID="EUR">999.00'));
    expect(invoice.warnings.map((w) => w.code)).toContain('total_mismatch');
  });

  it('CreditNote korijen se prepoznaje kao 381', () => {
    const xml = `<?xml version="1.0"?><CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"
      xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
      xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2">
      <cbc:ID>ODB-1</cbc:ID><cbc:IssueDate>2026-07-05</cbc:IssueDate>
      <cac:AccountingSupplierParty><cac:Party><cac:PartyName><cbc:Name>Dobavljač d.o.o.</cbc:Name></cac:PartyName></cac:Party></cac:AccountingSupplierParty>
      <cac:LegalMonetaryTotal><cbc:PayableAmount currencyID="EUR">25.00</cbc:PayableAmount></cac:LegalMonetaryTotal>
      <cac:CreditNoteLine><cbc:ID>1</cbc:ID><cbc:CreditedQuantity>1</cbc:CreditedQuantity>
        <cbc:LineExtensionAmount currencyID="EUR">25.00</cbc:LineExtensionAmount>
        <cac:Item><cbc:Name>Povrat naknade</cbc:Name></cac:Item></cac:CreditNoteLine>
    </CreditNote>`;
    const invoice = parseUbl(xml);
    expect(invoice.docType).toBe('381');
    expect(invoice.suggestedAmount).toBe(-25);
    expect(invoice.lines).toHaveLength(1);
  });

  it('odbija prazan sadržaj i ne-UBL XML', () => {
    expect(() => parseUbl('')).toThrow(EracunParseError);
    expect(() => parseUbl('<root><a/></root>')).toThrow(EracunParseError);
    try {
      parseUbl('<root><a/></root>');
    } catch (error) {
      expect((error as EracunParseError).code).toBe('not_ubl');
    }
  });
});
