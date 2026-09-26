import { describe, expect, it } from 'vitest';
import { detectOutgoingInvoice } from '../../supabase/functions/_shared/mailImport/outgoingInvoice.ts';
import { classifyDocument } from '../../supabase/functions/_shared/mailImport/classify.ts';
import { loadPdfFixture, OWN_OIBS } from './mailClassifyFixtures';

/** Živi kvar 3179ac2e: „Račun za predujam" Tacture kupcu Cindori došao kao ulazni. */

const PREDUJAM = loadPdfFixture('3179ac2e');

describe('izlazni račun', () => {
  it('3179ac2e: izdavatelj je vlastiti profil, kupac treća strana', () => {
    expect(detectOutgoingInvoice(PREDUJAM, OWN_OIBS)).toEqual({
      outgoing: true,
      issuerOib: '33941873288',
      buyerOib: '72371910952',
    });
  });

  it('isti dokument iz perspektive kupca je ULAZNI', () => {
    expect(detectOutgoingInvoice(PREDUJAM, ['72371910952']).outgoing).toBe(false);
  });

  it('ponuda OTP Leasinga (naš naziv u zaglavlju, bez našeg OIB-a) nije izlazna', () => {
    expect(detectOutgoingInvoice(loadPdfFixture('340f858b'), OWN_OIBS).outgoing).toBe(false);
  });

  it('klasifikacija: izlazni račun, nula AI poziva, nikad račun', async () => {
    let calls = 0;
    const r = await classifyDocument(
      { sniffed: 'pdf', pdfText: PREDUJAM, subject: 'Račun za predujam', ownOibs: OWN_OIBS },
      {
        parseUbl: () => ({}),
        analyzeWithAi: async () => {
          calls += 1;
          return { classification: 'racun', extraction: {}, confidence: 'visoka' };
        },
      },
    );
    expect(r.classification).toBe('izlazni_racun');
    expect(calls).toBe(0);
  });

  it('korisnikova odluka „račun" je jača', async () => {
    const r = await classifyDocument(
      { sniffed: 'pdf', pdfText: PREDUJAM, ownOibs: OWN_OIBS, userClassification: 'racun' },
      { parseUbl: () => ({}) },
    );
    expect(r.classification).not.toBe('izlazni_racun');
  });
});
