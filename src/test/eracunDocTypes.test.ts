import { describe, expect, it } from 'vitest';
import { parseUbl } from '@/lib/eracun/parseUbl';
import { evaluateInvoice } from '@/lib/eracun/acceptance';

/**
 * Regresija: HEP račun (tip 82 — „Metered services invoice"). Prije je bio
 * tvrdo odbijen jer je popis bio 380/394/381.
 */
const meteredLines = [
  ['1', 'Električna energija — viša tarifa', '18.40', '25'],
  ['2', 'Električna energija — niža tarifa', '9.60', '25'],
  ['3', 'Obračunska snaga', '6.12', '25'],
  ['4', 'Naknada za mjerne usluge', '8.83', '25'],
  ['5', 'Naknada za obnovljive izvore', '6.98', '25'],
];

const line = ([id, name, amount, vat]: string[]) => `
  <cac:InvoiceLine>
    <cbc:ID>${id}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="H87">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="EUR">${amount}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${name}</cbc:Name>
      <cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>${vat}</cbc:Percent></cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="EUR">${amount}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>`;

const invoiceXml = (opts: {
  typeCode: string;
  id: string;
  lines: string;
  taxable: string;
  tax: string;
  total: string;
  period?: string;
}) => `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>${opts.id}</cbc:ID>
  <cbc:IssueDate>2026-01-10</cbc:IssueDate>
  <cbc:DueDate>2026-01-26</cbc:DueDate>
  <cbc:InvoiceTypeCode>${opts.typeCode}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  ${opts.period ?? ''}
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>HEP Elektra d.o.o.</cbc:Name></cac:PartyName>
      <cac:PartyTaxScheme><cbc:CompanyID>HR43965974818</cbc:CompanyID></cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>Kupac d.o.o.</cbc:Name></cac:PartyName>
      <cac:PartyTaxScheme><cbc:CompanyID>HR98765432109</cbc:CompanyID></cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="EUR">${opts.tax}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="EUR">${opts.taxable}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="EUR">${opts.tax}</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:TaxExclusiveAmount currencyID="EUR">${opts.taxable}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="EUR">${opts.total}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="EUR">${opts.total}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  ${opts.lines}
</Invoice>`;

const METERED_XML = invoiceXml({
  typeCode: '82',
  id: 'HEP-2026-000123',
  lines: meteredLines.map(line).join('\n'),
  taxable: '49.93',
  tax: '12.51',
  total: '62.44',
  period: `<cac:InvoicePeriod><cbc:StartDate>2025-12-01</cbc:StartDate><cbc:EndDate>2025-12-31</cbc:EndDate></cac:InvoicePeriod>`,
});

const CONSTRUCTION_XML = invoiceXml({
  typeCode: '875',
  id: 'SIT-3/2026',
  lines: line(['1', 'Privremena situacija br. 3 — armirano-betonski radovi', '12000.00', '25']),
  taxable: '12000.00',
  tax: '3000.00',
  total: '15000.00',
});

const UNKNOWN_XML = invoiceXml({
  typeCode: '971',
  id: 'X-1',
  lines: line(['1', 'Nešto', '100.00', '25']),
  taxable: '100.00',
  tax: '25.00',
  total: '125.00',
});

describe('eRačun — tip 82 (mjerene usluge, HEP)', () => {
  const invoice = parseUbl(METERED_XML);

  it('parsira pet stavki, PDV 25% i ukupan iznos', () => {
    expect(invoice.docType).toBe('82');
    expect(invoice.docTypeRaw).toBe('82');
    expect(invoice.lines).toHaveLength(5);
    expect(invoice.lines.every((l) => l.vatPercent === 25)).toBe(true);
    expect(invoice.taxAmount).toBe(12.51);
    expect(invoice.payableAmount).toBe(62.44);
    expect(invoice.dueDate).toBe('2026-01-26');
  });

  it('prolazi kao normalan pozitivan račun, bez upozorenja', () => {
    const res = evaluateInvoice(invoice);
    expect(res).toMatchObject({ accepted: true, amount: 62.44, needsDecision: false });
    expect(res.cautions).toEqual([]);
    expect(invoice.warnings.map((w) => w.code)).not.toContain('unusual_doc_type');
  });
});

describe('eRačun — građevinska situacija (875)', () => {
  it('prolazi kao normalan pozitivan račun', () => {
    const res = evaluateInvoice(parseUbl(CONSTRUCTION_XML));
    expect(res).toMatchObject({ accepted: true, amount: 15000, needsDecision: false });
    expect(res.cautions).toEqual([]);
  });
});

describe('eRačun — prošireni popis tipova', () => {
  const evalType = (typeCode: string) =>
    evaluateInvoice(
      parseUbl(
        invoiceXml({
          typeCode,
          id: `T-${typeCode}`,
          lines: line(['1', 'Stavka', '100.00', '25']),
          taxable: '100.00',
          tax: '25.00',
          total: '125.00',
        }),
      ),
    );

  it.each(['380', '82', '875', '876', '877', '394', '389', '393'])(
    'tip %s prolazi s pozitivnim iznosom',
    (code) => {
      expect(evalType(code)).toMatchObject({ accepted: true, amount: 125, needsDecision: false });
    },
  );

  it('381 prolazi s negativnim iznosom', () => {
    expect(evalType('381')).toMatchObject({ accepted: true, amount: -125, isCreditNote: true });
  });

  it('384 prolazi uz upozorenje o ispravku', () => {
    const res = evalType('384');
    expect(res.accepted).toBe(true);
    expect(res.cautions).toEqual([{ code: 'correction', params: { docType: '384' } }]);
  });

  it('386 prolazi uz upozorenje o avansu', () => {
    const res = evalType('386');
    expect(res.accepted).toBe(true);
    expect(res.cautions).toEqual([{ code: 'prepayment', params: { docType: '386' } }]);
  });
});

describe('eRačun — nepoznat tip', () => {
  it('nije odbijen, nego označen za odluku korisnika', () => {
    const res = evaluateInvoice(parseUbl(UNKNOWN_XML));
    expect(res.accepted).toBe(true);
    expect(res.needsDecision).toBe(true);
    expect(res.cautions).toEqual([{ code: 'unknown_doc_type', params: { docType: '971' } }]);
  });

  it('valuta ≠ EUR i dalje odbija dokument', () => {
    const usd = parseUbl(UNKNOWN_XML.replace('<cbc:DocumentCurrencyCode>EUR', '<cbc:DocumentCurrencyCode>USD'));
    expect(evaluateInvoice(usd)).toMatchObject({ accepted: false, reason: 'unsupported_currency' });
  });
});
