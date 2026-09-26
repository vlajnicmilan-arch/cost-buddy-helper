import { describe, expect, it } from 'vitest';
import { groupOfferAttachments } from '../../supabase/functions/_shared/mailImport/offerGrouping.ts';
import { splitPairedReceipts } from '@/lib/mail/receiptSignals';

/**
 * Živi kvar (rujan 2026): poruka Alfa lidera (6ae4c01f) dala je 13 stavki
 * `ponuda`. Ekstrakcije ispod su doslovne iz baze.
 */
const ALFA_IDS = [
  'b0f1699b', '4deb5c98', '5d5a70fc', '8a1ac28c', '2c8ebb2d', 'f86ba7b2', 'f2e4be11',
  '40383332', '3bf443a1', 'b3fb36ab', '323dc70f', 'b0a8d0a6', 'd7b28de4',
];
const alfa = ALFA_IDS.map((id) => ({
  id,
  classification: 'ponuda',
  extraction: {
    supplier_name: 'Alfa lider d.o.o.',
    supplier_oib: id === '3bf443a1' ? '15316532997' : null,
    invoice_number: null,
    total_amount: null,
  } as Record<string, unknown>,
}));

describe('jedan dokument = jedna stavka', () => {
  it('Alfa lider: 13 privitaka iste ponude → 1 glavna + 12 veza', () => {
    const links = groupOfferAttachments(alfa);
    expect(links).toHaveLength(12);
    const mains = new Set(links.map((l) => l.mainItemId));
    expect([...mains]).toEqual(['3bf443a1']); // najpotpunija (ima OIB)
  });

  it('dvije ponude s različitim brojem ostaju dvije', () => {
    expect(
      groupOfferAttachments([
        { id: 'a', classification: 'ponuda', extraction: { supplier_name: 'Alfa lider d.o.o.', invoice_number: '19/2026' } },
        { id: 'b', classification: 'ponuda', extraction: { supplier_name: 'Alfa lider d.o.o.', invoice_number: '20/2026' } },
      ]),
    ).toEqual([]);
  });

  it('računi se ne grupiraju ovim pravilom', () => {
    expect(
      groupOfferAttachments([
        { id: 'a', classification: 'racun', extraction: { supplier_name: 'X d.o.o.' } },
        { id: 'b', classification: 'racun', extraction: { supplier_name: 'X d.o.o.' } },
      ]),
    ).toEqual([]);
  });

  it('red pregleda skriva privitak ponude, glavna ostaje', () => {
    const { visible } = splitPairedReceipts([
      { id: 'main', doc_type: null, extraction: {} },
      { id: 'att', doc_type: null, extraction: { related_item_id: 'main', is_offer_attachment: true } },
    ]);
    expect(visible.map((i) => i.id)).toEqual(['main']);
  });

  it('privitak čija glavna stavka nije u redu ostaje vidljiv', () => {
    const { visible } = splitPairedReceipts([
      { id: 'att', doc_type: null, extraction: { related_item_id: 'gone', is_offer_attachment: true } },
    ]);
    expect(visible.map((i) => i.id)).toEqual(['att']);
  });
});
